# GymFlow — Next Steps (post-demo roadmap)

Written 2026-08-30. Companion to `docs/DEMO_AND_PRODUCTION_READINESS.md`.
This is the ordered plan for what comes *after* the pilot release candidate.

**Shipped in the pilot RC** (`release/gymflow-pilot-20260830`): the Yoactiv
connector (built, off by default), InBody agent + ingest endpoint, member
lifecycle + self-service intake, the **3-step "Your Fitness Journey"
onboarding** flow (its own `app/(onboarding)/` route group + incomplete-intake
gate; "Save and finish" lands on Home; Pixel-verified) with the answers shown
read-only as a **Fitness profile** section on the trainer client-detail and
owner member-detail screens, **role-selection security** (the check runs in
`AuthContext.signIn` and refuses a mismatch before any session exists; backend
authoritative; 12-case matrix), the **workout-scheduling timezone fix** (one
calendar rule for the weekly strip and Today's Workout, Pixel-verified),
three physical-Pixel UI fixes (trend-chart scaling, PT-paused banner
clipping, avatar touch target), a low-opacity **editorial background-image
system** (`ScreenBackground`, six screens, light/dark, Pixel-verified), and
**trainer feedback + owner moderation + testimonials + rating analytics**
and **private progress photos + before/after + branded OS-share** (§0b).
660 backend + 544 mobile tests green.

---

## Real gym integration session — 2026-08-30

On-site session with the physical hardware (X2008 fingerprint terminal, InBody
120 + LookinBody120 on the gym Windows PC, gym LAN). Architecture unchanged:
Yoactiv stays the operational source of truth (X2008 → Yoactiv ADMS →
checkins → GymFlow); InBody flows InBody 120 → LookinBody120 auto-CSV →
GymFlow InBody agent, never through Yoactiv.

### InBody — LIVE (commit `637ea9c`, on the release branch)

Proven end-to-end with a **real InBody 120 scan**, no simulated data:

LookinBody120 auto-export (`C:\LookinBody120\EMR\CSV\...csv`) → InBody watch
agent on the gym Windows PC (outbound HTTPS, TLS pinned to a dev cert,
dedicated machine secret — not an Owner login) → `POST /api/v1/inbody/ingest`
→ matched to the member by phone → `body_compositions` row (weight / PBF /
SMM / BMI / VFL / BMR / TBW, `external_ref` = LookinBody Local ID) → surfaced
as latest in Progress. Re-sending the same file → `duplicate`, no second row.

Two real-world gaps the synthetic fixtures never hit, both fixed in `637ea9c`:

1. **Compact timestamp.** The per-scan CSV writes `Test Date / Time` as a
   run-together `YYYYMMDDHHMMSS` stamp (`20260830202104`), which no format in
   `_DATETIME_FORMATS` accepted → every row was `INVALID`. Added
   `%Y%m%d%H%M%S` + a date-only sibling.
2. **Timezone.** That stamp is the machine's local wall-clock with no zone,
   but was written straight into a `timestamptz` column → landed 5.5 h off
   (IST read as UTC). `classify_rows` now anchors `measured_at` to the
   matched member's **branch timezone** and converts to UTC before dedup and
   write (`_measured_at_utc`). Verified: a 20:21:04 IST scan now stores as
   `14:51:04Z` and reads back as 20:21:04 in branch time.

Watch agent (`backend/app/scripts/inbody_watch_agent.py`) rewritten for a
supervised rollout: `--only-new` default (first run baselines the ~1,400
existing exports, uploads nothing), never moves/renames files in the EMR
folder, state file kept next to the script, `--cacert`/`--insecure` for the
LAN TLS story, `--once` for a single pass, `--resend PATH` to prove
server-side dedup, `--process-existing` for a deliberate later back-fill.

**Still to do for InBody:** real HTTPS story for production (the session used
a self-signed cert on the LAN — a real cert or a tunnel is needed off-LAN);
reviewed `--dry-run` of the historical bulk export; run the agent as a
Task Scheduler service and watch an unattended multi-hour cycle.

### Yoactiv — BLOCKED (external, vendor)

`https://backstage.yoactiv.com/api/backdata.asmx` sits behind **IIS HTTP
Basic auth** (`WWW-Authenticate: Basic`, `Microsoft-IIS/10.0`) that rejects
every request *before* the `API_Key` header is evaluated — confirmed by
direct `curl` on all paths including `?WSDL`. `YOACTIV_ENABLED=false`. This
blocks the connector dry-runs (checkins, invoices), the real X2008 check-in
test, the real invoice → membership test, and the Yoactiv half of the
end-to-end.

To unblock, Yoactiv must provide:

- the **HTTP Basic username + password** for that host (distinct from the
  portal login and from the `API_Key`);
- confirmation the `API_Key` currently held is valid for the **SLAM
  Nagalkeni** tenant;
- confirmation `backstage.yoactiv.com/api/backdata.asmx` is the authoritative
  Data API host (vs. the older `biometric.yoactiv.com` ADMS host);
- whether the tenant **IP-allowlists** callers (our egress IP may need
  adding).

**Action:** the `API_Key` was exposed in a chat transcript during the
session — rotate it with Yoactiv before go-live regardless of the above.

### X2008 fingerprint — BUILT / UNVERIFIED

ADMS receiver + Yoactiv checkins sync are built and unit-tested but were not
exercised with a real fingerprint this session — the check needs the Yoactiv
Data API (above). The X2008 was left pointed at `biometric.yoactiv.com` and
not reconfigured.

---

## Immediate post-demo priorities (week 1–2)

1. **Unblock Yoactiv live access** — the 2026-08-30 on-site session confirmed
   `backstage.yoactiv.com` is behind an IIS HTTP Basic auth wall ahead of the
   `API_Key` check (see the session section above for the exact asks). Nothing
   Yoactiv-side can proceed until the vendor supplies the Basic credentials.
   Rotate the exposed `API_Key` in the same conversation.
2. **Wire the sync scheduler.** `run_endpoint_sync` and `run_reconciliation`
   exist but are invoked only by the admin API today. Add an APScheduler (or
   the platform's cron) job: each endpoint every ~15 min, reconciliation
   weekly. One-file change, plus a `sync_scheduler_enabled` flag.
3. **First real Yoactiv sync**, `dry_run:true` → review the dead-letter queue
   (unresolved `Member_ID`s, ambiguous phones) → resolve the identity map →
   `dry_run:false` for `checkins` then `invoices`.
4. **X2008 real-device check** at the branch (readiness doc §7). Confirm a
   real scan reaches `/checkins` with correct member/timestamp/branch.
5. **InBody historical back-fill** — the per-scan CSV shape is confirmed and
   `parse_csv_export` is live end-to-end (2026-08-30 session, commit
   `637ea9c`). Remaining: a reviewed `--dry-run` of the ~1,345-row historical
   bulk export against the loaded member set, then a supervised `--process-
   existing` run; and a production TLS story for the ingest endpoint (the
   session used a self-signed cert on the LAN).
6. **Android build → Play Internal Testing.** Set `EXPO_PUBLIC_API_URL` on the
   `production` EAS profile, run `eas build --platform android --profile
   production`, distribute to internal testers.
7. **Apple credentials** → iOS `eas build` → TestFlight.
8. **Yoactiv secondary mirror tables** (enquiries, followups, PT trial) — the
   connector already validates these rows; add `yoactiv_enquiry_mirror` /
   `_followup_mirror` / `_pt_commercial_mirror` and flip
   `_apply_readonly_mirror` to persist.

---

## Feature roadmap (priority order)

### 0. Fitness onboarding depth + health readiness

The RC onboarding is deliberately three steps and writes only the existing
`MemberIntake` columns. The next iteration adds the questions that need a
schema change, plus a separate readiness flow — each is migration + API + UI +
tests, kept out of the RC to protect stability.

- **Schema-expanding intake fields** (one Alembic migration, additive):
  `secondary_goal` (text), `target_outcome_12w` (text — "a measurable thing
  in 12 weeks"), `session_duration_minutes` (int), `adherence_barrier`
  (enum: time / motivation / knowledge / injury / travel / other),
  `trainer_note` (text — a dedicated member-authored note, distinct from the
  `limitations` field the RC overloads). Surface them in the onboarding flow
  as an optional "Tell your trainer more" step and in the Fitness profile
  section.
- **Separate health / readiness assessment** — a distinct, trainer-run flow
  (not first-run onboarding, not member self-serve as medical advice): a
  PAR-Q-style checklist, injury history, clearance state, a
  `readiness_status` on the member. The RC onboarding already says in copy
  "this is not a medical form"; this is where the real screening lives. Gate
  "start a program" on a recorded readiness where the branch requires it.
- **Owner aggregate insights** — once the fields above exist: goal mix,
  barrier mix, PT-interest rate, average target session length per branch.
  Read-only dashboard cards over `member_intakes`; no new write path.
- **Intake → program recommendation** — map (goal, experience, days,
  duration, style) to a suggested template + starting volume. Strictly a
  *recommendation* surfaced to the trainer; the trainer still creates and
  approves the program. Never auto-prescribes.
- **Fitness-profile actions** — turn the read-only section into an action
  surface: "Create / assign a program" and "Schedule PT" inline, prefilled
  from the intake.

### 0b. Trainer feedback + progress photos — follow-ups

Shipped this pass (`test_trainer_reviews.py` 23, `test_progress_photos.py`
20, plus the mobile suites): post-workout rating → owner moderation
(approve / reject / remove / private note, audit-logged, no self-approval)
→ approved-only testimonials with withheld identity by default; rating
analytics (avg / count / recent trend / approved count); private progress
photos with per-request authorisation, consent-gated trainer/owner view,
signed short-lived image URLs, before/after, and a user-initiated OS-share
card that carries only the fields the member picks. Deferred:

- **Cloud object storage for progress photos.** The `PhotoStorage` Protocol
  ships with `LocalDiskPhotoStorage` (a private dir, `0o600` files, streamed
  only through the authorised endpoint). An **`S3PhotoStorage` / GCS adapter**
  drops in with no schema change and no caller change — it needs a bucket +
  credentials + a decision on server-side encryption and lifecycle rules.
  Until then LIVE cloud storage is **BLOCKED**; the local store is
  production-usable on a single private, encrypted volume.
- **Hard-purge job** for `progress_photos` rows soft-deleted longer than the
  retention window (bytes are already purged on delete; this removes the
  tombstone row and any orphaned `progress_photo_shares`).
- **EXIF / metadata strip** on upload — currently the bytes are stored as
  received. Strip GPS and camera metadata server-side before `put()`.
- **Rate-limit** the upload and the image endpoints per member (they use the
  default bucket today).
- **AI sentiment / theme extraction on testimonials** — explicitly *not*
  built. When it is: rule-based and explainable first (keyword themes,
  rating distribution), a model only with enough labelled history, and never
  a score shown without its "why". Never used to rank or hide a review
  automatically — moderation stays a human decision.
- **`react-native-view-shot` polish** — the share card renders in the sheet
  and is captured from there. A dedicated off-screen render at a fixed export
  size (e.g. 1080×1350) would give a crisper, consistently-framed image.
- **Push a "new review to moderate" alert** to the owner via the existing
  `Notification` / alert pipeline once WhatsApp/SMS lands (§4).
- **PT-session review entry point** — the backend already accepts
  `pt_session_id`; add the prompt after a PT session is completed in the
  trainer/member PT screens (today only own-workout completion triggers it).

### 1. Payments / billing

Yoactiv is the source of truth for money. Phase 1: **mirror** invoices +
payments read-only (`invoices` endpoint already pulled; add
`yoactiv_invoice_mirror` + `yoactiv_payment_mirror` keyed on `bill_id` /
receipt no.) so the owner dashboard shows real revenue, outstanding balances,
renewal-due lists. Phase 2 (only if SLAM wants collection *in* GymFlow): a
GymFlow-native invoice/receipt model + a payment gateway (Razorpay is already
a Yoactiv integration; reuse that merchant account). Do **not** duplicate
Yoactiv's billing logic — mirror first, originate later only on request.
**Pricing note:** confirm whether Yoactiv's Data API / write-back is a paid
add-on before depending on it.

### 2. Membership renewals automation

Built on the lifecycle already implemented (`yoactiv/lifecycle.py`). Add: a
daily job that reads mirrored membership `ends_on`, produces a
"renewals due in N days" list per branch, and (once WhatsApp/SMS lands) fires
reminders. Owner UI: a renewals board with one-tap "mark contacted". Renewal
*payment* stays in Yoactiv; GymFlow drives the outreach.

### 3. Classes / scheduling / booking

Yoactiv has classes + `checkins` already flag class check-ins
(`Medium/Staff = "Backstage Class Checkin"`). Phase 1: read-only class
schedule mirror + member "my classes" view. Phase 2: in-app booking that
writes back to Yoactiv (needs a Yoactiv *write* endpoint — currently
unconfirmed; ask the vendor). Trainer availability (`trainer_availability`
table) already exists for the PT side and can be reused.

### 4. WhatsApp / SMS / email automation

`INotificationProvider` + `OutboxNotificationProvider` already exist; today
notifications land in-app only. Add a real channel: WhatsApp Business (Yoactiv
uses Gupshup — reuse), templated messages for renewal reminders, trainer
late/absent alerts, PT reminders, InBody-result-ready. Needs: approved
sender, templates, opt-out handling (readiness doc / `INTEGRATIONS.md`
WhatsApp section lists the exact asks).

### 5. Retention / churn analytics

`IIntelligenceProvider` scaffold exists and deliberately makes no prediction
yet. With real attendance + membership + PT history flowing from Yoactiv,
build: attendance-decay churn signal, PT-package burn-down, renewal
propensity. Start rule-based and explainable (restate counts), graduate to a
model only when there's enough labelled history. Never show a score without a
"why".

### 6. Real AI assistant grounded in GymFlow data

An assistant that answers owner/trainer questions ("who's due to renew?",
"which trainers are behind on programs?", "show Aditya's progress") strictly
over GymFlow's own tables + mirrored Yoactiv data — retrieval over the DB,
not a free-form model. Read-only first. Reuse the Claude API. Guardrails:
branch-scoped, RBAC-aware, cites the rows it used.

### 7. POS / inventory / expenses

Only if SLAM runs retail (supplements, merch) through GymFlow. New models:
products, stock, sales, expense categories. Ties into payments (#1). Lower
priority unless there's explicit demand — Yoactiv may already cover it.

### 8. Multi-branch intelligence

GymFlow is already branch-aware end to end. Add: cross-branch owner
dashboards (occupancy, revenue, trainer utilisation, churn) with drill-down,
branch benchmarking, chain-wide incentive tuning (the `IncentiveRule` table
already supports a null-branch global rule).

### 9. Public booking / website

A public, unauthenticated surface: class timetable, trial booking, lead
capture → writes an enquiry (to GymFlow, and to Yoactiv `enquires` if a write
endpoint exists). Reuses the classes work (#3). Consider an embeddable widget
like Yoactiv's own iframe plugins.

### 10. White-label / branded app

`app.json` already carries SLAM branding (`ai.gymflow.slam`, dark theme,
icons). To white-label: extract branding to a config (name, colours, icons,
bundle id) and a per-tenant build profile in `eas.json`; EAS supports this
cleanly. Only worth doing after a second gym signs.

### 11. Broader integration ecosystem

Behind the existing `app/integrations/base.py` protocols: Google/Apple
calendar for PT sessions, Strava/Apple Health/Google Fit for member
cardio/steps, Zoom (already a Yoactiv integration) for online PT, accounting
export (Tally/QuickBooks) off the payments mirror.

---

## Security hardening (ongoing)

- Move rate-limit counters to a shared store (Redis) before running >1 API
  instance — current counters are in-process (`rate_limit.py` says so).
- Rotate the Yoactiv `API_Key` and Basic password on a schedule once live;
  keep them in a secrets manager, not plain env, in production.
- Scoped/read-only Yoactiv key if the vendor can issue one.
- Clear the 10 pre-existing `mypy` errors and add `mypy` to the pre-commit
  gate so type regressions are caught.
- Add a CI secret-scanner (gitleaks/trufflehog) — tonight's manual scan was
  clean but it should be automated given the number of credentials in play.
- Penetration-test the InBody ingest + (future) any Yoactiv write-back
  endpoint.
- Confirm biometric data-handling posture in writing for SLAM: GymFlow never
  receives or stores a fingerprint template; document it for their records.

---

## Production observability (before the pilot scales)

- Structured logging is in place (`gymflow.*` loggers, `adms_*`,
  `inbody_ingest_*`, `yoactiv_sync`). Ship logs to a real aggregator.
- Metrics: sync run duration / rows / dead-letter rate per endpoint;
  attendance write rate; ingest failures; 4xx/5xx rates. The
  `yoactiv_sync_cursors` table already holds `last_success_at` /
  `consecutive_failures` / `status` — surface it on a health dashboard and
  alert on `stuck`.
- Alerting: Yoactiv `auth_failed` (halted connector), any cursor `stuck`,
  InBody quarantine growth, migration drift.
- Error tracking (Sentry or similar) on both backend and mobile
  (`expo-observe` is available for the mobile side).
- Uptime checks on `/health` and (once live) a synthetic Yoactiv `status`
  probe.
- Backups + tested restore for the Postgres DB before real member data lands.

---

## Pricing / add-on implications to resolve with vendors

| Question | Ask whom | Blocks |
| --- | --- | --- |
| Is the Yoactiv **Data API** a paid add-on? What tier? | Yoactiv / SLAM account owner | turning the connector on |
| Does Yoactiv offer any **write** endpoints (booking, enquiry create, attendance)? Cost? | Yoactiv | classes booking (#3), public booking (#9) |
| Cost of the **InBody Push Application** / any InBody cloud (LookinBody Web) subscription — and is any of it needed given we read the local export? | InBody / SLAM | nothing (current design avoids it) — but confirm |
| WhatsApp Business messaging costs (Gupshup via Yoactiv, or direct) | Gupshup / Meta | WhatsApp automation (#4) |
| EAS build/subscription tier for ongoing production builds + OTA updates | Expo | release cadence |
| Apple Developer Program + Google Play Developer account status | SLAM | iOS/Android store presence |

---

## Not doing (explicitly out of scope unless asked)

- Making Yoactiv the source of truth for any training/progress data.
- A second GymFlow ADMS path for the X2008 — the device stays on Yoactiv.
- Bulk-importing the 1,345-row historical InBody export without a reviewed
  dry-run and explicit sign-off.
- Any public app-store submission without explicit approval.
