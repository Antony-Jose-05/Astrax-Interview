import os
from fastapi import FastAPI, UploadFile, File, Form
from dotenv import load_dotenv

# Import the specific functions from your engine file
from transcript_engine import transcribe_with_groq

load_dotenv()

app = FastAPI()

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
    # Note: content.ts sends 'audio/webm', which Groq handles well
    try:
        transcript = await transcribe_with_groq(audio_bytes)
    except Exception as e:
        return {"transcript": f"Error: {str(e)}"}
    
    # 3. Return the JSON format the extension's background.ts expects
    return {"transcript": transcript}