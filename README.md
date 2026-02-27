# URL Shortener

A Node.js + Express URL shortener with SQLite, password-protected links, API key support, and Swagger docs.

## Project readiness for private GitHub repo

This repository is prepared for private hosting with:

- Environment-based secrets (`.env` from `.env.example`)
- Ignored local/runtime artifacts (`node_modules`, SQLite db, logs)
- CI checks on pull requests and pushes
- Optional container image publishing to GitHub Container Registry (GHCR)

## Local setup

1. Install dependencies:

```bash
npm ci
```

2. Create env file:

```bash
cp .env.example .env
```

3. Update `.env` values:
- `SESSION_SECRET` to a long random value
- `ADMIN_PASSWORD_HASH` to a bcrypt hash

4. Run:

```bash
npm start
```

App runs on `http://localhost:3000` by default.

## Docker setup

```bash
docker compose up --build
```

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/ci-cd.yml`

- **CI job**: `npm ci`, `npm test`, and Docker build validation
- **Publish job**: on push to `main`/`master`, builds and pushes image to:

`ghcr.io/<owner>/<repo>:latest`

and

`ghcr.io/<owner>/<repo>:<commit-sha>`

### Notes for private repositories

- `GITHUB_TOKEN` in Actions is used for GHCR publish.
- Ensure repository Actions permissions allow writing packages:
  - Repo Settings → Actions → General → Workflow permissions → **Read and write permissions**.
- If your organization restricts package publishing, allow GHCR for this repo.

## First push checklist

- Remove tracked local DB file if currently tracked (`urlshortener.db`)
- Ensure `.env` is not committed
- Push to `main` (or `master`) to trigger CI/CD
