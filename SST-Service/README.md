STT Backend Service (Groq Whisper-v3)

This is the FastAPI-based Speech-to-Text service. It is designed to handle 2-second audio chunks sent from the Chrome Extension and return near real-time transcriptions.
🛠️ Tech Stack

    Framework: FastAPI

    AI Model: Groq whisper-large-v3

    Protocol: HTTP POST (Multipart/Form-Data)

🚀 Getting Started

    Environment Setup:
    Create a .env file in this folder and add your Groq API key:
    Code snippet

    GROQ_API_KEY=your_key_here

    Install Dependencies:
    Bash

    pip install -r requirements.txt

    Run the Server:
    Bash

    python main.py

    The server will start at http://localhost:8000.

📋 API Specification (for Extension Team)

The backend expects a POST request to /transcribe. This matches the implementation in the team's api.ts.

Request Body (FormData):

    audio: The audio blob (WebM/WAV).

    sequence_id: (string) The chunk order.

    speaker: (string) "candidate" or "interviewer".

Response:
JSON

{
  "transcript": "Hello, this is the transcribed text."
}

🧪 Verification

To verify the backend is working without the extension, run the mock test:
Bash

python test_backend.py