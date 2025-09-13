import { WebSocketServer } from "ws";
import OpenAI from "openai";
import dotenv from "dotenv";
import { Readable } from "stream";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// helper: turn Buffer into stream (needed for STT)
function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  console.log("📞 New Exotel call connected!");

  let callId = "unknown";

  socket.on("message", async (rawMsg) => {
    let data;
    try {
      data = JSON.parse(rawMsg.toString());
    } catch (e) {
      console.error("❌ Non-JSON message:", rawMsg.toString());
      return;
    }

    // handle Exotel events
    if (data.event === "connected") {
      console.log("✅ Call connected:", data);
    }

    if (data.event === "start") {
      callId = data.start?.callSid || "unknown";
      console.log("▶️ Call started:", callId);
    }

    if (data.event === "media") {
      try {
        // 1. Decode Base64 PCM audio from Exotel
        const audioBuffer = Buffer.from(data.media.payload, "base64");

        // 2. Send to OpenAI STT
        const sttResp = await openai.audio.transcriptions.create({
          file: bufferToStream(audioBuffer),
          model: "gpt-4o-transcribe",
        });

        const callerText = sttResp.text;
        console.log(`👤 Caller (${callId}):`, callerText);

        // 3. GPT response
        const gptResp = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: callerText }],
        });

        const aiText = gptResp.choices[0].message.content;
        console.log(`🤖 AI (${callId}):`, aiText);

        // 4. TTS
        const ttsResp = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "verse",
          input: aiText,
        });

        const aiAudio = Buffer.from(await ttsResp.arrayBuffer());

        // 5. Send back as Base64 JSON media event
        socket.send(
          JSON.stringify({
            event: "media",
            streamSid: data.streamSid,
            media: { payload: aiAudio.toString("base64") },
          })
        );
      } catch (err) {
        console.error("❌ Processing error:", err);
      }
    }

    if (data.event === "stop") {
      console.log("⏹️ Call stopped:", callId);
    }
  });

  socket.on("close", () => {
    console.log(`☎️ Call ended: ${callId}`);
  });
});

console.log(`✅ WebSocket server running on ws://localhost:${PORT}`);
