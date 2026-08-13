# Running GymFlow in GitHub Codespaces

Nothing is installed on your machine. Node, Python and PostgreSQL all run
inside the container, and the Android build happens on EAS's servers rather
than in a local Android Studio.

## Start it

**Code → Codespaces → Create codespace on main.**

The first build takes a few minutes. `.devcontainer/post-create.sh` runs once
and does all of this:

- creates `.venv` and installs the backend dependencies
- waits for the `db` service, then creates the `gymflow_test` database
- writes `backend/.env` with a freshly generated `SECRET_KEY`
- writes `apps/mobile/.env` pointing at this Codespace's public API URL
- applies the migrations and seeds the SLAM demo data
- runs `npm ci` for the mobile app and the web demo

Then:

```bash
npm run api        # FastAPI on :8000, reloading
npm run mobile     # Expo, tunnelled so a real phone can connect
```

| Command | What it does |
| --- | --- |
| `npm run api` | Start the API on port 8000 |
| `npm run mobile` | Expo with `--tunnel` — for a phone running Expo Go |
| `npm run mobile:lan` | Expo without the tunnel — for a browser or emulator |
| `npm run web-demo` | The original Vite demo |
| `npm run verify` | Lint, backend tests, typecheck, mobile tests |
| `npm run seed:reset` | Wipe and regenerate the demo data |
| `npm run migrate` | Apply migrations |

## Port 8000 must be public

This is the one thing that catches people out.

A phone running Expo Go is not on the Codespace's network. It reaches the API
through the forwarded URL — and Codespaces forwards ports as **private** by
default, which answers every request with a GitHub login redirect. The app
then shows "No connection to GymFlow", which looks like a bug in the app.

`devcontainer.json` requests `"visibility": "public"` for port 8000, but if the
Ports tab shows it as Private, change it there or run:

```bash
gh codespace ports visibility 8000:public
```

`apps/mobile/.env` is written with the right URL automatically:

```
EXPO_PUBLIC_API_URL=https://<codespace-name>-8000.app.github.dev
```

The Profile tab in the app shows which server the build is talking to, which is
the quickest way to confirm it took effect.

## Connecting a phone

1. Install **Expo Go** from the Play Store or App Store
2. `npm run mobile`
3. Scan the QR code in the terminal

The tunnel is what makes this work from outside the Codespace — `npm run mobile`
uses it by default for exactly that reason.

## Running against a different API

Edit `apps/mobile/.env` and restart Expo. Anything reachable from the phone
works: another Codespace, a staging deploy, a machine on the same wifi.

## Local Dev Containers

The same `.devcontainer/` works in VS Code's Dev Containers extension. The
setup script detects it is not in a Codespace and writes
`EXPO_PUBLIC_API_URL=http://localhost:8000`, which is right for a browser or an
emulator on the same machine; a physical device needs your LAN IP instead.

## When something is wrong

**`npm run api` says the database is down.** The `db` service may still be
starting. `pg_isready -h db -U gymflow` tells you. Rebuilding the container
(Command Palette → *Rebuild Container*) re-runs the setup script.

**The app cannot reach the API.** Port 8000 is private — see above.

**Tests fail with timezone comparison errors.** The suite fell back to SQLite
because Postgres was unreachable; it prints a banner saying so. Start the `db`
service and re-run.

**A dependency looks wrong after pulling.** Re-run `bash .devcontainer/post-create.sh`.
It is idempotent.
