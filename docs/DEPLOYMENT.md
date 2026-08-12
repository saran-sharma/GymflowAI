# Production configuration

## The API refuses to start unsafely

`Settings.assert_production_safe()` runs at import when `ENVIRONMENT` is
`production` or `staging`, and raises on any of:

- `SECRET_KEY` still the development value, or shorter than 32 characters
- `DATABASE_URL` still pointing at the development database
- `DEBUG=true`
- `CORS_ORIGINS=*`
- `SEED_DEMO_DATA=true`

This is deliberate: a misconfigured deploy fails loudly on boot rather than
quietly serving traffic with a known signing key.

## Required environment

```bash
ENVIRONMENT=production
DEBUG=false

DATABASE_URL=postgresql+psycopg://gymflow:<strong-password>@<host>:5432/gymflow

# python -c "import secrets; print(secrets.token_urlsafe(48))"
SECRET_KEY=<48+ random chars>

CORS_ORIGINS=https://app.gymflow.example
SEED_DEMO_DATA=false

RATE_LIMIT_ENABLED=true
```

Secrets come from the platform's secret store — never from a file in the
repository, and never from a container image layer.

## Deploy steps

```bash
pip install -r backend/requirements.txt
cd backend && alembic upgrade head      # run before the new code serves traffic
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Put it behind a TLS-terminating reverse proxy. The app sets
`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` and
`Referrer-Policy` itself, and `TrustedHostMiddleware` is enabled in production
to block Host-header games.

Health check: `GET /api/v1/health` — unauthenticated, and reports no version or
configuration detail.

`/docs` and `/openapi.json` are disabled in production.

## Rate limiting across instances

The limiter counts in-process. That is correct for one API instance. Running
more than one behind a load balancer means each instance enforces its own
share of the limit, so either:

- pin the login and check-in limits proportionally lower per instance, or
- move the counter to a shared store (Redis) — `app/core/rate_limit.py` has one
  `RateLimiter` class and one `hit()` method to change.

Account lockout after repeated failures is stored in the database and therefore
already works across instances.

## Database backups

Attendance is the product. Losing it loses the reason SLAM bought this.

```bash
# Nightly, retained 30 days, stored off the database host
pg_dump --format=custom --no-owner gymflow > gymflow-$(date +%F).dump

# Restore
pg_restore --clean --if-exists --no-owner --dbname=gymflow gymflow-2026-08-12.dump
```

Managed Postgres (RDS, Cloud SQL, Neon, Supabase) gives point-in-time recovery;
turn it on and set retention to at least 7 days. **Test a restore before go-live** —
an untested backup is a hope, not a backup.

`audit_logs` and `attendance_events` are append-only and must never be pruned
without a written retention decision from SLAM.

## Mobile releases

`apps/mobile/eas.json` carries three profiles:

| Profile | Output | API |
| --- | --- | --- |
| `development` | APK + dev client | `http://10.0.2.2:8000` |
| `preview` | APK, internal distribution | staging |
| `production` | AAB for Play Store | production |

```bash
cd apps/mobile
npx eas build --profile production --platform android
npx eas build --profile production --platform ios      # needs an Apple account
```

Set the real API URL in each profile's `env` block, or in EAS project secrets,
before the first external build. `EXPO_PUBLIC_*` values are inlined into the
JavaScript bundle — never put a secret there.

`app.json` carries a placeholder `extra.eas.projectId`. Replace it with the real
one (`eas init`) before building.

### ACTION REQUIRED before a store release

**What:** Play Console and Apple Developer accounts, plus an EAS project.
**Why:** signing keys, bundle identifiers and store listings cannot be created
without them.
**Exact values/access needed:**

1. Google Play Console access for the SLAM/GymFlow organisation
2. Apple Developer Program membership (Team ID)
3. An Expo account and organisation for EAS builds
4. Confirmation of the final bundle identifiers (currently `ai.gymflow.slam`)
5. Store listing copy, icons and screenshots
6. The production API domain and its TLS certificate

## Cutting over from demo data

```sql
-- Everything the seeder created is flagged. Real records are untouched.
DELETE FROM users    WHERE is_demo = true;
DELETE FROM branches WHERE is_demo = true;
```

Or `python -m app.seed --reset` before setting `SEED_DEMO_DATA=false`.

Then create the real chain: branches, an owner, a manager per branch, trainers
with their real rosters, and the incentive thresholds SLAM actually uses.
