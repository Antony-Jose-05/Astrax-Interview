import os
import ast

DB_FILE = os.path.join(os.path.dirname(__file__), "resumes_data.py")


def _load_db() -> dict:
    """Load the Python dict from the .py file."""
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            content = f.read().strip()
            if content.startswith("DATA ="):
                content = content[len("DATA ="):].strip()
            return ast.literal_eval(content) if content else {}
    return {}


def _save_db(data: dict):
    """Write the dict back to the .py file."""
    with open(DB_FILE, "w") as f:
        f.write(f"DATA = {repr(data)}\n")


def save_resume(session_id: str, resume_data: dict):
    """Save a parsed resume to the .py file."""
    db = _load_db()
    db[session_id] = resume_data
    _save_db(db)


def get_resume(session_id: str) -> dict | None:
    """Retrieve a parsed resume by session ID."""
    db = _load_db()
    return db.get(session_id, None)
