# Legacy Backend Scaffold

This directory is the original FastAPI scaffold and is not used by the connected ResuME application.

Run the active backend from `../job-search-api` instead:

```sh
cd ../job-search-api
uv sync
uv run uvicorn main:app --reload --port 8002 --env-file .env
```

See `../README.md` for the complete three-terminal setup.
