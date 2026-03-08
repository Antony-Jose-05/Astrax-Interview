import json
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

RESUME_EXTRACTION_PROMPT = """
You are an expert resume analyzer. Extract the key information from 
the resume below and return ONLY a valid JSON object with no extra 
explanation, no markdown, no code fences.

Resume Text:
{raw_resume_text}

Return this exact JSON structure:
{{
  "full_name": "string",
  "email": "string or null",
  "phone": "string or null",
  "total_years_experience": number,
  "current_job_title": "string or null",
  "skills": ["skill1", "skill2"],
  "programming_languages": ["Python", "Java"],
  "tools_and_technologies": ["AWS", "Docker"],
  "past_companies": ["Company A", "Company B"],
  "education": [{{"degree": "BSc Computer Science", "school": "MIT", "year": 2018}}],
  "projects": [{{"name": "Payment Gateway", "description": "one sentence description"}}],
  "certifications": ["AWS Certified Solutions Architect"],
  "summary_sentence": "One sentence summary of this candidate"
}}

Rules:
- If a field is not found, use null for strings, 0 for numbers, [] for arrays
- Do NOT add any fields not listed above
- Return ONLY the JSON. Nothing else.
"""


async def extract_resume_with_groq(raw_text: str) -> dict:
    """
    Sends raw resume text to Groq (LLaMA), gets back structured JSON.
    """
    try:
        chat_completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise resume parser. Always return valid JSON only. No markdown, no explanation."
                },
                {
                    "role": "user",
                    "content": RESUME_EXTRACTION_PROMPT.format(
                        raw_resume_text=raw_text[:8000]
                    )
                }
            ],
            temperature=0.1,
            max_tokens=1500,
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Clean up in case the model adds markdown fences
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]

        resume_json = json.loads(response_text)
        return resume_json

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        return get_empty_resume_structure()

    except Exception as e:
        print(f"Groq API error: {e}")
        return get_empty_resume_structure()


def get_empty_resume_structure():
    """Fallback if Groq fails — never crash the app."""
    return {
        "full_name": "Unknown",
        "email": None,
        "phone": None,
        "total_years_experience": 0,
        "current_job_title": None,
        "skills": [],
        "programming_languages": [],
        "tools_and_technologies": [],
        "past_companies": [],
        "education": [],
        "projects": [],
        "certifications": [],
        "summary_sentence": "Could not parse resume"
    }