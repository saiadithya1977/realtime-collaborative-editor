// Run: npm test (in backend/)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");
const { startServer } = require("./server");

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "collab-")), "doc.json");
let nextPort = 4100 + Math.floor(Math.random() * 500);

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = [];
  ws.on("message", (m) => inbox.push(JSON.parse(m)));
  const next = (type) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const i = inbox.findIndex((m) => m.type === type);
        if (i !== -1) return resolve(inbox.splice(i, 1)[0]);
        if (Date.now() - started > 2000) return reject(new Error(`no ${type} message`));
        setTimeout(poll, 10);
      };
      poll();
    });
  return { ws, inbox, next, opened: new Promise((r) => ws.on("open", r)) };
}

const insert = (key, value) => ({ type: "insert", blockId: "block-1", leftKey: "ROOT:0", rightKey: null, value, key });
const send = (c, msg) => c.ws.send(JSON.stringify(msg));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("relays operations to other clients in the same document only", async () => {
  const port = nextPort++;
  const server = startServer({ port, saveFile: tmpFile() });
  const a = client(port), b = client(port), other = client(port);
  await Promise.all([a.opened, b.opened, other.opened]);
  send(a, { type: "join", documentId: "doc-1" });
  send(b, { type: "join", documentId: "doc-1" });
  send(other, { type: "join", documentId: "doc-2" });
  await Promise.all([a.next("history"), b.next("history"), other.next("history")]);

  send(a, { type: "operation", operation: insert("site-a:1", "h") });
  const relayed = await b.next("operation");
  assert.deepEqual(relayed.operation, insert("site-a:1", "h"));
  await sleep(100);
  assert.equal(a.inbox.length, 0, "sender does not get its own op back");
  assert.equal(other.inbox.length, 0, "other documents are isolated");

  [a, b, other].forEach((c) => c.ws.close());
  await server.close();
});

test("ignores duplicate operations so a re-send after reconnect cannot apply twice", async () => {
  const port = nextPort++;
  const server = startServer({ port, saveFile: tmpFile() });
  const a = client(port), b = client(port);
  await Promise.all([a.opened, b.opened]);
  send(a, { type: "join", documentId: "doc-1" });
  send(b, { type: "join", documentId: "doc-1" });
  await Promise.all([a.next("history"), b.next("history")]);

  send(a, { type: "operation", operation: insert("site-a:1", "x") });
  send(a, { type: "operation", operation: insert("site-a:1", "x") });
  await b.next("operation");
  await sleep(100);
  assert.equal(b.inbox.length, 0);
  assert.equal(server.documents["doc-1"].length, 1);

  a.ws.close(); b.ws.close();
  await server.close();
});

test("persists the operation log and replays it to clients after a restart", async () => {
  const port = nextPort++;
  const saveFile = tmpFile();
  let server = startServer({ port, saveFile });
  const a = client(port);
  await a.opened;
  send(a, { type: "join", documentId: "doc-1" });
  await a.next("history");
  send(a, { type: "operation", operation: insert("site-a:1", "h") });
  send(a, { type: "operation", operation: insert("site-a:2", "i") });
  await sleep(50);
  a.ws.close();
  await server.close();

  server = startServer({ port, saveFile });
  const b = client(port);
  await b.opened;
  send(b, { type: "join", documentId: "doc-1" });
  const history = await b.next("history");
  assert.deepEqual(history.operations.map((o) => o.key), ["site-a:1", "site-a:2"]);

  b.ws.close();
  await server.close();
});

test("loads saves written in the older {operation, clientId} format", async () => {
  const port = nextPort++;
  const saveFile = tmpFile();
  fs.writeFileSync(saveFile, JSON.stringify({ "doc-1": [{ operation: insert("old:1", "a"), clientId: "c1" }] }));
  const server = startServer({ port, saveFile });
  assert.deepEqual(server.documents["doc-1"], [insert("old:1", "a")]);
  await server.close();
});

test("survives malformed messages", async () => {
  const port = nextPort++;
  const server = startServer({ port, saveFile: tmpFile() });
  const a = client(port);
  await a.opened;
  a.ws.send("not json");
  send(a, { type: "join", documentId: "doc-1" });
  const history = await a.next("history");
  assert.deepEqual(history.operations, []);
  a.ws.close();
  await server.close();
});
