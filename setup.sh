#!/bin/bash
# ─────────────────────────────────────────────────────
# Astrax Interview — One-Click Setup (Mac / Linux)
# Run: chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────

set -e  # stop immediately if any command fails

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Astrax Interview — Backend Setup       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Check Python version ──────────────────────────
echo "▶ Checking Python version..."
PYTHON=$(command -v python3 || command -v python)

if [ -z "$PYTHON" ]; then
  echo "✖ Python not found. Install Python 3.10+ from https://python.org"
  exit 1
fi

PY_VERSION=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
PY_MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")

if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
  echo "✖ Python $PY_VERSION found. Need 3.10 or higher."
  exit 1
fi

echo "✔ Python $PY_VERSION found."
echo ""

# ── 2. Create virtual environment ───────────────────
echo "▶ Creating virtual environment (venv)..."

if [ -d "venv" ]; then
  echo "  venv already exists — skipping creation."
else
  $PYTHON -m venv venv
  echo "✔ venv created."
fi
echo ""

# ── 3. Activate venv ────────────────────────────────
echo "▶ Activating virtual environment..."
source venv/bin/activate
echo "✔ venv activated."
echo ""

# ── 4. Upgrade pip ──────────────────────────────────
echo "▶ Upgrading pip..."
pip install --upgrade pip --quiet
echo "✔ pip up to date."
echo ""

# ── 5. Install all dependencies ─────────────────────
echo "▶ Installing Python dependencies..."
pip install -r requirements.txt
echo "✔ All dependencies installed."
echo ""

# ── 6. Create .env files if missing ─────────────────
echo "▶ Checking .env files..."

create_env() {
  local dir=$1
  local path="$dir/.env"
  if [ ! -f "$path" ]; then
    echo "GROQ_API_KEY=your_groq_api_key_here" > "$path"
    echo "  Created $path — fill in your GROQ_API_KEY"
  else
    echo "  $path already exists — skipping."
  fi
}

create_env "backend/SSI-Service"
create_env "backend/resume parser"
create_env "backend/AI-Intelligence"
echo ""

# ── 7. Done ──────────────────────────────────────────
echo "╔══════════════════════════════════════════╗"
echo "║   ✔ Setup complete!                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add your Groq API key to each .env file:"
echo "     backend/SSI-Service/.env"
echo "     backend/resume parser/.env"
echo "     backend/AI-Intelligence/.env"
echo ""
echo "  2. Start the 3 backend services (3 terminals):"
echo ""
echo "     Terminal 1:  cd backend/SSI-Service     && python main.py"
echo "     Terminal 2:  cd backend/\"resume parser\" && python main.py"
echo "     Terminal 3:  cd backend/AI-Intelligence  && uvicorn api:app --port 8002"
echo ""
echo "  3. Start the extension:"
echo ""
echo "     cd extension/interview-copilot && npm install && npm run dev"
echo ""
echo "  Get your Groq API key at: https://console.groq.com/keys"
echo ""
