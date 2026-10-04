import clientId from "./clientId";

const DEFAULT_URL = import.meta.env?.VITE_WS_URL || "ws://localhost:3001";
const DOCUMENT_ID = "doc-1";

// Reconnect with exponential backoff: 0.5s, 1s, 2s, 4s ... capped at 10s, plus jitter
// so many clients do not reconnect to a restarted server in the same instant.
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;

let socket = null;
let url = DEFAULT_URL;
let messageQueue = [];      // operations made while offline, flushed on reconnect
let operationHandler = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let manuallyClosed = false;
let status = "connecting";
const statusListeners = new Set();

function setStatus(next) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener(status));
}

/** Subscribe to "connecting" | "connected" | "reconnecting" | "closed". Returns an unsubscribe function. */
export function onStatusChange(listener) {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}

export function reconnectDelay(attempt) {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return exponential / 2 + Math.random() * (exponential / 2);
}

export function connectSocket(onOperation, options = {}) {
  operationHandler = onOperation;
  if (options.url) url = options.url;
  manuallyClosed = false;

  // prevent multiple connections
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  open();
}

function open() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    console.log("Connected to collaboration server");
    reconnectAttempts = 0;
    setStatus("connected");

    // (Re)join the document. The server answers with the full operation log, which
    // brings this client up to date with every edit made while it was offline.
    // Replaying it is safe because applying an operation twice is a no-op.
    socket.send(JSON.stringify({ type: "join", documentId: DOCUMENT_ID }));

    // Send edits made while offline.
    while (messageQueue.length > 0) {
      socket.send(JSON.stringify(messageQueue.shift()));
    }
  };

  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    /* -------- HISTORY: full resync on join / rejoin -------- */
    if (data.type === "history") {
      console.log("Received document history:", data.operations.length);
      for (const op of data.operations) {
        operationHandler?.(op);
      }
      return;
    }

    /* -------- LIVE OPERATION -------- */
    if (data.type === "operation") {
      if (data.clientId === clientId) return;
      operationHandler?.(data.operation);
    }
  };

  socket.onclose = () => {
    if (manuallyClosed) {
      setStatus("closed");
      return;
    }
    const delay = reconnectDelay(reconnectAttempts++);
    console.log(`Disconnected from server, reconnecting in ${Math.round(delay)} ms`);
    setStatus("reconnecting");
    reconnectTimer = setTimeout(open, delay);
  };

  // An error is always followed by close, which schedules the reconnect.
  socket.onerror = () => {};
}

/** Closes the connection on purpose (no reconnect), e.g. when the editor unmounts. */
export function disconnectSocket() {
  manuallyClosed = true;
  clearTimeout(reconnectTimer);
  socket?.close();
}

export function sendOperation(operation) {
  const message = {
    type: "operation",
    clientId,
    operation
  };

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    messageQueue.push(message);
    return;
  }

  socket.send(JSON.stringify(message));
}
