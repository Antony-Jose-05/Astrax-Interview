import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv

# Import our providers (we will define these next)
from providers import transcribe_with_groq, transcribe_with_deepgram

load_dotenv()
app = FastAPI()

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    provider = os.getenv("STT_PROVIDER", "GROQ")
    print(f"Connected using {provider}")

    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            
            # Switch logic
            if provider == "GROQ":
                text = await transcribe_with_groq(audio_bytes)
            else:
                text = await transcribe_with_deepgram(audio_bytes)

            if text:
                await websocket.send_json({"transcript": text})

    except WebSocketDisconnect:
        print("Disconnected")