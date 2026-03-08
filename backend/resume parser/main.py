from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from resume_parser import extract_text_from_pdf
from ai_client import extract_resume_with_groq
from database import save_resume, get_resume
import uuid

app = FastAPI(
    title="Astrax Interview — Resume Parser",
    description="Extracts and structures candidate resume data from PDF uploads.",
    version="1.0.0",
)

# CORS — required so the Chrome extension can POST directly to this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── ENDPOINT 1: Upload & Parse Resume ────────────────────────────────────────

@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_bytes = await file.read()
    raw_text = extract_text_from_pdf(pdf_bytes)

    if not raw_text or len(raw_text) < 50:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from this PDF. Make sure it is not scanned/image-only."
        )

    resume_json = await extract_resume_with_groq(raw_text)

    session_id = str(uuid.uuid4())
    save_resume(session_id, resume_json)

    return {
        "session_id": session_id,
        "resume": resume_json,
        "message": "Resume parsed successfully",
    }


# ── ENDPOINT 2: Retrieve a Previously Parsed Resume ──────────────────────────

@app.get("/get-resume/{session_id}")
async def get_resume_endpoint(session_id: str):
    resume = get_resume(session_id)

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found for this session ID.")

    return {"session_id": session_id, "resume": resume}


# ── HEALTH CHECK ─────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Resume Parser service is running", "port": 8001}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "resume-parser"}


# ── ENTRYPOINT ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # ── CRITICAL FIX ──────────────────────────────────────────────────────────
    # Was hardcoded to port=8000, which is the same port as SSI-Service (STT).
    # Starting both services would cause an "address already in use" crash,
    # or silently route resume traffic to the STT service returning garbage.
    #
    # Port map:
    #   8000 → SSI-Service     (Groq Whisper STT)
    #   8001 → Resume Parser   ← this service
    #   8002 → AI-Intelligence (Groq LLaMA analysis)
    # ──────────────────────────────────────────────────────────────────────────
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)