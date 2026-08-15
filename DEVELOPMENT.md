# GymFlow AI Development Guide

## QUICK START

1. Open Codespaces (or clone locally).
2. Run:

   ```bash
   npm run dev
   ```

3. Open the GymFlow AI development build on your phone or emulator.

4. Edit code.

5. Changes will appear automatically through Fast Refresh.

---

## Daily Workflow Commands

| Command | Description |
| --- | --- |
| `npm run dev` (or `./dev.sh`) | Start both Backend (:8000) and Metro (:8081) in one command |
| `npm run dev:backend` | Start only the FastAPI backend (:8000) |
| `npm run dev:mobile` | Start only Metro bundler for mobile (:8081) |
| `npm run dev:status` | Run system diagnostics (ports, health, database, Expo config) |
| `npm run dev:stop` | Stop all running development services cleanly |
| `npm run dev:clean` | Clear Metro bundler cache and restart |
| `npm run verify` | Run full test suite, linter, and typechecks |

---

## First-Time Setup

### In GitHub Codespaces (Recommended)
Everything is pre-configured automatically:
1. Open the repository in GitHub Codespaces.
2. The devcontainer post-create script automatically creates the Python `.venv`, seeds the database, installs dependencies, and configures public port forwarding for ports `8000` and `8081`.
3. Run `npm run dev`.

### Local Setup (Direct on Host Machine)
1. **Prerequisites**: Node.js 20+, Python 3.11+, PostgreSQL 16.
2. **Setup Database**:
   ```bash
   createuser gymflow --pwprompt # password: gymflow
   createdb gymflow --owner gymflow
   createdb gymflow_test --owner gymflow
   ```
3. **Backend Virtualenv**:
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r backend/requirements-dev.txt
   cp backend/.env.example backend/.env
   cd backend && ../.venv/bin/alembic upgrade head && ../.venv/bin/python -m app.seed
   ```
4. **Mobile Dependencies**:
   ```bash
   cd apps/mobile && npm install
   ```
5. **Start Dev**:
   ```bash
   npm run dev
   ```

---

## Connecting Physical Android Devices

GymFlow AI uses an **Expo Development Build** (`expo-dev-client`) rather than plain Expo Go, ensuring native camera and security plugins work identical to production.

### Step 1: Install the GymFlow Development Build APK
- Build a preview APK using EAS (`npm run build:android` from root) or download the latest EAS preview build artifact.
- Install the `.apk` on your physical Android phone.

### Step 2: Connect to Metro
1. In your Codespace / dev terminal, run `npm run dev`.
2. Codespaces automatically forwards port `8081` as **Public**.
3. Open the **GymFlow AI** development app on your phone.
4. Under "Development servers", tap **Enter URL manually** and enter:
   ```
   https://<your-codespace-name>-8081.app.github.dev
   ```
   *(The exact URL is printed in your terminal when running `npm run dev`)*
5. Alternatively, scan the QR code printed in the terminal directly from the dev client or phone camera.
6. The bundle will download to your phone. Fast Refresh is enabled: edits in `apps/mobile/src` will hot reload immediately without reinstalling the APK!

---

## Architecture & URL Separation

GymFlow AI separates the **Backend API URL** from the **Metro Bundler URL**:

- **`EXPO_PUBLIC_API_URL` (Backend API)**:
  - In Codespaces: `https://<codespace>-8000.app.github.dev`
  - In Local Dev: `http://localhost:8000` (or `http://10.0.2.2:8000` for Android emulator)
  - Automatically written to `apps/mobile/.env` when starting `npm run dev`.
- **Metro Bundler URL**:
  - In Codespaces: `https://<codespace>-8081.app.github.dev`
  - In Local Dev: `http://localhost:8081`
  - Managed via `REACT_NATIVE_PACKAGER_HOSTNAME` and `EXPO_PACKAGER_PROXY_URL`.

---

## Stopping and Restarting Development

- **Graceful Stop (Interactive Mode)**:
  Press `Ctrl+C` in the terminal running `npm run dev` or `./dev.sh`. All child processes will be cleanly terminated.
- **Stop Background Processes**:
  ```bash
  npm run dev:stop
  ```
- **Restart with Fresh Metro Cache**:
  ```bash
  npm run dev:clean
  ```

---

## Troubleshooting & Diagnostics

### Run Diagnostics
Run the diagnostic tool at any time:
```bash
npm run dev:status
```
Example output:
```
GymFlow AI — System Diagnostics

Backend : 8000         ✓ RUNNING
Database               ✓ CONNECTED
Metro   : 8081         ✓ RUNNING
Codespaces Ports       ✓ PUBLIC (8000, 8081)
Expo Configuration     ✓ CONFIGURED (https://...-8000.app.github.dev)

All systems healthy! Ready for development.
```

### Common Issues

1. **"No connection to GymFlow" on phone**:
   - Verify port `8000` is Public in Codespaces:
     ```bash
     gh codespace ports visibility 8000:public
     ```
   - Check `apps/mobile/.env` has the correct `EXPO_PUBLIC_API_URL`.

2. **Metro bundling error / stale cache**:
   - Reset Metro cache and restart:
     ```bash
     npm run dev:clean
     ```

3. **Port 8000 or 8081 in use**:
   - Stop any stuck processes:
     ```bash
     npm run dev:stop
     ```
