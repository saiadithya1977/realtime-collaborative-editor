// Reconnection test against the real collaboration server.
// Run: npm test (in frontend/)
import { afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { connectSocket, disconnectSocket, onStatusChange, reconnectDelay, sendOperation } from "./socket";
import { createCRDT } from "../CRDT/crdt";

const { startServer } = createRequire(import.meta.url)("../../../backend/server.js");

const port = 4700 + Math.floor(Math.random() * 200);
const saveFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "collab-")), "doc.json");

async function waitFor(check, timeoutMs = 8000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const insert = (key, value) => ({ type: "insert", blockId: "block-1", leftKey: "ROOT:0", rightKey: null, value, key });

describe("socket reconnection", () => {
  let server;
  afterAll(async () => {
    disconnectSocket();
    await server?.close();
  });

  it("reconnects after the server restarts, sends offline edits and resyncs history", async () => {
    server = startServer({ port, saveFile });
    const received = [];
    let status = "";
    onStatusChange((s) => (status = s));

    connectSocket((op) => received.push(op.key), { url: `ws://localhost:${port}` });
    await waitFor(() => status === "connected");

    sendOperation(insert("me:1", "a"));
    await waitFor(() => server.documents["doc-1"]?.length === 1);

    // Server goes down: the client notices and starts reconnecting.
    await server.close();
    await waitFor(() => status === "reconnecting");

    // Edits made while offline are queued, not lost.
    sendOperation(insert("me:2", "b"));

    // Server comes back on the same port with the saved log.
    server = startServer({ port, saveFile });
    await waitFor(() => status === "connected");

    // The offline edit reached the server, and the client received the full history on rejoin.
    await waitFor(() => server.documents["doc-1"].length === 2);
    expect(server.documents["doc-1"].map((o) => o.key)).toEqual(["me:1", "me:2"]);
    expect(received).toContain("me:1");
  });

  it("backs off exponentially with jitter, capped at 10 seconds", () => {
    for (let i = 0; i < 50; i++) {
      expect(reconnectDelay(0)).toBeGreaterThanOrEqual(250);
      expect(reconnectDelay(0)).toBeLessThanOrEqual(500);
      expect(reconnectDelay(3)).toBeGreaterThanOrEqual(2000);
      expect(reconnectDelay(3)).toBeLessThanOrEqual(4000);
      expect(reconnectDelay(20)).toBeLessThanOrEqual(10_000);
    }
  });
});

describe("CRDT idempotency", () => {
  it("applying the same remote insert twice (history replay) changes nothing", () => {
    const crdt = createCRDT("me");
    const k1 = crdt.insertBetween(crdt.ROOT_KEY, null, "h", "peer:1");
    crdt.insertBetween(k1, null, "i", "peer:2");
    crdt.insertBetween(crdt.ROOT_KEY, null, "h", "peer:1"); // replayed
    crdt.insertBetween(k1, null, "i", "peer:2");            // replayed
    expect(crdt.traverse().text).toBe("hi");
  });

  it("buffers an out-of-order insert until its neighbour arrives", () => {
    const crdt = createCRDT("me");
    crdt.insertBetween("peer:1", null, "i", "peer:2"); // arrives before peer:1
    expect(crdt.traverse().text).toBe("");
    crdt.insertBetween(crdt.ROOT_KEY, null, "h", "peer:1");
    expect(crdt.traverse().text).toBe("hi");
  });
});
