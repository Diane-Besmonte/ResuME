# ResuME Backend API

Browser-facing FastAPI service for authentication, accounts, PDF/DOCX profile documents, job input, agent orchestration, and protected resume downloads.

## Setup

```sh
uv sync
cp -n .env.example .env
```

Configure `job-search-api/.env`:

```env
JWT_SECRET=replace-with-at-least-32-random-bytes
AGENT_API_KEY=same-key-used-by-agent
AGENT_URL=http://127.0.0.1:8001
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://127.0.0.1:8002
GITHUB_CLIENT_ID=your-github-oauth-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-client-secret
```

## Run — port 8002

```sh
uv run uvicorn main:app --reload --port 8002 --env-file .env
```

Docs: http://127.0.0.1:8002/docs  
Health: http://127.0.0.1:8002/health

Accepted career documents: PDF and DOCX, up to 5 MB. The agent must be running on port 8001 before generating a resume.

GitHub connection: create a GitHub OAuth App with callback URL `http://127.0.0.1:8002/auth/github/callback`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The app requests read-only user identity access, reads public repositories, and stores bounded repository evidence—not the GitHub token.

## Checks

```sh
JWT_SECRET="test-secret-at-least-32-bytes-long" uv run pytest -q
JWT_SECRET="test-secret-at-least-32-bytes-long" uv run ruff check main.py test_main.py
```
