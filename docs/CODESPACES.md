# Running GymFlow in GitHub Codespaces

Nothing is installed on your machine. Node, Python and PostgreSQL all run inside the container, and the Android build happens on EAS's servers rather than in a local Android Studio.

## Start it

**Code → Codespaces → Create codespace on main.**

The container runs `.devcontainer/post-create.sh` once during creation and sets up the Python virtual environment, database, demo data, and mobile dependencies.

Then, to start everything:

```bash
npm run dev
```
(or `./dev.sh`)

This automatically:
1. Starts the FastAPI backend on port 8000 (if not already running).
2. Verifies backend health and database connectivity.
3. Configures Codespaces public port forwarding for ports 8000 and 8082.
4. Starts the Metro bundler on port 8082 with Codespaces public URLs.
5. Prints the exact Dev Client URL, deep link, and QR code to connect your physical Android device.

---

## Daily Commands

| Command | What it does |
| --- | --- |
| `npm run dev` (or `./dev.sh`) | Start both Backend and Metro bundler |
| `npm run dev:status` | Diagnostic check of backend, DB, Metro, and Codespaces ports |
| `npm run dev:stop` | Cleanly stop all development processes |
| `npm run dev:clean` | Clear Metro cache and restart |
| `npm run verify` | Run backend linter & tests, mobile typecheck & tests |
| `npm run seed:reset` | Wipe and regenerate demo data |
| `npm run migrate` | Apply database migrations |

---

## Connecting a Physical Phone

1. Install the **GymFlow AI Development Build** APK on your phone (built via EAS).
2. Run `npm run dev`.
3. Open the app on your phone, select **Enter URL manually**, and enter:
   ```
   https://<codespace-name>-8082.app.github.dev
   ```
   *(Or scan the QR code printed in the terminal)*
4. Fast Refresh is active: any change in `apps/mobile/src` will automatically hot-reload on your phone.

---

## Ports & Public Access

Codespaces forwards port 8000 (FastAPI) and port 8082 (Metro). Both are configured with `visibility: public` in `devcontainer.json` so external phones can reach them.

To verify or change port visibility manually:
```bash
gh codespace ports visibility 8000:public 8082:public
```
Or check status at any time:
```bash
npm run dev:status
```
