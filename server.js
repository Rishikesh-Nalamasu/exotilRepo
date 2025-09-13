import { WebSocketServer } from "ws";

// start websocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (socket, req) => {
  console.log("✅ New client connected!");

  // optional: extract clientId from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientId = url.searchParams.get("id") || "guest";

  socket.on("message", (msg) => {
    console.log(`📩 Message from ${clientId}:`, msg.toString());

    // Echo the message back to the client
    socket.send(`Echo from server: ${msg}`);
  });

  socket.on("close", () => {
    console.log(`❌ Client disconnected: ${clientId}`);
  });
});

console.log("🚀 WebSocket server running on ws://localhost:8080");
