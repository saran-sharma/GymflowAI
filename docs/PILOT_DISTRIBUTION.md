# GymFlow AI — pilot distribution runbook

How to get an Android build in front of 5–20 pilot testers for ~₹0, and the
cheapest legitimate way to do the same on iOS. This is deliberately separate
from [`DEPLOYMENT.md`](DEPLOYMENT.md), which covers the paid production
backend this pilot will eventually sit in front of — nothing here stands that
up.

**Distribution channel: Firebase App Distribution**, chosen over GitHub
Releases, EAS's own internal-distribution page, Diawi, DeployGate and
Microsoft App Center (retired) — see the comparison and reasoning recorded in
the PR/commit this file shipped with. Short version: it is free on Firebase's
Spark (no-cost, no billing account) plan, actively maintained by Google,
supports 500 testers per project, needs **no Firebase SDK or config file
inside the app** — only a CI-side upload — and gives testers a managed
install/update experience instead of a raw sideloaded APK.

---

## 1. Build the Android APK

Nothing about the build changed. It still runs on EAS Build — no Android
Studio, no local SDK, no JDK anywhere in this pipeline (see
[`ANDROID_BUILD.md`](ANDROID_BUILD.md) for the full mechanics). Two ways to
produce the APK the pilot workflow will distribute:

**Through GitHub Actions (recommended — also pushes to testers in one run):**

**Actions → "Pilot — Android to Firebase App Distribution" → Run workflow.**

| Input | Meaning |
| --- | --- |
| `profile` | `preview` for a pilot APK (internal distribution, what you want) |
| `api_url` | The API this build talks to — a publicly reachable URL, never `localhost` |
| `firebase_app_id` | From Firebase console → Project settings → General → Your apps (looks like `1:1234567890:android:abcdef`) |
| `testers_or_groups` | A comma-separated email list, or a group alias (see `mode`) |
| `mode` | `groups` (recommended — manage the roster in the Firebase console) or `testers` (raw emails) |
| `release_notes` | One line testers see in the invite/update |

This is a new, additive workflow
(`.github/workflows/firebase-distribute-android.yml`) — the existing **"EAS
Android build"** workflow is untouched and still works exactly as before for
a plain build with no distribution step.

**From a terminal**, if you only want the APK (no Firebase push):

```bash
cd apps/mobile
npx eas-cli login
EXPO_PUBLIC_API_URL=https://your-api.example npx eas-cli build \
  --platform android --profile preview
```

Then distribute it manually — §2's terminal command works on any APK file,
however it was built.

---

## 2. Distribute to testers

**Automated (the GitHub Actions workflow above)** builds and distributes in
one run — nothing further to do once it finishes; testers are already
notified.

**Manual, from a terminal**, once you have an APK (from EAS or already
downloaded from a previous build):

```bash
# One-time per machine:
npm install -g firebase-tools   # or npx firebase-tools@15.29.0 each time

# Interactive login (opens a browser) — fine for a one-off manual push:
firebase login

firebase appdistribution:distribute /path/to/gymflow.apk \
  --app 1:1234567890:android:abcdef \
  --groups "pilot-testers" \
  --release-notes "What changed in this build"
```

### One-time Firebase setup (do this once, before the first distribution)

1. Create a Firebase project at <https://console.firebase.google.com> — no
   billing account needed; Spark (free) plan is enough for App Distribution.
2. Add an Android app to it. **Package name must exactly match**
   `ai.gymflow.slam` (`apps/mobile/app.json` → `android.package`) — Firebase
   will not let you change it later.
3. Open **App Distribution** in the left nav → **Get started**.
4. Create a tester **group** (e.g. `pilot-testers`) and add the pilot
   testers' email addresses to it — Project settings → App Distribution →
   Testers & groups (or `firebase appdistribution:group:create` /
   `testers:add`).
5. **For CI (the GitHub Actions workflow):** create a service account with
   the **Firebase App Distribution Admin** role — Google Cloud console →
   IAM & Admin → Service Accounts → your Firebase project → Create → grant
   that one role → Keys → Add key → JSON. Add the entire downloaded JSON
   file's content as the GitHub repository secret
   `FIREBASE_SERVICE_ACCOUNT_JSON` (Settings → Secrets and variables →
   Actions). **Never commit this file.** It grants nothing beyond pushing
   builds to App Distribution testers — not billing, not other Firebase
   products.
6. `EXPO_TOKEN` must already exist as a repository secret (it does, for the
   existing EAS build workflow — see `ANDROID_BUILD.md`).

---

## 3. Tester installation

1. Tester receives an email invitation from Firebase App Distribution.
2. On the Android phone: open the email, sign in with **any Google
   account** (does not need to be the account the invite was sent to),
   accept the invitation.
3. First time only: install the **Firebase App Tester** helper app when
   prompted (or from <https://appdistribution.firebase.google.com> on the
   device). Android will ask to allow installs from this source once — that
   is expected for any app not installed from the Play Store.
4. In Firebase App Tester, select GymFlow AI → **Download** → install.

No Play Store account, no APK hunting, no manual "allow unknown sources"
toggle-hunting beyond the one prompt in step 3.

---

## 4. Updating to a newer build

Run the distribution workflow (or the manual command) again with a new
build. Every tester already in the group/list gets an email that a new
version is ready; they open Firebase App Tester and tap **Update** — no
re-invitation, no reinstall-from-scratch. A release stays listed in the
Firebase console for 150 days.

---

## 5. Backend/API URL configuration

`EXPO_PUBLIC_API_URL` is compiled into the JS bundle at build time — an APK
cannot be re-pointed afterward (see `ANDROID_BUILD.md` "Why the API URL is a
build input"). Every pilot build must be given a **publicly reachable**
HTTPS (or plain HTTP, for a short pilot) URL via the `api_url` workflow
input; `localhost` / `127.0.0.1` / `10.0.2.2` are rejected by the workflow's
own preflight check because a tester's phone cannot reach any of them.

Where that URL points is a separate, already-documented decision — see
`DEPLOYMENT.md` for the backend's own production configuration contract
(`assert_production_safe()`, required env vars, migration steps). This
runbook does not stand up or change that backend in any way.

---

## 6. Revoking / removing testers

Firebase console → App Distribution → **Testers & groups** → remove the
person from the group (or delete their tester entry). Effective immediately
— a removed tester's Firebase App Tester stops receiving new builds; it does
not remotely uninstall the app already on their phone (no distribution
channel does this for a sideloaded Android app). From a terminal:

```bash
firebase appdistribution:testers:remove someone@example.com --project <project-id>
```

---

## 7. Moving from pilot distribution → Google Play later

Nothing about this pilot path blocks or complicates a later Play Store
release:

- The same EAS-managed signing keystore carries forward — Google Play
  requires one consistent signing key per app for its entire lifetime, and
  switching from `preview` (APK) to `production` (`eas.json` → AAB) builds
  the same app with the same identity, not a new one.
- Firebase App Distribution and Google Play are independent — nothing needs
  to be "migrated off" Firebase; you simply start also (or instead)
  uploading the `production` AAB to Play Console when ready.
- What Play Console adds at that point: the one-time **$25 registration
  fee** (unavoidable for any Play Console track, including internal
  testing — see the comparison notes), identity verification, a store
  listing, and — for a **personal** developer account created after
  2023-11-13 — a mandatory closed test with 12 testers for 14 continuous
  days before a production release is allowed. An **organization** account
  is exempt from that 12/14 requirement (but still pays the $25 fee).
- `eas.json`'s `production` profile (`app-bundle`, `autoIncrement: true`,
  `appVersionSource: remote`) is already configured for this — see
  `ANDROID_BUILD.md` and `DEMO_AND_PRODUCTION_READINESS.md` §10.

---

## 8. iOS pilot path

**There is no ₹0 option for distributing an iOS build to real devices.**
Apple requires a paid **Apple Developer Program** membership ($99/year) for
every legitimate distribution method that reaches a device other than the
one it was built on — TestFlight, ad-hoc, and the App Store all sit behind
that same membership; none is cheaper than another. See the comparison for
the full reasoning.

Until that membership exists:

- **Local development builds only** — `eas build --profile development
  --platform ios` with `ios.simulator: true` (already the `development`
  profile's config) runs in the iOS **Simulator** on a Mac. No real device,
  no paid account, ₹0.
- A **personal (free) Apple ID** can sideload a build to a small number of
  the developer's own devices via Xcode, but each install expires after 7
  days and must be re-signed from a Mac — impractical for a multi-person,
  multi-week pilot.

Once a $99/year membership exists, **TestFlight** (not ad-hoc) is the right
choice: up to 100 internal testers with no App Review wait, or up to 10,000
external testers after one review pass; builds are managed and updated the
same way Firebase App Distribution manages Android ones. `eas.json`'s
`submit.production` is currently empty — it needs an Apple Team ID and an
App Store Connect API key (`eas credentials`) before an iOS build can be
submitted anywhere.

---

## 9. Secrets/credentials that must NEVER be committed

| Secret | Lives in | Never in |
| --- | --- | --- |
| `EXPO_TOKEN` | GitHub Actions repository secret | any workflow file, any committed script |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | GitHub Actions repository secret | the repo, a build log, a workflow file — the pilot workflow writes it to a runner-local temp file for one CLI call and deletes it (`trap ... EXIT`) |
| Any Apple Team ID / App Store Connect API key (once iOS distribution starts) | `eas credentials` (EAS-managed) or a GitHub Actions secret | the repo |
| `google-services.json` / `GoogleService-Info.plist` | Not needed for this pilot — no Firebase SDK is added to the app. If a future feature (e.g. push, Crashlytics) adds one, it is gitignored (see `.gitignore`) and belongs in the build pipeline, never the repo | the repo |
| `DATABASE_URL`, `SECRET_KEY`, any `YOACTIV_*` / `INBODY_*` / `FINGERPRINT_*` value | the backend's own `.env` / production secret store — entirely separate from this mobile pilot | anywhere in `apps/mobile`, any GitHub Actions workflow this runbook touches |

The Firebase App ID (`1:...:android:...`) is **not** a secret — it identifies
the app the way a package name does, and appears in plain sight in the
Firebase console URL and in this file's own examples. Treat it as public.

---

## 10. What changes when GymFlow moves to paid production infrastructure

Nothing in this pilot path needs to be undone — it is additive and sits
beside the eventual production setup, not in front of it:

- The backend still needs everything `DEPLOYMENT.md` and the production
  readiness discovery already describe: a real cloud host, a managed
  Postgres, a domain + TLS, a generated `SECRET_KEY`, `CORS_ORIGINS` set to
  the real origin(s), `SEED_DEMO_DATA=false` — none of that is created,
  changed, or assumed by this pilot distribution work.
- Mobile builds simply get pointed (`api_url` / `EXPO_PUBLIC_API_URL`) at
  the real production domain instead of a pilot backend — a build-time
  input, not a code change.
- Google Play (§7) and, once affordable/ready, an Apple Developer Program
  membership (§8) are the two paid steps that turn "pilot" into "public
  release." Both are independent of whether Firebase App Distribution was
  ever used, and neither requires removing it.
- If the pilot outgrows Firebase's free tester limits (500/project, 200/group
  — far beyond a 5–20 person pilot) or needs iOS testers before Apple
  credentials exist, TestFlight and/or Play's internal testing track are the
  next steps, not a replacement for what is documented here.
