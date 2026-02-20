import React, { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";

import { connectSocket, sendOperation } from "./network/socket";
import { documentModel } from "./CRDT/document";
import { positionToCRDT } from "./CRDT/mapping";
import { Annotation } from "@codemirror/state";


const remoteEdit = Annotation.define();


const wrapTheme = EditorView.theme({
  ".cm-content": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    overflowWrap: "anywhere"
  },
  ".cm-line": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    overflowWrap: "anywhere"
  },
  ".cm-scroller": {
    overflowX: "hidden"
  }
});

export default function Editor() {

  const ref = useRef(null);
  const viewRef = useRef(null);
  const applying = useRef(false);
  const connected = useRef(false);
  const pendingDeletes = useRef([]);
  const pendingRemoteOps = useRef([]);
  const editorReady = useRef(false);

 

  function tryApplyPendingDeletes(block) {
    pendingDeletes.current = pendingDeletes.current.filter(op => {
      const exists = block.crdt.nodes.has(op.key);
      if (exists) {
        block.deleteByKey(op.key);
        return false;
      }
      return true;
    });
  }


  function handleRemoteOperation(op) {
    console.log("REMOTE OP RECEIVED:", op, Date.now());
    document.title = "REMOTE @" + new Date().toLocaleTimeString();

    if (!editorReady.current || !viewRef.current) {
      pendingRemoteOps.current.push(op);
      return;
    }

    const block = documentModel.blocks[0];
    if (!viewRef.current) return;

    applying.current = true;
   
    if (op.type === "insert") {

     
      block.insertBetween(op.leftKey, op.rightKey, op.value, op.key);

     
      const { indexMap } = block.getIndexMap
        ? { indexMap: block.getIndexMap() }
        : block.crdt.traverse();

      const pos = indexMap.indexOf(op.key);
      if (pos === -1) {
        applying.current = false;
        return;
      }

      
      viewRef.current.dispatch({
        changes: { from: pos, insert: op.value },
        annotations: remoteEdit.of(true)
      });

      applying.current = false;
      return;
    }

    
    if (op.type === "delete") {

      
      const { indexMap } = block.getIndexMap
        ? { indexMap: block.getIndexMap() }
        : block.crdt.traverse();

      const pos = indexMap.indexOf(op.key);

      if (pos === -1) {
       
        block.deleteByKey(op.key);
        applying.current = false;
        return;
      }

      
      viewRef.current.dispatch({
        changes: { from: pos, to: pos + 1 },
        annotations: remoteEdit.of(true)
      });

      
      block.deleteByKey(op.key);

      
      requestAnimationFrame(() => {
        viewRef.current?.requestMeasure();
      });

      applying.current = false;
      return;
    }
  }

  useEffect(() => {

    if (!connected.current) {
      connectSocket(handleRemoteOperation);
      connected.current = true;
    }

    const startState = EditorState.create({
      doc: "",

      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        wrapTheme,

        EditorView.updateListener.of(update => {

          if (!update.docChanged) return;
          if (applying.current) return;

          if (update.transactions.some(tr => tr.annotation(remoteEdit))) return;

          update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {

            if (toA > fromA && inserted.length === 0) {

              const block = documentModel.blocks[0];
              const indexMap = block.getIndexMap();

              for (let pos = fromA; pos < toA; pos++) {

                const key = indexMap[pos];
                if (!key) continue;

                const op = documentModel.localDelete(block.id, key);
                sendOperation(op);
              }
            }

            if (inserted.length > 0) {

              let { block, leftKey, rightKey } = positionToCRDT(fromA);

              for (const ch of inserted.toString()) {

                const op = documentModel.localInsert(
                  block.id,
                  leftKey,
                  rightKey,
                  ch
                );

                console.log("LOCAL INSERT SENT →", op);
                sendOperation(op);


                leftKey = op.key;
                rightKey = null;
              }
            }
          });

          console.log("EDITOR:", update.state.doc.toString());
          console.log("CRDT  :", documentModel.getText());
        })
      ]
    });

    viewRef.current = new EditorView({
      state: startState,
      parent: ref.current
    });
    editorReady.current = true;

    pendingRemoteOps.current.forEach(op => handleRemoteOperation(op));
    pendingRemoteOps.current = [];


    return () => viewRef.current.destroy();

  }, []);

  return (
    <div
      ref={ref}
      style={{
        height: "100vh",
        border: "1px solid #aaa",
        overflow: "hidden"
      }}
    />
  );
}
