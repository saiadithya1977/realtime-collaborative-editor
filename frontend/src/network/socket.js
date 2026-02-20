import clientId from "./clientId";

let socket = null;
let isConnected = false;
let messageQueue = [];
let operationHandler = null;

export function connectSocket(onOperation) {

  operationHandler = onOperation;

  // prevent multiple connections
  if (socket && socket.readyState === WebSocket.OPEN) return;

  socket = new WebSocket("ws://localhost:3001");
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    console.log("Connected to collaboration server");
    isConnected = true;

    // JOIN DOCUMENT
    socket.send(JSON.stringify({
      type: "join",
      documentId: "doc-1"
    }));

    // send queued operations
    while (messageQueue.length > 0) {
      socket.send(JSON.stringify(messageQueue.shift()));
    }
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    /* -------- HISTORY (VERY IMPORTANT) -------- */
    if (data.type === "history") {
      console.log("Received document history:", data.operations.length);

      // replay all past operations
      for (const op of data.operations) {
        operationHandler(op);
      }
      return;
    }

    /* -------- LIVE OPERATION -------- */
    if (data.type === "operation") {
      if(data.clientId  === clientId ) return;
      operationHandler(data.operation);
    }

  };

  socket.onclose = () => {
    console.log("Disconnected from server");
    isConnected = false;
  };
}

/* SAFE SEND */
// export function sendOperation(operation) {

//   const message = {
//     type: "operation",
//     operation
//   };

//   // queue if not ready
//   if (!socket || socket.readyState !== WebSocket.OPEN) {
//     messageQueue.push(message);
//     return;
//   }

//   socket.send(JSON.stringify(message));
// }

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
