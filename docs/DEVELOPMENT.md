# Running GymFlow AI Locally & In Codespaces

> **The quickest path is GitHub Codespaces** — no local PostgreSQL, Node or Android Studio required.
> Simply run `npm run dev` and open your development client.

## QUICK START

1. Open Codespaces (or clone locally).
2. Run:

   ```bash
   npm run dev
   ```

3. Open the GymFlow AI development build.
4. Edit code.
5. Changes will appear automatically through Fast Refresh.

---

## Daily Workflow Commands

| Command | Description |
| --- | --- |
| `npm run dev` (or `./dev.sh`) | Start both Backend (:8000) and Metro (:8082) in one command |
| `npm run dev:backend` | Start only the FastAPI backend (:8000) |
| `npm run dev:mobile` | Start only Metro bundler for mobile (:8082) |
| `npm run dev:status` | Run system diagnostics (ports, health, database, Expo config) |
| `npm run dev:stop` | Stop all running development services cleanly |
| `npm run dev:clean` | Clear Metro bundler cache and restart |
| `npm run verify` | Run full test suite, linter, and typechecks |

---

## Architecture & URL Separation

GymFlow AI separates the **Backend API URL** from the **Metro Bundler URL**:

- **`EXPO_PUBLIC_API_URL` (Backend API)**:
  - In Codespaces: `https://<codespace>-8000.app.github.dev`
  - In Local Dev: `http://localhost:8000` (or `http://10.0.2.2:8000` for Android emulator)
  - Automatically written to `apps/mobile/.env` when starting `npm run dev`.
- **Metro Bundler URL**:
  - In Codespaces: `https://<codespace>-8082.app.github.dev`
  - In Local Dev: `http://localhost:8082`
  - Managed via `REACT_NATIVE_PACKAGER_HOSTNAME` and `EXPO_PACKAGER_PROXY_URL`.

---

## Demo Logins

Seeded automatically by `python -m app.seed`. Every person is fictional.

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@slam.demo` | `SlamDemo2026!` |
| Super admin | `admin@gymflow.demo` | `SlamDemo2026!` |
| Branch manager (Nagalkeni) | `priya.menon@slam.demo` | `SlamDemo2026!` |
| Trainer (Nagalkeni) | `vikas.menon@slam.demo` | `SlamDemo2026!` |
| Trainer (Boganhalli) | `rahul.deshpande@slam.demo` | `SlamDemo2026!` |
| Member | `aditya.rao@member.slam.demo` | `SlamDemo2026!` |

Trainer check-in PIN: `246813`

`npm run seed:reset` wipes and regenerates demo rows. It only touches rows flagged `is_demo`, so it can never delete real SLAM data.

---

## Android Physical Device Setup

1. Install the GymFlow development build APK (built via `npm run build:android` on EAS).
2. Run `npm run dev`.
3. Open the app on the phone.
4. Enter the Metro URL (printed in the terminal) or scan the terminal QR code.
5. Edits to JavaScript/TypeScript reload automatically via Fast Refresh without reinstalling the APK.

---

## Troubleshooting & Diagnostics

Run:
```bash
npm run dev:status
```

- If backend is stopped: `npm run dev:backend` or `npm run dev`.
- If Metro cache is corrupted: `npm run dev:clean`.
- If ports are held: `npm run dev:stop`.
