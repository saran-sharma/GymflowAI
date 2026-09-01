# GymFlow AI — security model

Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md). This is the reference for
how GymFlow authenticates, authorises, isolates branches, and handles secrets —
and for what has **not** been verified because it needs real infrastructure.

Last reviewed: 2026-09-01 (desktop assessment, physical gym PC unavailable).

---

## 1. Threat model

GymFlow holds trainer HR/discipline data, member training records, member
contact details, and — once InBody is on — body-composition readings. It does
**not** hold payment card data (Yoactiv/Razorpay own that) and never receives a
biometric template (the fingerprint terminal matches on-device and sends only a
numeric enroll id).

Adversaries considered:

| Actor | Capability | Primary defence |
| --- | --- | --- |
| Anonymous internet | Reach the API, the docs, `/health` | Bearer auth on everything except `/health` and login; login rate-limited; docs off in production |
| Authenticated **member** | A valid token, a phone they control | Role checks + per-object ownership checks on every `{id}` route |
| Authenticated **trainer** | As above, plus trainer endpoints | Branch scope + "own record only" checks; no roster/rule/settings write |
| Authenticated **branch manager** | Management of one branch | `assert_branch_access` on every branch-scoped read and write |
| Compromised gym PC (InBody / X2008 agent) | The shared secret in its push URL | Secret authenticates the push only; the endpoint parses and matches server-side, writes nothing else; source CSV never trusted for identity beyond phone match |
| Stolen device | An unexpired access token (≤30 min) | Short access token; refresh tokens are individually revocable rows; account lock on brute force |
| Malicious PR (supply chain) | Run code in CI | `permissions: contents: read`; no secrets exposed to PR jobs; EAS build is `workflow_dispatch` only |

Out of scope for this document: physical security of the gym desk tablet that
displays the branch QR, and Yoactiv's own security posture.

---

## 2. Trust boundaries

```
public internet ──► API (bearer)           every route except /health, /auth/login, /docs*
anon           ──► /auth/login             rate-limited, generic failure message, timing-equalised
mobile app     ──► API                     client is fully untrusted; it never holds a DB credential
member         ──► member APIs             own objects only
trainer        ──► trainer APIs            own record + own branch
manager/owner  ──► admin APIs              require_management / require_admin
branch A       ──► branch B                assert_branch_access — refuses, never silently empties
API            ──► PostgreSQL              SQLAlchemy ORM only, parameterised; no raw string SQL
API            ──► integrations            all disabled by default; a disabled provider raises
gym PC agent   ──► /inbody/ingest, /agent/*  shared secret in URL path, constant-time compared
X2008 terminal ──► /hardware/fingerprint/… shared secret in URL path (or IP+serial in dev-only mode)
CI             ──► deploy                  Pages deploy only on push to main; no prod deploy in CI
developer      ──► Codespace               throwaway SECRET_KEY generated per container; demo data only
public GitHub  ──► production config       none — every real value is env-only, `.env` is gitignored
```

---

## 3. Authentication

- **Passwords**: bcrypt (`passlib`, 12 rounds in production, 4 in CI). Plaintext
  is never stored or logged. A missing hash still burns a verify cycle so
  "unknown account" and "wrong password" take the same time.
- **Tokens**: JWT via **PyJWT** (`PyJWT==2.13.0`, HS256 — migrated off the
  unmaintained `python-jose` on 2026-09-01, which also removed the
  `ecdsa`/`rsa`/`pyasn1`/`cryptography` sub-tree and its advisories).
  Access token 30 min, refresh token 30 days. `decode_token` pins
  `algorithms=["HS256"]` explicitly, so a token presenting `alg: none` or an
  asymmetric algorithm is rejected (`InvalidAlgorithmError`); `exp` is verified
  automatically; the custom `typ` claim is checked in our code, so an access
  token cannot be replayed as a refresh token or vice versa. The role in the
  token is a *hint*; `get_current_user` re-reads the database row every
  request, so a revoked role or a deactivated account stops working
  immediately, not at expiry.
- **Refresh / logout**: refresh tokens are rows (`refresh_tokens.jti`), so a
  logout or a compromise can revoke one token without touching the others.
- **Brute force**: `RATE_LIMIT_LOGIN` (default 10/min) per IP+token bucket, and
  after `MAX_FAILED_LOGINS` (8) the account is locked for 15 minutes — which
  also blunts an IP-rotating attack.
- **Enumeration**: login returns one message ("Incorrect email or password")
  for unknown-account, wrong-password and inactive-account alike.
- **PIN**: bcrypt-hashed, 4–8 digits, **never accepted by `/auth/login`** — it
  is only ever a second factor on trainer check-in, always paired with the
  branch QR or the check-in rate limit.

---

## 4. Authorisation

Two layers, both server-side, in `app/core/deps.py` and per-router helpers:

1. **Function level** — `require_admin` / `require_management` / `require_trainer`
   / `require_member` as FastAPI dependencies on privileged routes. The mobile
   app hides what a role cannot use; that is cosmetic only.
2. **Object level** — every route that takes an id resolves the object and then
   calls an explicit check before returning or mutating it:
   - `assert_can_read_member` / `assert_can_write_member` (journeys, workouts,
     plans, programmes, PT, progress): a member sees only themselves; a trainer
     only members at their own branch; a member can never write staff-authored
     data.
   - `assert_branch_access` (trainers, branches, payments, corrections, tasks,
     alerts, reports, performance): owner/super-admin see all; a manager only
     their branch; a `?branch_id=` pointing outside is a 403, never ignored.
   - "own record only" for trainers viewing trainer data; "own request only"
     for withdrawing a correction.

Nested objects are re-checked against their parent (`day.program.member_id ==
member_id`, `set.item.session ==` the authorised session), so a valid child id
from another member is a 404, not a leak.

**Members are refused all trainer discipline/roster data** — `/trainers/{id}`,
`/trainers/{id}/shifts`, `/trainers/{id}/attendance`, `/performance/trainers/{id}`,
`/sessions/trainers/{id}` all return 403 to a member. (`/trainers/{id}` and its
two siblings were hardened on 2026-09-01; the others already refused members.)

---

## 5. Branch isolation

`assert_branch_access(user, branch_id)` is the single predicate. A disabled
integration or an out-of-scope branch **raises** rather than returning `[]`,
because an empty list reads as "there is no data" — a claim GymFlow will not
make. `tests/backend/test_authorization.py` pins the cross-branch cases
(manager, trainer, member, `?branch_id=` filter bypass).

---

## 6. QR / PIN check-in model

- The branch QR is `GFQ1.<branch_id>.<window>.<hmac16>` where the HMAC is
  `HMAC-SHA256(branch_secret, "<branch_id>:<window>")` truncated to 16 hex
  chars. `QR_WINDOW_SECONDS` = 60. `verify_token` accepts only the current and
  the immediately previous window and uses `hmac.compare_digest`.
- The **branch secret never leaves the server**. Only management can render the
  QR (`GET /branches/{id}/checkin-qr` is `require_management`); a trainer's own
  phone is refused.
- A photographed code dies within ~2 minutes. The device supplies the scanned
  string and the branch; **it never supplies a timestamp** — check-in time is
  `now_utc()` on the server, always (`app/core/clock.py`).
- Duplicate check-in, check-out without check-in, duplicate check-out, wrong
  branch, and check-ins far outside the shift window are all refused with an
  actionable message. A trainer can request a correction; only
  `require_management` can approve one, and approval is the *only* path that
  edits an attendance record.

---

## 7. Secrets policy

- **Every real secret is environment-only.** `backend/.env` is gitignored
  (`.env`, `.env.*`, with `!.env.example`). `config.py` carries dev-only
  defaults and `assert_production_safe()` refuses to boot in
  production/staging if `SECRET_KEY`, `DATABASE_URL`, `DEBUG`, `CORS_ORIGINS`,
  `SEED_DEMO_DATA`, the progress-photo path, or an enabled-integration secret
  is still at its dev value.
- **Vendor artefacts are gitignored on purpose**: `*.postman_collection.json`,
  `*.xlsx`, `*.csv`, `*.msi` — the comment in `.gitignore` says why ("Vendor
  API collections carry live keys"). Confirmed 2026-09-01: none of these are in
  the repo or its history.
- **`EXPO_PUBLIC_*` is public.** Only `EXPO_PUBLIC_API_URL` and
  `EXPO_PUBLIC_PUSH_ENABLED` are used, and neither is a secret. No token, key
  or signing credential is ever put behind that prefix.
- **Machine credentials** (`INBODY_INGEST_SHARED_SECRET`,
  `FINGERPRINT_ADMS_SHARED_SECRET`, `FINGERPRINT_COMM_KEY`) are distinct
  per-integration values, never a user/Owner password, redacted from every log
  line by the agents' logging filters. When the owning integration is enabled,
  `assert_production_safe()` enforces a **≥ 32-char floor** on
  `INBODY_INGEST_SHARED_SECRET` / `FINGERPRINT_ADMS_SHARED_SECRET`, refuses a
  value equal to `SECRET_KEY`, and refuses the two being equal to each other.
- **CI secret scanning**: `.github/workflows/security.yml` runs `gitleaks` over
  the full history on every PR and weekly, with `.gitleaks.toml` allowlisting
  only the intentional placeholders (`DEV_SECRET`, `.env.example`, the CI
  throwaway key, test fixtures). A real credential anywhere else fails the job.
- **The Yoactiv `API_Key`** currently lives only in a local (gitignored)
  Postman collection and was exposed in a chat transcript during the
  2026-08-30 gym session. It **must be rotated with Yoactiv before
  `YOACTIV_ENABLED=true`** (already recorded in `NEXT_STEPS.md`). It is not
  currently usable — the integration is off and the vendor host sits behind
  IIS Basic auth.

---

## 8. Deployment security

Enforced by `assert_production_safe()` and `app/main.py`:

- Docs (`/docs`, `/openapi.json`) are served only when not production.
- `CORSMiddleware` from `CORS_ORIGINS` (explicit list required in production);
  `TrustedHostMiddleware` in production.
- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, plus HSTS in
  production.
- The generic 500 handler returns `{"code":"server_error"}` — no stack trace,
  no exception text. The 422 handler lists field names and error types but
  never echoes submitted values.
- **Trusted proxy**: set `RATE_LIMIT_TRUSTED_PROXIES` to the reverse proxy's
  egress IP(s). The API trusts `X-Forwarded-For` for client identity (and
  therefore rate-limit bucketing) **only** when the direct socket peer is one
  of those IPs; otherwise the header is ignored and the socket peer is used.
  Empty (the default, and Codespaces) = never trust the header. See
  `docs/DEPLOYMENT.md`.

TLS termination, the load balancer, DB-at-rest encryption, backups, and a
shared rate-limit store are **infrastructure responsibilities not visible from
this repository** — see §11.

---

## 9. Secure development rules

1. Every new `{id}` route resolves the object and calls `assert_can_*` /
   `assert_branch_access` **before** returning or mutating it. A route with a
   path id and only `Depends(get_current_user)` and no in-body check is a bug.
2. New privileged routes get `require_management` / `require_admin`, and a
   negative test in `test_authorization.py` for each role that must be refused.
3. Request schemas never accept client-set `id`, `is_demo`, `*_at` timestamps,
   `status`, `approved*`, `branch_id` (except as a scope filter that is then
   `assert_branch_access`-checked), or incentive/audit fields.
4. Attendance and any other server-authoritative time comes from
   `app/core/clock.py`, never the request body.
5. Secrets are read from `settings` (env). Nothing secret goes in a log, an API
   response, a test fixture that is committed, a comment, or an `EXPO_PUBLIC_*`
   var.
6. `npm run verify` (ruff check + format, backend pytest, mobile typecheck +
   tests) must be green before a PR. CI runs the same against real PostgreSQL.
7. Run `pip-audit -r backend/requirements.txt` when touching dependencies.

---

## 10. Incident response basics

- **Suspected token/credential compromise**: rotate `SECRET_KEY` (invalidates
  every access and refresh token at once); if a single account, deactivate the
  `users` row and delete its `refresh_tokens`.
- **Leaked vendor key**: rotate at the vendor immediately; the key cannot be
  un-leaked from anywhere it has already been (chat, fork, cache).
- **Suspicious activity**: `audit_logs` records login, check-in/out,
  corrections, roster changes, rule changes, moderation, payment settlement,
  broadcast, and admin actions, each scrubbed of credential-shaped values.
  Filter by `actor_user_id`, `action`, `branch_id`, `created_at`.
- **Gym PC agent misbehaving**: `GET /api/v1/inbody/agent/status` shows the
  per-branch heartbeat; stop the Scheduled Task on the PC to halt ingestion —
  it only ever reads the export folder and makes outbound calls, so removal is
  clean.

---

## 11. Production readiness checklist

| Area | Status | Note |
| --- | --- | --- |
| Password hashing | ✅ verified | bcrypt 12 rounds in prod |
| JWT: PyJWT, algorithm pinning + typ check | ✅ verified | migrated off `python-jose` 2026-09-01; `algorithms=["HS256"]`, `typ` enforced |
| `python-jose` CVEs (PYSEC-2024-232/233, 2025-185) | ✅ fixed | replaced with `PyJWT==2.13.0`; `ecdsa`/`rsa`/`pyasn1`/`cryptography` sub-tree removed |
| Login brute force / lockout / enumeration | ✅ verified | rate limit + 8-strike lock + generic message |
| Object-level authz on `{id}` routes | ✅ audited + swept | `test_security_matrix.py` — data-driven over every `/api/v1` route (no anon 2xx), BFLA per role, BOLA per resource; 1 finding fixed (trainer detail) |
| Function-level authz on privileged routes | ✅ audited | `require_*` deps + negative tests, curated privileged-route lists |
| Branch isolation | ✅ verified | single predicate, cross-branch tests green |
| QR HMAC + server-clock time | ✅ verified | constant-time compare, no client timestamp |
| Concurrency: one transition never becomes two | ✅ tested + hardened | `test_security_concurrency.py`; payment settle now row-locked, trainer-day get-or-create and InBody insert now SAVEPOINT-guarded (no 500 for the loser) |
| Rate-limit identity / `X-Forwarded-For` spoofing | ✅ fixed | header trusted only from `RATE_LIMIT_TRUSTED_PROXIES`; `test_security_rate_limit_identity.py` |
| Integration shared-secret strength | ✅ enforced | `assert_production_safe` ≥32-char floor + distinct-from-`SECRET_KEY` + distinct-from-each-other |
| Mass assignment | ✅ spot-checked | schemas exclude id/status/timestamps/audit fields |
| Secrets in repo / history | ✅ clean + CI-gated | `.gitignore` + `gitleaks` job (`security.yml`) over full history |
| Dependency audit in CI | ✅ added | `pip-audit` (backend, strict, documented ignore-list) + `npm audit` report (mobile) |
| GitHub Actions pinned by commit SHA | ✅ done | all workflows, with `# vN` comments |
| `assert_production_safe` guards | ✅ verified | SECRET_KEY, DB, DEBUG, CORS, SEED, photo dir, integration-secret strength |
| Security headers + docs-off-in-prod | ✅ verified | in `main.py` |
| Error handling (no stack trace / body echo) | ✅ verified | generic 500, sanitised 422 |
| `python-multipart` DoS advisories | ✅ fixed | bumped 0.0.20 → 0.0.31, 2026-09-01 |
| `starlette` advisories | ⚠️ residual | need a coordinated FastAPI major bump — see §12; CI ignore-list is documented and time-boxed |
| Rate-limit store for >1 API instance | ⚠️ seam ready | `RateLimitStore` protocol + boot warning; Redis adapter is a deployment decision (`DEPLOYMENT.md`) — STOP condition, not implemented |
| TLS / LB / WAF | ❌ infra | not verifiable from this repo |
| DB at-rest encryption + backups + tested restore | ❌ infra | not verifiable from this repo |
| Log aggregation / metrics / alerting / error tracking | ❌ infra | `NEXT_STEPS.md` "Production observability" |
| Off-LAN TLS for the InBody/X2008 push | ❌ infra | real cert or tunnel; session used a self-signed LAN cert |
| Codespaces ports 8000/8082 forced public | ⚠️ by design | demo data only; `assert_production_safe` blocks this config in prod |

---

## 12. Known limitations

- **In-process rate limiting.** The store sits behind `RateLimitStore`
  (`hit()`/`reset()`) with `InProcessRateLimiter` as the default; a
  multi-instance deployment implements the protocol against Redis and assigns
  `rate_limit.store` at startup. The API logs a warning at boot in
  production/staging when it is running the in-process store, so the
  single-instance assumption is explicit rather than silent. A Redis adapter
  is not wired in — whether >1 instance runs is a deployment decision.
- **`X-Forwarded-For` handling.** Now trusted only when the direct socket peer
  is in `RATE_LIMIT_TRUSTED_PROXIES`; empty (default / Codespaces) ignores the
  header entirely. Set it to the reverse proxy's egress IP(s) in production.
- **Residual dependency advisory: `starlette 0.41.3`.** Fixed only in versions
  that require a coordinated FastAPI major upgrade (Starlette 1.x) plus a full
  mobile+backend CI run and a deploy smoke test — deferred to a dedicated
  dependency PR (a STOP condition for autonomous work). The `pip-audit` CI gate
  carries a documented, time-boxed ignore-list for exactly these IDs so a *new*
  advisory still fails the build. `python-jose` and its `ecdsa`/`rsa`/`pyasn1`
  sub-tree — including the "won't-fix" `ecdsa` Minerva side-channel
  (PYSEC-2026-1325), which was never reachable under HS256 anyway — are **gone**
  as of the PyJWT migration.
- **Trainer-branch, not trainer-client, read scope.** A trainer can read any
  member at their own branch, not only their assigned clients. This is
  deliberate (trainers cover for each other) and documented in
  `assert_can_read_member`.
- **Concurrency invariants hold at the DB layer.** Duplicate check-in,
  duplicate InBody reading and double payment-settle are each prevented by a
  unique constraint or a row lock; the hardening this pass added makes the
  losing request resolve cleanly (409 / idempotent) instead of surfacing a
  500. Other concurrent operations (PT balance burn-down, class capacity,
  Day-45 completion) were reviewed but are not yet in the automated
  concurrency suite.
- **Not verified from this repository**: anything in §11 marked ❌ or ⚠️ infra —
  real TLS, the load balancer, at-rest encryption, backups/restore, monitoring,
  and the actual production `.env`.
