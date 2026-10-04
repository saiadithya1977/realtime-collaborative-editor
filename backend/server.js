const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

/**
 * Collaboration server: one operation log per document.
 * - Clients send {type:"join", documentId} and receive the full log ("history").
 * - Clients send {type:"operation", operation}; it is appended and relayed to
 *   everyone else in the same document.
 * - The log is persisted to disk so documents survive a server restart.
 * - Operations are de-duplicated by (type, key), so a client that re-sends after
 *   a reconnect can never apply the same edit twice.
 */
function startServer({ port = process.env.PORT || 3001, saveFile = process.env.DOC_FILE || path.join(__dirname, "document.json") } = {}) {
  const documents = loadDocuments(saveFile);
  const seen = {};
  for (const [docId, ops] of Object.entries(documents)) {
    seen[docId] = new Set(ops.map(opId));
  }

  let saveTimer = null;
  let saving = Promise.resolve();
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saving = saveDocuments(saveFile, documents).catch((e) => console.error("Save failed:", e.message));
    }, 200);
  };

  const wss = new WebSocket.Server({ port });
  console.log(`Collaboration server running on port ${port}`);

  wss.on("connection", (ws) => {
    ws.documentId = null;

    ws.on("message", (message) => {
      let data;
      try {
        data = JSON.parse(message);
      } catch {
        return; // ignore malformed messages instead of crashing the server
      }

      if (data.type === "join") {
        const docId = String(data.documentId || "");
        if (!docId) return;
        ws.documentId = docId;
        documents[docId] ??= [];
        seen[docId] ??= new Set();
        console.log("Client joined:", docId);
        ws.send(JSON.stringify({ type: "history", operations: documents[docId] }));
        return;
      }

      if (data.type === "operation") {
        const docId = ws.documentId;
        const operation = data.operation;
        if (!docId || !operation || !operation.key) return;

        const id = opId(operation);
        if (seen[docId].has(id)) return; // already applied: duplicate re-send
        seen[docId].add(id);
        documents[docId].push(operation);
        scheduleSave();

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.documentId === docId) {
            try {
              client.send(JSON.stringify({ type: "operation", operation }));
            } catch (e) {
              console.log("Send failed");
            }
          }
        });
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected from", ws.documentId);
      ws.documentId = null;
    });
  });

  return {
    wss,
    documents,
    /** Stops the server after flushing any pending save. */
    async close() {
      clearTimeout(saveTimer);
      await saving;
      await saveDocuments(saveFile, documents);
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}

function opId(op) {
  return `${op.type}:${op.key}`;
}

function loadDocuments(file) {
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const docs = {};
    for (const [docId, entries] of Object.entries(raw)) {
      // Older saves wrapped each operation as {operation, clientId}.
      docs[docId] = entries.map((e) => (e && e.operation ? e.operation : e)).filter(Boolean);
    }
    console.log("Document restored from disk");
    return docs;
  } catch (e) {
    console.error(`Could not read ${file}, starting empty:`, e.message);
    return {};
  }
}

// Write to a temp file and rename, so a crash mid-write never corrupts the save.
async function saveDocuments(file, documents) {
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(documents));
  await fs.promises.rename(tmp, file);
}

if (require.main === module) {
  const server = startServer();
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { startServer };
