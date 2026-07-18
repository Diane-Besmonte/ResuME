# ResuME Agent API

Private service that converts candidate evidence and job details into a grounded, ATS-friendly resume and editable Harvard-style DOCX.

## Setup

```sh
uv sync
cp -n .env.example .env
```

Configure `agent/.env`:

```env
OPENAI_API_KEY=your-openai-api-key
AGENT_API_KEY=shared-private-service-key
OPENAI_MODEL=gpt-4.1-mini
GITHUB_TOKEN=
```

`GITHUB_TOKEN` is optional and increases the public GitHub API rate limit.

## Run

```sh
uv run uvicorn app.main:app --reload --port 8001 --env-file .env
```

Docs: http://127.0.0.1:8001/docs

## Backend contract

The backend calls `POST /resume-generations` with `Authorization: Bearer $AGENT_API_KEY` and normalized profile/job data. The response contains:

- Structured resume content
- Evidence-backed requirement matches
- Compatibility score
- Authenticated DOCX download URL

The backend owns user authentication, uploads, text extraction, job/portfolio retrieval, generated-file ownership, and browser-facing downloads. Browsers must not call this service directly.

## Checks

```sh
uv run pytest -q
uvx ruff check app tests
```

DOCX is the editable source. PDF export is intentionally deferred until required.
