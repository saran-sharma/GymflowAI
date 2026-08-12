# GymFlow AI — architecture

V1 exists to answer one question for SLAM's owner: **is the trainer who was
supposed to be on the floor actually on the floor?** Every structural decision
below serves that, and nothing else was built.

```
┌──────────────────────┐
│  GymFlow Mobile      │   React Native · Expo · TypeScript
│  Android + iOS       │   Owner / Trainer / Member apps in one binary
└──────────┬───────────┘
           │ HTTPS, REST, bearer token
           ▼
┌──────────────────────┐
│  GymFlow API         │   FastAPI · Python 3.11
│  Roles, shift engine │   Every permission enforced here
└──────────┬───────────┘
           │ SQLAlchemy
           ▼
┌──────────────────────┐
│  PostgreSQL 16       │   Alembic migrations
└──────────────────────┘
```

**The mobile app never connects to PostgreSQL.** It has no database driver, no
credentials, and no path to one. Everything goes through the REST API.

## Repository layout

```
apps/
  mobile/            React Native / Expo app (Android + iOS)
  web-demo/          The original Vite demo, moved here intact
backend/
  app/
    api/v1/          Routers — one per resource
    core/            Config, clock, security, RBAC, rate limiting
    db/              Models and session
    domain/          Pure business rules (shift, punctuality, incentive, QR)
    services/        Orchestration over the domain and the database
    integrations/    Provider interfaces + V1 local implementations
database/
  migrations/        Alembic
docs/
tests/backend/       pytest
```

### Structural decisions worth explaining

**The web demo moved rather than being deleted.** It is the origin of the
visual language the mobile app uses — matte black, one premium red, tight
negative-tracked numerals — and it remains the fastest way to show the concept
in a browser. It moved to `apps/web-demo/` and the GitHub Pages workflow was
repointed at it, so the published demo still works.

**Integrations live in `backend/app/integrations/`, not a top-level
`integrations/`.** The brief reserved a top-level folder. Every provider here
is Python that the API imports at request time, and a top-level package outside
the application root would need either path manipulation or a second installable
package to import cleanly — friction with no benefit. The folder names inside
match the brief exactly: `yoactiv/`, `inbody/`, `access_control/`, `whatsapp/`,
`intelligence/`.

**`domain/` is separate from `services/`.** The rules that decide *late*,
*early exit*, *absent* and *eligible* are pure functions over explicit
arguments — no database, no clock, no framework. That is why they can be tested
exhaustively without a fixture, and why re-tuning a threshold cannot
accidentally change how a status is derived.

**Every branch-sensitive table carries `branch_id` directly** rather than
reaching it through a join. Branch isolation then becomes one predicate,
applied the same way in every query, instead of a different traversal per
endpoint.

## The rules that matter

### Server time, always

`app/core/clock.py` is the only source of "now". Attendance requests carry
*what* happened — which branch, which method, which credential — and never
*when*. A phone with a wound-forward clock changes nothing; there is no field
for it to change.

`clock.freeze()` exists so tests can pin time. No production path knows about
it.

### The shift engine

Configurable, per shift → per branch → chain-wide → code default:

| Rule | Default | Where it comes from |
| --- | --- | --- |
| Grace period | 10 min | `shift.grace_minutes` |
| Early-exit grace | 0 min | `shift.early_exit_grace_minutes` |
| Earliest check-in | 60 min before | `attendance.allow_checkin_before_shift_minutes` |
| Latest check-in | 120 min after end | `attendance.allow_checkin_after_shift_minutes` |
| Methods live | `["qr", "pin"]` | `attendance.methods_enabled` |

An 18:00–21:00 shift with a 10-minute grace: 18:00–18:10 is ON TIME, 18:11 is
the first LATE minute. Checking out before 21:00 is EARLY EXIT. No check-in
once the shift has closed is ABSENT — but only *once it has closed*; mid-shift
silence is still SCHEDULED, because "has not arrived yet" and "never arrived"
are different facts.

Shifts crossing midnight are handled: a 22:00–06:00 shift ends the following
day, and its check-out is accepted on that day.

**The rule snapshot is stored on each `trainer_attendance` row.** Re-tuning the
grace period tomorrow cannot silently rewrite yesterday's verdicts.

### Check-in credentials

| Method | Proves | How |
| --- | --- | --- |
| QR | *location* | HMAC of the branch's server-side secret and the current 60-second window. Rotates continuously; a photographed code dies almost immediately. Only management can display it. |
| PIN | *identity* | bcrypt-hashed, 4–8 digits, rate limited. Never used for login. |

Fingerprint, RFID and face are declared in `CaptureMethod` so the schema and
reports need no migration when hardware lands, but the API rejects them today.

### Punctuality

- On-time % = on-time days ÷ **present** days (an absence is not also "late")
- Attendance % = present days ÷ **rostered** days
- Overall score = weighted blend, weights configurable

### Incentive

Eligibility only — never a payout figure, and every response carries
*"Final payroll/incentive calculation is subject to SLAM policy."*
Thresholds live in `incentive_rules` (chain default, optional branch override).
A trainer who misses only by less than the review band lands in NEEDS REVIEW
rather than a flat no.

## Roles

| Role | Sees |
| --- | --- |
| SUPER ADMIN | Everything, plus configuration |
| OWNER | All three branches, plus configuration |
| BRANCH MANAGER | Their branch only |
| TRAINER | Their own record only |
| MEMBER | Their own membership and visits |

Enforced in `app/core/deps.py` on every request. The mobile app also hides what
a role cannot use — that is presentation, not security.

## What V1 deliberately does not do

No offline check-in queue (an event written from a phone clock, or replayed
hours later, would be exactly the record this product exists to make
trustworthy). No payroll. No CRM. No biometric hardware. No live Yoactiv,
InBody or WhatsApp integration. No AI on any critical path.
