# Running GymFlow AI locally

Two processes: the API and the mobile app. Start the API first — the app is
useless without it, and says so clearly rather than failing silently.

## 1. Database

```bash
# Postgres 16, running locally
createuser gymflow --pwprompt          # password: gymflow (development only)
createdb gymflow  --owner gymflow
createdb gymflow_test --owner gymflow  # the test suite uses its own database
```

## 2. API

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements-dev.txt

cp .env.example .env                   # defaults work for local development

../.venv/bin/alembic upgrade head      # create the schema
../.venv/bin/python -m app.seed        # SLAM demo data (all rows flagged DEMO)

../.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` matters: an Android emulator or a phone on the same wifi
cannot reach a server bound to `127.0.0.1`.

Interactive API docs: <http://localhost:8000/docs>

### Demo logins

Seeded by `python -m app.seed`. Every person is fictional.

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@slam.demo` | `SlamDemo2026!` |
| Super admin | `admin@gymflow.demo` | `SlamDemo2026!` |
| Branch manager (Nagalkeni) | `priya.menon@slam.demo` | `SlamDemo2026!` |
| Trainer (Nagalkeni) | `vikas.menon@slam.demo` | `SlamDemo2026!` |
| Trainer (Boganhalli) | `rahul.deshpande@slam.demo` | `SlamDemo2026!` |
| Member | `aditya.rao@member.slam.demo` | `SlamDemo2026!` |

Trainer check-in PIN: `246813`

`python -m app.seed --reset` wipes and regenerates demo rows. It only touches
rows flagged `is_demo`, so it can never delete real SLAM data.

## 3. Mobile app

```bash
cd apps/mobile
npm install
cp .env.example .env      # point EXPO_PUBLIC_API_URL at your API

npm start                 # then press 'a' for Android, 'i' for iOS
```

### Which API URL

| Running on | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical device | `http://<your-lan-ip>:8000` |

Unset, the app derives the host from Expo's dev-server URI, which is usually
right for a physical device on the same network.

## Checks

```bash
# Backend
cd backend
../.venv/bin/ruff check app ../tests
../.venv/bin/ruff format --check app ../tests
../.venv/bin/python -m pytest ../tests/backend

# Mobile
cd apps/mobile
npm run typecheck
npm test
```

## Android build

```bash
cd apps/mobile

# Verify the bundle first — fastest way to catch a broken import.
npx expo export --platform android

# Native project (writes android/, which is gitignored and regenerable)
npm run prebuild:android

# Debug APK, needs a local Android SDK
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Or via EAS, no local SDK required
npx eas build --profile development --platform android
```

iOS is configured (`bundleIdentifier`, camera usage string, encryption
declaration) and bundles cleanly. Producing an `.ipa` needs macOS or EAS.

## Useful API calls

```bash
API=http://localhost:8000/api/v1

TOKEN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"owner@slam.demo","password":"SlamDemo2026!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["tokens"]["access_token"])')

curl -s $API/reports/dashboard -H "authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s $API/branches/occupancy -H "authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s $API/incentives         -H "authorization: Bearer $TOKEN" | python3 -m json.tool
```

## Troubleshooting

**"No connection to GymFlow" on a device.** The API is bound to `127.0.0.1`, or
`EXPO_PUBLIC_API_URL` points at `localhost` from an emulator. Bind `0.0.0.0`
and use `10.0.2.2` on Android.

**Every trainer shows as absent.** A branch's day only materialises when the
dashboard or `/attendance/day` is fetched. Hit `POST /attendance/settle` or open
the owner dashboard.

**Login returns 429.** The rate limiter is doing its job. Wait a minute, or set
`RATE_LIMIT_ENABLED=false` for local work.
