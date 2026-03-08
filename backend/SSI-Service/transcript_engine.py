import os
import io
from groq import Groq
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

# Initialize Clients
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Note: If you choose to use Deepgram, you'll need: pip install deepgram-sdk
# from deepgram import DeepgramClient, PrerecordedOptions

async def transcribe_with_groq(audio_bytes: bytes) -> str:
    """Sends audio chunks to Groq Whisper."""
    if len(audio_bytes) < 1000: # 1KB minimum for any useful audio
        return ""
    try:
        # Groq needs a 'file-like' object with a filename
        # Change "chunk.wav" to "chunk.webm"
        audio_file = ("chunk.webm", audio_bytes)
        
        response = groq_client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-large-v3", 
            response_format="verbose_json",
            language="en"
        )
        transcript = response.text
        print(f"[Engine] Groq Result: \"{transcript}\"")
        return transcript
    except Exception as e:
        error_msg = str(e)
        if "no audio track found" in error_msg.lower():
            # This happens during silence or initial setup; keep it quiet
            return ""
        print(f"Groq Error: {e}")
        return ""

async def transcribe_with_deepgram(audio_bytes: bytes) -> str:
    """Placeholder for Deepgram logic if you switch later."""
    # When you are ready for Deepgram, we will fill this with 
    # the Deepgram SDK logic. For now, it's a safety backup.
    return "Deepgram integration pending..."