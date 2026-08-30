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
calendar rule for the weekly strip and Today's Workout, Pixel-verified), and
three physical-Pixel UI fixes (trend-chart scaling, PT-paused banner
clipping, avatar touch target). 617 backend + 501 mobile tests green.

---

## Immediate post-demo priorities (week 1–2)

1. **Unblock Yoactiv live access** — get the IIS Basic auth user/password,
   the authoritative base URL, and confirmation the `API_Key` is current
   (see readiness doc §6). This gates the whole operational sync.
2. **Wire the sync scheduler.** `run_endpoint_sync` and `run_reconciliation`
   exist but are invoked only by the admin API today. Add an APScheduler (or
   the platform's cron) job: each endpoint every ~15 min, reconciliation
   weekly. One-file change, plus a `sync_scheduler_enabled` flag.
3. **First real Yoactiv sync**, `dry_run:true` → review the dead-letter queue
   (unresolved `Member_ID`s, ambiguous phones) → resolve the identity map →
   `dry_run:false` for `checkins` then `invoices`.
4. **X2008 real-device check** at the branch (readiness doc §7). Confirm a
   real scan reaches `/checkins` with correct member/timestamp/branch.
5. **InBody CSV shape** — one real per-scan auto-export CSV from the gym PC to
   finish `parse_csv_export`; then a `--dry-run` of the 1,345-row historical
   export against the loaded member set.
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
