# Real-Time Collaborative Editor

A collaborative text editor where several people edit the same document at once and every copy converges
to the same text, built on a sequence CRDT implemented from scratch.

**Stack:** React 19 · CodeMirror 6 · Vite · Tailwind CSS · Electron · Node.js · WebSockets (`ws`)

## How it works

```
 Editor (React + CodeMirror)          Sync server (Node.js, ws)
 ┌───────────────────────────┐        ┌──────────────────────────────┐
 │ local edit → CRDT op      │──op──▶ │ de-duplicate, append to log, │
 │ remote op  → CRDT → view  │◀─op─── │ relay to the document's room │
 │ offline queue + reconnect │◀─hist─ │ persist log to document.json │
 └───────────────────────────┘        └──────────────────────────────┘
```

### CRDT (`frontend/src/CRDT/crdt.js`)

- Every character is a node with a globally unique id `siteId:counter`, linked to its left and right
  neighbours. Deletes are tombstones, so ids stay stable.
- An insert whose neighbour has not arrived yet is buffered and applied as soon as it can be, so
  operations can arrive in any order.
- Applying an insert that is already present is a no-op. That makes replaying history safe, which is what
  reconnection relies on.

### Sync server (`backend/server.js`)

- One operation log per document (rooms by `documentId`). A client that joins receives the full log and
  replays it, so late joiners reach the current state.
- Operations are de-duplicated by `(type, key)`, so a re-send can never be applied twice.
- The log is written to `document.json` (write to a temp file, then rename) and restored on startup, so
  documents survive a server restart.

### Reconnection (`frontend/src/network/socket.js`)

- When the connection drops, the client reconnects with exponential backoff and jitter
  (0.5 s, 1 s, 2 s … capped at 10 s).
- Edits made while offline are queued and sent once the connection is back.
- On reconnect the client rejoins the document and replays the history to pick up everything it missed.
- A status badge in the editor shows Connected / Reconnecting.

## Running locally

```bash
# Sync server (ws://localhost:3001)
cd backend && npm install && npm start

# Editor in the browser (http://localhost:5173)
cd frontend && npm install && npm run dev

# Or as a desktop app
cd frontend && npm run electron:dev
```

Set `VITE_WS_URL` to point the editor at a different sync server.

## Tests

```bash
cd backend && npm test    # relay, room isolation, de-duplication, persistence across restart, bad input
cd frontend && npm test   # reconnect after a server restart, offline queue, history resync, CRDT idempotency
```

The reconnection test starts the real sync server, stops it, makes an edit while offline, restarts it, and
checks that the client reconnects, the offline edit reaches the server, and history is replayed.
