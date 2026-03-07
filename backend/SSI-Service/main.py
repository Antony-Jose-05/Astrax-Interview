import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import the specific functions from your engine file
from transcript_engine import transcribe_with_groq

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "SST Service is running"}

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    # These match the fields from the team's api.ts
    sequence_id: str = Form(...), 
    speaker: str = Form(...)
):
    # 1. Read the audio bytes from the incoming multipart request
    audio_bytes = await audio.read()
    
    # 2. Pass to your Groq engine
    if len(audio_bytes) < 500: # Typical WebM header is ~100-200 bytes, real audio starts later
        print(f"[SST-Service] Chunk {sequence_id} is too small ({len(audio_bytes)} bytes) — likely empty or header-only. Skipping.")
        return {"transcript": ""}

    print(f"[SST-Service] Transcribing chunk {sequence_id} (size: {len(audio_bytes)} bytes)...")
    # Note: content.ts sends 'audio/webm', which Groq handles well
    try:
        transcript = await transcribe_with_groq(audio_bytes)
        print(f"[SST-Service] Transcription for {sequence_id}: \"{transcript}\"")
    except Exception as e:
        print(f"[SST-Service] Error for chunk {sequence_id}: {e}")
        return {"transcript": ""}
    
    # 3. Return the JSON format the extension's background.ts expects
    return {"transcript": transcript}