# GymFlow — Demo & Production Readiness

Status as of **2026-08-30**. This reflects the `release/gymflow-pilot-*`
branch. No mobile build has been submitted to a store.

**Overall: 🟡 YELLOW.** The GymFlow product — auth + role security, member
onboarding, member lifecycle, workout scheduling, Program Days, workout
execution, progress/PRs, PT, marketing, and the owner/trainer/member apps —
is **production-safe and pilot-ready**, with a full green test matrix and a
prior full physical-Pixel-6a smoke test. The three external integrations
(Yoactiv, X2008 fingerprint, InBody) are **code-complete and tested against
their real contracts** but **cannot be run LIVE** — each is blocked on a
vendor credential, a physical device, or the gym PC. **No integration is
claimed LIVE.**

---

## 1. Executive summary

| Area | State |
| --- | --- |
| Backend API + domain | ✅ production-ready — **617 pytest** green, ruff + format clean |
| Mobile apps (owner / trainer / member) | ✅ pilot-ready — **501 jest** green (incl. `TZ=Asia/Kolkata`), tsc clean |
| Role selection + authorization | ✅ backend authoritative; the role check lives in `AuthContext.signIn` and throws `RoleMismatchError` **before** a session is created, so a wrong pick never lands anywhere; 12-case matrix tested |
| First-time member onboarding | ✅ concise **3-step Fitness Journey** flow (`app/(onboarding)/fitness-journey.tsx`, its own route group so "Save and finish" lands on Home) + incomplete-intake gate; reuses `MemberIntake` unchanged; **Pixel-verified**; onboarding answers surface read-only as a **Fitness profile** section on the trainer client-detail and owner member-detail screens |
| Member lifecycle (register → active → expired → reactivate, history retained) | ✅ implemented + tested; no hard-delete on expiry |
| Workout scheduling consistency | ✅ one calendar rule for weekly strip + Today's Workout; timezone bug fixed + **Pixel-verified**; 33 regression tests |
| Progress / PR / trend | ✅ compact rows + real trend chart; 3 physical-Pixel UI defects fixed + verified |
| Yoactiv connector (checkins, invoices→membership, identity, idempotency, retries, dead-letters, admin API) | ✅ built + tested against the real API contract; ⛔ **LIVE BLOCKED** — Data API host behind IIS Basic auth, no credentials |
| X2008 fingerprint | ⛔ **BLOCKED — REQUIRES REAL DEVICE VALIDATION.** Device is on Yoactiv's ADMS; keep it there |
| InBody automatic ingestion | ✅ agent + endpoint built + tested; real 87-column bulk-export header verified; ⛔ **LIVE BLOCKED — REQUIRES GYM PC** + one fresh per-scan CSV |
| Demo data (Karan Shetty / Vikas Menon / Aditya Rao / Farah Sheikh) | ✅ deterministic in `backend/app/seed.py` |
| Android release | ⏸️ config ready (`ai.gymflow.slam`, EAS `production` profile); build **not run** — needs a production API URL |
| iOS release | ⛔ **BLOCKED** — no Apple credentials configured |
| Secrets hygiene | ✅ secret scan clean; `.env*`, `*.xlsx`, `*.csv`, `*.msi`, `*.postman_collection.json` gitignored |

---

## 2. Current architecture (frozen)

**Yoactiv = operational system of record**: member identity, memberships,
invoices/payments, attendance/check-ins, fingerprint/access, enquiries,
followups, PT commercial records.

**GymFlow = training / member-experience system of record**: workout
programs, Program Days, execution, sets/reps, PRs, strength trends, the
fitness journey, InBody measurements, training analytics, auth/RBAC, the
mobile experience.

**Conflict rule:** Yoactiv wins for shared operational fields; GymFlow wins
for training/progress fields; GymFlow never writes training data to Yoactiv;
mobile talks only to GymFlow APIs and never sees a Yoactiv credential.

```
Yoactiv backdata.asmx ──pull(API_Key + Basic, https)──► GymFlow Yoactiv connector
   /checkins /invoices /enquires /followups /ptTrialConversion   (app/integrations/yoactiv/)
        │                        ├─ YoactivClient (retry/backoff, auth-halt on 401/403, rate bucket)
        │                        ├─ identity.resolve_member (external_ref → exact email → unique phone; never name)
        │                        ├─ lifecycle.apply_invoice (Membership upsert; renewal = new row; never deletes)
        │                        ├─ sync cursors + dead letters + reconciliation + audit rows
        │                        └─ /api/v1/admin/yoactiv/* (OWNER only, dry_run default, 409 while unconfigured)
X2008 fingerprint ──ADMS push──► biometric.yoactiv.com  (UNCHANGED — Yoactiv owns the handshake)
        └── scans surface back through /checkins

InBody 120 ─► LookinBody120 ─► auto-export CSV ─► inbody_watch_agent.py (gym PC, outbound HTTPS)
        └────────────────────────► POST /api/v1/inbody/ingest/{secret} ─► parse→classify→BodyComposition ─► Progress

Mobile apps ◄────── authenticated GymFlow API only — never Yoactiv, never the key ──────┘
```

---

## 3. Demo script

Seed a fresh DB (`SEED_DEMO_DATA=true` then `python -m app.seed`). All demo
rows are `is_demo=true`. Every integration step is labelled LIVE / DEMO DATA
/ BLOCKED (see §5).

1. **OWNER — Karan Shetty (KS).** Role select → "Gym Owner" → login
   (`owner@slam.demo`) → dashboard → Members → open **Aditya Rao**:
   membership, assigned trainer (Vikas Menon), acquisition (Instagram /
   AUG-TRANSFORM), attendance, PT balance, payments. — **LIVE** (feature) on
   **DEMO DATA**.
2. **TRAINER — Vikas Menon (VM).** Role select → "Trainer" → login
   (`vikas.menon@slam.demo`) → Clients → **Aditya** → "Edit programming" →
   **Program Days** (browse templates / start from scratch / reorder). —
   **LIVE** on **DEMO DATA**.
3. **MEMBER — Aditya Rao (AR).** Role select → "Member" → login
   (`aditya.rao@member.slam.demo`). If a member's intake is blank →
   **first-time fitness onboarding** questionnaire → save → Home. → today's
   **Program Day** → start workout → **log a set** → **🏆 PR** detection +
   rest timer → Progress → tap an exercise → **real trend chart** + session
   history. — **LIVE** on **DEMO DATA**.
4. **Weekly schedule vs Today's Workout.** Show the "This week" strip and the
   Today's-Workout card agree on the split — one calendar rule, branch
   timezone. — **LIVE**.
5. **Attendance / InBody.** Aditya's check-in history and body-composition
   panel. — **DEMO DATA** (Yoactiv `/checkins` and InBody ingestion are
   **NOT YET CONNECTED**, §5).
6. **LIFECYCLE — Farah Sheikh.** Discontinued member: `is_active=false`,
   membership-gated actions (check-in, fingerprint, PT scheduling) refused,
   **all history retained** (workouts, sets, PRs, InBody, attendance, PT,
   membership rows, intake). Owner reactivates → gated actions work again,
   the entire prior journey reappears. — **LIVE** lifecycle logic on **DEMO
   DATA**.
7. **Role security.** From role select, pick "Gym Owner" and sign in with a
   member's credentials → a clear role-mismatch error, **no owner access**.
   Backend stays authoritative. — **LIVE**.

Full 15–20 minute script: §21.

---

## 4. Demo identities

| Role | Name | Initials | Notes |
| --- | --- | --- | --- |
| Owner | Karan Shetty | KS | spans all branches |
| Trainer | Vikas Menon | VM | assigned to Aditya, SLAM-NGK |
| Member | Aditya Rao | AR | "Elite Annual + PT", completed intake, campaign, Program Days, workout history, PRs, attendance, PT |
| Discontinued member | Farah Sheikh | — | `is_active=false`, full retained history, reactivatable by the owner |

Credentials come from the seed config (`DEMO_PASSWORD`), never shown in the
UI. To demonstrate onboarding, use a member created with no intake (or clear
one member's intake row) — Aditya's is deliberately complete.

---

## 5. LIVE / DEMO DATA / BLOCKED matrix

| Capability | Classification | Evidence |
| --- | --- | --- |
| Role selection → routing (context only, never authorization) | **LIVE** | `role-select-screen.test.tsx`, `login-screen.test.tsx` role matrix |
| Role mismatch refused (picked Owner, signed in as Member → error, no owner app) | **LIVE** | `login-screen.test.tsx` — 12 role-family cases + "never sends the chosen role to the server" |
| Auth / RBAC / branch isolation | **LIVE** | backend suite — server-authoritative, 617 pass |
| First-time fitness onboarding (incomplete intake → 3-step Fitness Journey → **Home**; survives logout) | **LIVE** | `member-onboarding.test.tsx` (8), `member-home.test.tsx` gate (3), backend `test_member_lifecycle.py` intake (2); **physical Pixel 6a verified** — walked all 3 steps, "Save and finish" persisted the intake and navigated to Home |
| Onboarding answers visible to trainer + owner (read-only "Fitness profile" section) | **LIVE** | `fitness-profile.test.tsx` (6), `test_trainer_desk.py` intake cases (2); **Pixel-verified** on both the trainer client-detail and owner member-detail screens |
| Member register → active → expired → **history retained** → reactivate | **LIVE (logic)** on **DEMO DATA (trigger)** | `test_member_lifecycle.py`, `yoactiv/lifecycle.py`, `test_yoactiv_connector.py` |
| Workout scheduling — weekly strip == Today's Workout, one calendar rule, branch tz | **LIVE** | `test_todays_workout_schedule.py` (10), `calendar-week.test.ts` (23); **physical Pixel 6a verified** (prior turn) |
| Program Days (trainer-defined, reorder, templates) | **LIVE** on **DEMO DATA** | mobile `programme`/`trainer-templates` tests; Pixel-verified |
| Workout execution + set logging + PR detection + rest timer | **LIVE** on **DEMO DATA** | mobile `workout-logging` tests; **Pixel-verified** (real set logged, PR fired) |
| Progress / exercise trend chart / session history | **LIVE** on **DEMO DATA** | `progress-exercise.test.tsx`, `bar-chart.test.tsx`; Pixel-verified (trend-chart scaling fix) |
| Yoactiv `/checkins` → `attendance_events` | **BUILT + UNIT-TESTED; not LIVE** | `test_yoactiv_connector.py`; live probe = `401 WWW-Authenticate: Basic` (§6) |
| Yoactiv `/invoices` → membership lifecycle | **BUILT + UNIT-TESTED; not LIVE** | `test_yoactiv_connector.py` — create / expire+deactivate / renew+reactivate / idempotent |
| Yoactiv enquiries / followups / PT trial | **CONTRACT VALIDATED end-to-end; mirror tables P1** | `sync.py::_apply_readonly_mirror` |
| X2008 fingerprint → Yoactiv → `/checkins` → GymFlow | **BLOCKED — REQUIRES REAL DEVICE + REAL YOACTIV ACCOUNT** | §7 |
| InBody scan → CSV → agent → `body_compositions` → Progress | **BUILT + TESTED (synthetic + real bulk-export header); not LIVE** | §8 |
| Android production AAB | **CONFIG READY, not built** | §10 |
| iOS production / TestFlight | **BLOCKED — no Apple credentials** | §11 |

**Nothing is presented as LIVE that is not.**

---

## 6. Yoactiv integration

**Built** (off unless `YOACTIV_ENABLED=true` + base URL + key + default
branch): `app/integrations/yoactiv/` — `client.py` (the 5 confirmed
operations only; `API_Key` header + optional HTTP Basic; retry with
exponential backoff + jitter on transport/5xx/429; **immediate halt on
401/403**; client-side rate bucket; injectable transport, stdlib default),
`mapping.py` (typed parsers from the real Postman response bodies),
`identity.py` (`resolve_member`: `external_ref` → exact email → **unique**
active phone → `ambiguous` → `none`; **never name**), `lifecycle.py`
(invoice → `Membership` upsert + `is_active`; renewal = new row; never
deletes), `sync.py` (overlapping incremental windows, idempotent upserts,
`YoactivDeadLetter`, `stuck` after 3 failures, per-run audit, `dry_run`,
`run_reconciliation`). Admin API `GET/POST /api/v1/admin/yoactiv/{status,sync,reconcile,dead-letters}`
— OWNER / SUPER_ADMIN only, `sync` defaults `dry_run=true`, `409` while
unconfigured. Migration `f1a2c3d4e5f6` (two additive tables). 23 tests.

**Confirmed contract:** `backdata.asmx` — GET, `API_Key` header,
`fromdate`/`todate` (`dd-MM-yyyy`), `{"Results":[…]}`. Operations:
`checkins`, `invoices`, `enquires`, `followups`, `ptTrialConversion`.
**Gaps handled explicitly:** no member/staff master endpoint (an unresolved
`Member_ID` becomes a dead letter, never a fabricated member); no
membership-status endpoint (derived from invoice `Billed_Services` dates);
no webhooks; no `updatedSince` (→ window overlap + weekly reconciliation);
no documented pagination.

**LIVE — BLOCKED (probe 2026-08-30).** The Data API host migrated to AWS
(`backstage.yoactiv.com`). Every path — including `backdata.asmx?WSDL` —
returns `401` with `WWW-Authenticate: Basic Realm`: **IIS HTTP Basic auth
sits in front of** the `API_Key` check. The 2022 collection carries no Basic
credentials; both keys in it 401 at that layer.

**Credential model (backend-only, never mobile):** `YOACTIV_BASE_URL`
(https), `YOACTIV_API_KEY`, `YOACTIV_BASIC_AUTH_USER`,
`YOACTIV_BASIC_AUTH_PASSWORD`, `YOACTIV_DEFAULT_BRANCH_ID`. Prefer a
dedicated read-only integration account over a normal Owner login unless
Yoactiv confirms otherwise. `assert_production_safe` refuses to boot with
`YOACTIV_ENABLED=true` unless the key, an `https://` base URL and the default
branch are all set. The key/password never appear in a response, log,
`/health`, error message, or git.

**To unblock (from SLAM's Yoactiv admin / Yoactiv support):**
1. HTTP **Basic username + password** for the Data API host.
2. The authoritative current **base URL**.
3. The current **`API_Key`** if rotated since 2022.
4. Whether **source-IP allowlisting** also applies.
5. A sandbox tenant + the real rate limits / result cap.

Then: set the 5 env values, restart, `GET /api/v1/admin/yoactiv/status`,
run `POST .../sync {"endpoint":"checkins","dry_run":true}` → review dead
letters → `dry_run:false`; then `invoices`.

---

## 7. X2008 integration

**Do not point the X2008 at GymFlow.** The physical unit (serial
`CUB7250201499`) is configured with ADMS server `http://biometric.yoactiv.com`,
a **fully working ZKTeco ADMS push server** — confirmed live 2026-08-30
(`GET /iclock/cdata?...&options=all` → real `GET OPTION FROM: CUB7250201499
… OK`; `/iclock/getrequest` answers). GymFlow's own ADMS receiver
deliberately does **not** implement that handshake — which is why the device
correctly sends GymFlow nothing.

**Architecture:** X2008 → Yoactiv ADMS → Yoactiv attendance → `/checkins` →
GymFlow sync → `AttendanceEvent`. GymFlow's `/api/v1/hardware/fingerprint/*`
receiver and the dev IP-mode route stay dormant; `ACCESS_CONTROL_ENABLED`
stays `false`; a second GymFlow ADMS receiver was **not** built.

**Status: BLOCKED — REQUIRES REAL DEVICE VALIDATION.** To close: unblock
Yoactiv (§6) → one real enrolled-finger scan at the branch → pull `/checkins`
for that window → verify member, timestamp, source/service fields, no
duplicate, correct branch mapping. Only then is it LIVE. **No simulated scan
will be called live.**

---

## 8. InBody integration

**Not via Yoactiv** — `inbodyintegrate.asmx` is write-only (`insertinbodydata`,
`setinbodydata`, `get_id`, `SendErr`, `HelloWorld`); no read endpoint,
confirmed against the live WSDL on both hosts.

**Path:** `InBody 120 → LookinBody120 → auto-export CSV → inbody_watch_agent.py
(gym PC, outbound HTTPS) → POST /api/v1/inbody/ingest/{INBODY_INGEST_SHARED_SECRET}?branch_id=
→ parse → classify (MATCHED / AMBIGUOUS / UNMATCHED / DUPLICATE / INVALID) →
import MATCHED only → body_compositions → Progress`.

**Built + tested:** `inbody_watch_agent.py` (folder watch, file-stability
check, retries, quarantine, outbound-only, stdlib + `requests`),
`app/api/v1/inbody.py` (URL-path shared-secret auth via `hmac.compare_digest`,
CSV + XLSX, audit rows, rate limit), `importer.py` (phone-only matching —
**never name**; dedup via `(member_id, external_ref)` + partial unique
`(member_id, measured_at)`).

**Verified 2026-08-30:** the real bulk export (87 columns / 1,345 rows)
resolves every required field plus `Test Date / Time` against
`importer._resolve_headers`; locked by
`test_inbody_import.py::test_parse_workbook_resolves_the_real_87_column_export_header`.

**Status: BLOCKED — REQUIRES GYM PC VALIDATION.** Still open: one real
per-scan **CSV** from LookinBody120 (different file from the bulk XLSX —
`parse_csv_export` header shape is still `UNVERIFIED`); one fresh scan
end-to-end; a duplicate test on real data. Historical bulk-import is **not**
for the demo.

---

## 9. Member lifecycle

`Member.is_active` is the discontinued flag — never a delete.

| Transition | Effect | Retained |
| --- | --- | --- |
| Staff registration → onboarding (member fills intake) | `Member` + `User` + `MemberIntake`; `external_ref` stamped when Yoactiv-sourced | — |
| Membership active | `is_active=True`; `Membership` row ACTIVE | — |
| Expired / cancelled | `is_active=False`; membership EXPIRED; check-in / fingerprint / PT-schedule refuse (`member_inactive`) | workouts, sets, PRs, InBody, attendance, PT history, membership rows, intake |
| Renewal / reactivation | `is_active=True`; **new** `Membership` row; prior journey reappears intact | everything |
| Deleted in Yoactiv | flagged `orphaned_external`, `is_active=False` | everything — never hard-deleted |

The Yoactiv connector contains **no `DELETE`** against `members`,
`workout_*`, `body_compositions`, `attendance_events`, or `pt_*`. Verified by
`test_member_lifecycle.py` + `test_yoactiv_connector.py`. A mobile
deactivate/reactivate affordance is a documented follow-up (`NEXT_STEPS.md`);
the action is owner-only API + backend today.

---

## 10. Android release

- `app.json`: `android.package = ai.gymflow.slam`, `versionCode 1`, version
  `1.0.0`. Blocked perms: RECORD_AUDIO, FINE/COARSE_LOCATION. `eas.json`
  `production` → `app-bundle`, `autoIncrement: true`, `appVersionSource:
  remote`.
- EAS project `0e5c0198-3600-46f1-aef8-edb6129ae0eb`; CLI authed as
  `saransharmamech@gmail.com` (accounts `sussaran`, `sussarans-team`).
- **Not built.** A production build spends EAS credits and runs 20–40 min
  remotely, and the `production` profile has **no `EXPO_PUBLIC_API_URL`** —
  it needs the real production backend host, which is not yet known.

**Manual step → Play Internal Testing:**
```bash
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://<prod-api-host>
eas build --platform android --profile production
eas submit --platform android --profile production --track internal   # later, with approval
```

---

## 11. iOS release

- `app.json`: `ios.bundleIdentifier = ai.gymflow.slam`, `buildNumber "1"`,
  `ITSAppUsesNonExemptEncryption = false`, camera usage string set.
- **BLOCKED — no Apple credentials.** `eas.json` `submit.production` is
  empty; no Apple Team ID / App Store Connect API key configured.

**Manual steps once Apple credentials exist:**
```bash
cd apps/mobile
eas credentials            # configure Apple Team + ASC API key
eas build --platform ios --profile production
eas submit --platform ios --profile production   # TestFlight — do NOT run unattended
```
Android and backend are **not** blocked by this.

---

## 12. Security checklist

| Check | Result |
| --- | --- |
| Collection API keys / Basic passwords in any tracked file | ✅ none (grep over `git ls-files` + working tree + history) |
| `.env` / `.env.*` gitignored (`.env.example` kept) | ✅ (`backend/.env`, `backend/.env.x2008-test`, `apps/mobile/.env` all untracked + ignored) |
| Vendor artifacts — `*.msi`, `*.postman_collection.json`, `*.xlsx`, `*.csv` | ✅ all gitignored this release |
| Yoactiv API key + Basic password | server-only config; never in a response, log, `/health`, serializer, or error; audit `_scrub` redacts `secret`/`token`/`password`/`key` |
| Mobile ever receives a Yoactiv credential | ✅ never — connector is backend-internal; no mobile route imports it; `apps/mobile/.env` holds only `EXPO_PUBLIC_*` |
| Role authorization | ✅ server-side; role-select `expected` param is client context only, never sent, never grants |
| InBody ingest secret / X2008 secrets | server-only; `hmac.compare_digest`; comm key + ADMS secret env-only |
| `ACCESS_CONTROL_ENABLED` default | ✅ `false` |
| `FINGERPRINT_ADMS_DEBUG_CAPTURE` / `FINGERPRINT_ADMS_DEV_IP_MODE` | ✅ default `false`; refused at boot in production/staging by `assert_production_safe` |
| Branch isolation / rate limiting / audit logging | ✅ enforced; 617 tests |
| HTTPS in production | ✅ `assert_production_safe` rejects a non-`https://` `YOACTIV_BASE_URL` when enabled |
| Raw biometric templates stored | ✅ **never** — the receiver stores only an enrolled-id + an allow/deny decision. **GymFlow does not receive or store biometric templates.** |
| `git diff --check` | ✅ clean |

---

## 13. Test results (2026-08-30)

| Suite | Result |
| --- | --- |
| Backend `pytest` | **617 passed** |
| Backend `ruff check` | clean |
| Backend `ruff format --check` | clean (136 files) |
| Backend `mypy app` | 10 pre-existing errors in 7 files (baseline, unchanged; not in the pre-commit gate). New code is mypy-clean. |
| Mobile `jest` | **501 passed**, 41 suites — under the default TZ **and** `TZ=Asia/Kolkata` |
| Mobile `tsc --noEmit` | clean (exit 0) |
| `git diff --check` | clean |
| Secret scan | clean |

**Integration/unit coverage added this release:** Yoactiv (endpoint
whitelist, auth-halt-not-retried, 5xx-retry-then-succeed, `{"Results":[…]}`
extraction + junk rejection, `dd-MM-yyyy`/`AM-PM` parsing, identity
resolution, checkins→attendance + idempotency, unresolved-member dead
letter, dry-run, cursor advance, `stuck` after 3, invoice→membership
lifecycle); InBody (real 87-column header, duplicate, invalid, header
validation); **role security** (12 role-family cases, "never sends the role",
"a member who picked Owner still cannot reach the owner app"); **onboarding**
(3-step walk-through, back keeps answers, gate on null intake, redirect to the
`(onboarding)` group, fail-open on fetch error, `MemberIntakeIn` payload
mapping, skip still saves a row, free-text goal, limitations note, save-failed
stays on step 3); **fitness profile** (each answered field labelled, real
limitation surfaced as a trainer note but "None" hidden, empty + all-skipped
states, `wants_pt` yes/no); **scheduling** (Sun /
Mon / Tue / week boundary / timezone boundary / rest phase / completed
workout / custom-program calendar rotation / stable same-day; zone-safe
`calendar.ts` in 4 timezones).

---

## 14. Build results

**None produced.** No EAS build was triggered (Android needs a production
API URL; iOS is blocked on Apple credentials). Config is release-ready — §10
/ §11 for the exact commands.

| Field | Value |
| --- | --- |
| Branch | `release/gymflow-pilot-20260830` |
| Commit SHA | *(recorded in the PR / final report)* |
| App version | `1.0.0` · Android `versionCode 1` · iOS `buildNumber 1` |
| EAS project | `0e5c0198-3600-46f1-aef8-edb6129ae0eb` |
| Environment | development (nothing promoted) |

---

## 15. Required manual steps

1. **Review the PR diff** and merge when satisfied (not auto-merged).
2. **Deploy the RC backend** to staging: `alembic upgrade head` (adds
   `yoactiv_sync_cursors`, `yoactiv_dead_letters` — additive, reversible),
   integration flags **off**, verify 617 tests + `assert_production_safe`.
3. **Yoactiv:** obtain the 5 unblock items (§6) → set env → `dry_run:true`
   sync for `checkins` and `invoices` → resolve the identity map →
   `dry_run:false`.
4. **X2008:** with Yoactiv live, run one real branch scan and verify the
   `/checkins` row (§7). Only then mark it LIVE.
5. **InBody:** run `inbody_watch_agent.py` on the gym PC for one fresh scan;
   send back one real per-scan **CSV** (header row is enough) to finish
   `parse_csv_export`.
6. **Android:** `eas env:create … EXPO_PUBLIC_API_URL` (needs the prod API
   host) → `eas build --platform android --profile production` → Internal
   Testing.
7. **iOS:** configure Apple Team / ASC API key (`eas credentials`) →
   `eas build --platform ios --profile production` → TestFlight.
8. **Physical Pixel 6a:** re-run the on-device pass for the role-mismatch
   guard and the onboarding flow once the RC backend is reachable (this
   release's other paths were Pixel-verified in the prior session; these two
   deltas are client-only and covered by 50 automated tests, but a device
   confirmation is still owed).
9. Optionally clear the 10 pre-existing `mypy` errors and wire a sync
   scheduler (both in `NEXT_STEPS.md`).

---

## 16. Known limitations

- Yoactiv, X2008, InBody **not LIVE** — §6–§8.
- Yoactiv secondary endpoints (enquiries / followups / PT trial) are
  contract-validated but their mirror tables are P1 (deferred).
- No member/staff master endpoint in the Yoactiv Data API → new Yoactiv
  members are discovered only via `/checkins` and `/invoices` rows.
- Yoactiv check-in timestamps are trusted from Yoactiv (documented exception
  to "server clock only", justified because Yoactiv is the attendance
  authority).
- The sync scheduler is not wired — runs are manual via the admin API. Small
  follow-up.
- Rate-limit counters are in-process (fine for one API instance; a
  multi-instance deploy needs a shared store).
- No mobile deactivate/reactivate affordance — owner-only API + backend.
- Member onboarding maps its style / experience / frequency / time answers
  onto the existing `MemberIntake` columns and enums — no schema change. A
  richer assessment (secondary goal, 12-week outcome, session duration,
  adherence barrier, a dedicated trainer-note field, a separate health /
  readiness flow) is specced in `NEXT_STEPS.md`, deferred to keep the RC
  small.
- The member-intake Postgres enums (`experience_level`,
  `preferred_training_style`, `preferred_time`, `contact_preference`) were
  created with the enum *values* as labels, not the member *names*
  SQLAlchemy persists by default — `models.py` now sets `values_callable` on
  those four so writes round-trip. No migration; `member_intakes` had zero
  rows on any real DB.
- The trainer/owner "Fitness profile" section is **read-only**. Creating or
  assigning a program is still the existing "Edit programming" action on the
  same screen; scheduling PT is unchanged. Wiring those as buttons inside the
  section is a follow-up.
- `mypy` has 10 pre-existing errors, not covered by the pre-commit gate.

---

## 17. Rollback

- **Abandon the branch:** it is not merged; delete it. `main` is untouched.
- **Reverted after merge:** revert the commit.
- **Deployed:** `alembic downgrade -1` drops the two new tables (no data
  loss — nothing else references them). Set `YOACTIV_ENABLED=false` and the
  connector is fully inert; no existing table was altered. The InBody agent,
  X2008 receiver, and Yoactiv connector are all flag-gated `false` by
  default — a deploy that ships them changes no runtime behaviour until an
  operator sets the flag + credentials.

---

## 18. Deployment

1. Merge the reviewed branch.
2. `alembic upgrade head` on staging (adds two tables; reversible).
3. Backend deploy with integration flags **off** — verify 617 tests + the
   app boots (`assert_production_safe` passes).
4. Turn Yoactiv on only after §6 is unblocked.
5. Wire a scheduler to call `run_endpoint_sync` per endpoint (~15 min) and
   `run_reconciliation` weekly.
6. Mobile: build + Internal Testing / TestFlight per §10 / §11.

See `docs/DEPLOYMENT.md` for the base production config contract.

---

## 19. Post-demo roadmap

Full detail in **`docs/NEXT_STEPS.md`**: week-1–2 unblock/wire-up, then
payments/billing → renewal automation → classes/booking → WhatsApp/SMS/email
→ retention analytics → grounded AI assistant → POS/inventory → multi-branch
intelligence → public booking → white-label → broader integrations, plus
security hardening (Redis rate limits, secret manager, credential rotation,
CI secret scanning, pen testing, biometric-data documentation) and
production observability + backups.

---

## 20. Environment variables (new this release)

```
# Yoactiv connector — backend only, never mobile. All blank by default.
YOACTIV_ENABLED=false
YOACTIV_BASE_URL=                 # https:// backdata.asmx root (required if enabled)
YOACTIV_API_KEY=                  # per-tenant API_Key (required if enabled)
YOACTIV_BASIC_AUTH_USER=          # IIS Basic user  (the live host needs this)
YOACTIV_BASIC_AUTH_PASSWORD=      # IIS Basic password
YOACTIV_DEFAULT_BRANCH_ID=        # tenant → GymFlow branch id (required if enabled)
YOACTIV_SYNC_WINDOW_DAYS=7  YOACTIV_SYNC_OVERLAP_DAYS=3  YOACTIV_RECONCILE_DAYS=90
YOACTIV_RATE_LIMIT_PER_MIN=60  YOACTIV_REQUEST_TIMEOUT_SECONDS=30
```
`assert_production_safe` refuses to boot with `YOACTIV_ENABLED=true` unless
`YOACTIV_API_KEY`, an `https://` `YOACTIV_BASE_URL`, and
`YOACTIV_DEFAULT_BRANCH_ID` are set.

---

## 21. Final 15–20 minute demo script

| # | Time | Who | Steps | Label |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | — | Role select → "Gym Owner" → login `owner@slam.demo`. | LIVE |
| 2 | 1:30 | Owner | Dashboard: members, renewals due, ready-for-PT, unworked-shift alerts, marketing. | LIVE / DEMO DATA |
| 3 | 3:00 | Owner | Members → **Aditya Rao**: membership, trainer, acquisition, attendance, PT, payments. | LIVE / DEMO DATA |
| 4 | 5:00 | — | Sign out → role select → "Trainer" → login `vikas.menon@slam.demo`. | LIVE |
| 5 | 6:00 | Trainer | Clients → Aditya → "Edit programming" → **Program Days** (templates / reorder). | LIVE / DEMO DATA |
| 6 | 8:00 | — | Sign out → role select → "Member" → login `aditya.rao@member.slam.demo`. | LIVE |
| 7 | 8:30 | Member | (If intake blank) **first-time onboarding** questionnaire → save → Home. | LIVE |
| 8 | 9:30 | Member | Home: "This week" strip and "Today's Workout" **agree** on the split. | LIVE |
| 9 | 10:30 | Member | Start today's workout → open first exercise → **log a set** → **🏆 PR** + rest timer. | LIVE / DEMO DATA |
| 10 | 12:30 | Member | Progress → tap **Leg Curl** → real trend chart + session history (real dates/weights). | LIVE / DEMO DATA |
| 11 | 14:00 | Member | Account avatar → sheet → **light / dark** toggle. | LIVE |
| 12 | 15:00 | — | Sign out → role select → pick **"Gym Owner"**, log in as the member → **role-mismatch error**, no owner app. | LIVE |
| 13 | 16:00 | Owner | Open **Farah Sheikh** (discontinued): gated actions refused, **all history retained**. Reactivate → journey returns. | LIVE (logic) / DEMO DATA |
| 14 | 18:00 | — | Integrations status: Yoactiv / X2008 / InBody each shown as **BLOCKED — pending credentials/hardware**, with the connector code and tests. | BLOCKED |
| 15 | 19:30 | — | Wrap: what is production-ready, what is one credential away. | — |

**Never present DEMO DATA as LIVE. Never present a blocked integration as
connected.**
