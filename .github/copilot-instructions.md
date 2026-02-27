# Copilot Instructions — URL Shortener

## Architecture

Single-process Node.js (Express 5) app with embedded SQLite. No ORM — raw `sqlite3` callback API throughout.

- **`index.js`** — Express app setup, session auth, static files, and the `/:shortId` redirect handler (the core product feature). Initializes DB on startup via `initDb()` callback, then starts listening.
- **`api.js`** — REST router mounted at `/api/v1`. CRUD for URLs, visit metrics, and API key generation. Exports both the router (default) and `authenticateApiKey` middleware.
- **`database.js`** — SQLite connection singleton (`initDb`/`getDb` pattern). Creates tables `urls`, `visits`, `settings` on first run. DB file path from `DATABASE_PATH` env var (default `./urlshortener.db`).
- **`public/`** — Static HTML pages (admin, login, metrics, password prompt, 404). No frontend build step; plain HTML + vanilla JS + Chart.js via CDN.
- **`swagger.yaml`** — OpenAPI 3.0 spec served at `/api-docs` via `swagger-ui-express`.

## Key Patterns

### Dual auth: sessions vs API keys
`/api/v1` routes accept either an authenticated admin session OR an `X-API-Key` header. The middleware chain in `index.js` checks `req.session.isAuthenticated` first; only falls through to `authenticateApiKey` if not session-authed. API keys are bcrypt-hashed and stored in the `settings` table (key = `api_key`).

### Short ID generation
Uses `nanoid` (ESM package, imported dynamically). Default length is 7 characters. Custom IDs are allowed but `admin` and `not-found` are reserved. Collision check is done via DB lookup before insert.

### Password-protected links
Optional bcrypt-hashed password per URL. When a visitor hits `/:shortId` and the URL has a password, they get `password.html` instead of a redirect. The password is submitted via POST to `/:shortId`.

### Link expiration
`expires_in` accepts human-readable durations via the `ms` library (e.g., `"2h"`, `"7d"`). Stored as Unix timestamp in `expires_at`. Expired links are deleted on access (lazy cleanup in the GET `/:shortId` handler).

### Visit tracking
Each redirect increments `urls.visits` and inserts into the `visits` table (timestamp, IP, user-agent). Metrics are viewed at `/metrics/:shortId` (admin-only page) backed by `GET /api/v1/urls/metrics/:shortId`.

## Database Schema

Three tables (created in `database.js`):
- **`urls`**: `id`, `long_url`, `short_id` (unique), `password` (nullable bcrypt hash), `expires_at` (nullable integer), `visits` (counter)
- **`visits`**: `id`, `url_id` (FK → urls.id ON DELETE CASCADE), `visited_at`, `ip_address`, `user_agent`
- **`settings`**: `key` (PK), `value` — currently stores only the hashed API key

## Dev Workflow

```bash
npm ci                 # Install deps
cp .env.example .env   # Set SESSION_SECRET, ADMIN_PASSWORD_HASH, PORT, DATABASE_PATH
npm start              # node index.js — runs on PORT from .env
npm test               # Syntax-check only: node --check on each .js file
docker compose up --build  # Full containerized run with .env
```

There is no test framework — `npm test` only runs `node --check` for syntax validation. No linter is configured.

## Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Server listen port |
| `SESSION_SECRET` | Express session secret |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash for admin login |
| `DATABASE_PATH` | SQLite file path (default `./urlshortener.db`) |
| `NODE_ENV` | `production` enables secure cookies |

## Conventions

- **No TypeScript, no ESM** — CommonJS `require()` throughout (except `nanoid` which is dynamically imported as ESM).
- **Callback-style DB access** — All `sqlite3` calls use callbacks, not promises. Follow this pattern when adding queries.
- **Route reservations** — The `/:shortId` catch-all handler explicitly skips `admin`, `not-found`, `login`, `logout`, `metrics`. New top-level routes must be added to this guard list.
- **API responses** — Errors return `{ error: string }`. Success returns the resource or `{ message: string }`.
- **No migration system** — Schema changes must use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE` with existence checks in `database.js`.
- **Swagger kept in sync** — API changes should be reflected in `swagger.yaml`; it is the API contract for external consumers.
