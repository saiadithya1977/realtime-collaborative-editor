const WebSocket = require("ws");
const fs = require("fs");

const PORT = process.env.PORT || 3001;
const wss = new WebSocket.Server({ port: PORT });



console.log("Collaboration server running on port 3001");


const SAVE_FILE = "./document.json";
let documents = {};
if (fs.existsSync(SAVE_FILE)) {
  
  console.log("Document restored from disk");
}



wss.on("connection", (ws) => {

  ws.documentId = null;

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    
    if (data.type === "join") {

      const docId = data.documentId;
      ws.documentId = docId;

      if (!documents[docId]) {
        documents[docId] = [];
      }

      console.log("Client joined:", docId);

     
      ws.send(JSON.stringify({
        type: "history",
        operations: documents[docId]
      }));

      return;
    }

 
    if (data.type === "operation") {

      const docId = ws.documentId;
      if (!docId) return;

      const operation = data.operation;

      
      documents[docId].push(operation);

      
      wss.clients.forEach(client => {
        if (
          client !== ws &&
          client.readyState === WebSocket.OPEN &&
          client.documentId === docId
        ) {
          try {
            client.send(JSON.stringify({
              type: "operation",
              operation
            }));
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

