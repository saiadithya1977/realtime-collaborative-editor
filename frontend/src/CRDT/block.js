import { createCRDT } from "./crdt";
import peerId from "./peer";

export class Block {
  constructor(id) {
    this.id = id;
    this.crdt = createCRDT(peerId);
    this.visibleOrder = [];
  }
    
  insertBetween(leftKey, rightKey, value, forcedKey = null) {
    const key = this.crdt.insertBetween(leftKey, rightKey, value, forcedKey);
  
    if (rightKey === null) {
      this.visibleOrder.push(key);
    } else {
      const index = this.visibleOrder.indexOf(rightKey);
      if (index === -1) this.visibleOrder.push(key);
      else this.visibleOrder.splice(index, 0, key);
    }
    return key;
  }
    
  deleteByKey(key) {
    this.crdt.deleteNode(key);
    const idx = this.visibleOrder.indexOf(key);
    if (idx !== -1) this.visibleOrder.splice(idx, 1);
  }
    
  getText() {
    return this.visibleOrder
    .map(k => this.crdt.nodes.get(k)?.value || "")
    .join("");
  }
    
  getIndexMap() {
    return  [...this.visibleOrder];
  }
    
  split(leftKey) {
    const nodes = this.crdt.nodes;
    const splitNode = nodes.get(leftKey);
    if (!splitNode) return null;
  
    const rightStart = splitNode.next;
    splitNode.next = null;
  
    const newBlock = new Block(`block-${Date.now()}`);
  
    if (!rightStart) return newBlock;
  
    const newNodes = newBlock.crdt.nodes;
    const newRoot = newBlock.crdt.ROOT_KEY;
  
    newNodes.get(newRoot).next = rightStart;
    nodes.get(rightStart).prev = newRoot;
  
    let curr = rightStart;
    while (curr) {
      const node = nodes.get(curr);
      const next = node.next;
      newNodes.set(curr, node);
      nodes.delete(curr);
      curr = next;
    }
  
    return newBlock;
  }
  
  mergeWith(nextBlock) {
    const myNodes = this.crdt.nodes;
    const nextNodes = nextBlock.crdt.nodes;

    let tail = myNodes.get(this.crdt.ROOT_KEY);
    while (tail.next) tail = myNodes.get(tail.next);

    const start = nextNodes.get(nextBlock.crdt.ROOT_KEY).next;
    if (!start) return;

    tail.next = start;
    nextNodes.get(start).prev = tail.id.siteId + ":" + tail.id.counter;
  
    for (const [k, v] of nextNodes.entries()) {
      if (k === nextBlock.crdt.ROOT_KEY) continue;
      myNodes.set(k, v);
    }
  }
}