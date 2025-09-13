import { WebSocketServer } from "ws";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config(); // loads .env into process.env

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// start websocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (socket, req) => {
  console.log("New Exotel call connected!");

  // optional: extract callId from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const callId = url.searchParams.get("callId") || "unknown";

  let audioBuffer = [];

  socket.on("message", async (msg) => {
    // 1. Exotel sends audio (binary PCM/ulaw chunks)
    audioBuffer.push(msg);

    // Simple demo: process when enough audio arrives
    if (audioBuffer.length > 20) {
      const audioData = Buffer.concat(audioBuffer);
      audioBuffer = [];

      try {
        // 2. STT: Caller audio → text
        const sttResp = await openai.audio.transcriptions.create({
          file: new Blob([audioData]),
          model: "gpt-4o-transcribe",
        });

        const callerText = sttResp.text;
        console.log(`Caller (${callId}):`, callerText);

        // 3. GPT: Generate response
        const gptResp = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: callerText }],
        });

        const aiText = gptResp.choices[0].message.content;
        console.log(`AI Response (${callId}):`, aiText);

        // 4. TTS: Text → speech
        const ttsResp = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "verse",
          input: aiText,
        });

        const aiAudio = Buffer.from(await ttsResp.arrayBuffer());

        // 5. Send back audio to Exotel
        socket.send(aiAudio);
      } catch (err) {
        console.error("Processing error:", err);
      }
    }
  });

  socket.on("close", () => {
    console.log(`Call ended: ${callId}`);
  });
});

console.log("✅ WebSocket server running on ws://localhost:8080");

