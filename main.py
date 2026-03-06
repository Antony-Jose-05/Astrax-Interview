from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from resume_parser import extract_text_from_pdf
from ai_client import extract_resume_with_groq  # ← changed this
from database import save_resume, get_resume
import uuid

app = FastAPI()

# CORS — this is critical so the frontend/extension can talk to you
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ENDPOINT 1: Upload Resume ──
@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")
    
    pdf_bytes = await file.read()
    raw_text = extract_text_from_pdf(pdf_bytes)
    
    if not raw_text or len(raw_text) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")
    
    resume_json = await extract_resume_with_groq(raw_text)  # ← changed this
    
    session_id = str(uuid.uuid4())
    save_resume(session_id, resume_json)
    
    return {
        "session_id": session_id,
        "resume": resume_json,
        "message": "Resume parsed successfully"
    }


# ── ENDPOINT 2: Get Resume ──
@app.get("/get-resume/{session_id}")
async def get_resume_endpoint(session_id: str):
    resume = get_resume(session_id)
    
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    
    return {"session_id": session_id, "resume": resume}


# ── HEALTH CHECK ──
@app.get("/health")
async def health():
    return {"status": "running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)