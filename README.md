# ResuME

ResuME is a resume-tailoring application with three connected services:

```text
React frontend → FastAPI backend → OpenAI agent → editable DOCX
```

- `frontend`: React/Vite user interface
- `job-search-api`: authentication, profile uploads, job input, and generated-resume API
- `agent`: evidence-grounded resume agent and Harvard-style DOCX renderer
- `backend`: legacy scaffold; not used by the connected application

## Local setup

Use three terminals. The agent and backend `.env` files must contain the same `AGENT_API_KEY`.

### 1. Agent — port 8001

```sh
cd agent
uv sync
cp -n .env.example .env
# Add your OPENAI_API_KEY and AGENT_API_KEY to .env
uv run uvicorn app.main:app --reload --port 8001 --env-file .env
```

Agent docs: http://127.0.0.1:8001/docs

### 2. Backend — port 8002

```sh
cd job-search-api
uv sync
cp -n .env.example .env
# Set JWT_SECRET and use the same AGENT_API_KEY as the agent
uv run uvicorn main:app --reload --port 8002 --env-file .env
```

Backend docs: http://127.0.0.1:8002/docs

### 3. Frontend — port 5173

```sh
cd frontend
npm install
cp -n .env.example .env.local
npm run dev
```

`frontend/.env.local` must contain:

```env
VITE_API_URL=http://127.0.0.1:8002
```

Open http://localhost:5173. Register, add profile evidence, submit a job description or URL, generate the resume, and download the DOCX.

## Checks

```sh
cd agent && uv run pytest -q
cd job-search-api && JWT_SECRET="test-secret-at-least-32-bytes-long" uv run pytest -q
cd frontend && npm run build && npm run lint
```

Real `.env`, `.env.local`, uploaded documents, generated files, and the runtime SQLite database are ignored by Git.
