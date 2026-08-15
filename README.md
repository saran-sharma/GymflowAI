# GymFlow AI

**The smart operational layer for SLAM Fitness Studio — Nagalkeni, Boganhalli,
Alandur.**

GymFlow AI runs the two things SLAM's day turns on.

**Trainer accountability.** Who is working, who checked in, who is late, who is
absent, who left early, who never checked out — and what that adds up to over a
month in punctuality and incentive eligibility.

**The SLAM 45-day journey.** Days 1–3 assessment and cardio, days 4–45 the PPL
rotation, and on Day 45 the programme completes *itself*: the summary is
written, the member becomes eligible for PT, the owner is alerted and a
follow-up task opens, with nobody pressing anything.

Around those sit PT packages and sessions, group classes with RSVP and real
attendance, acquisition sources and referrals, and an in-app alert centre.

It is not a replacement for Yoactiv, and it works with every integration
switched off — which is how it ships.

```
GymFlow Mobile  ──►  GymFlow API  ──►  PostgreSQL
React Native         FastAPI            Alembic migrations
Android + iOS        Roles enforced     Branch-scoped
```

**Every attendance time comes from the server clock.** The mobile app tells the
API *what* happened — which branch, which method, which credential — and never
*when*. There is no field for a phone to lie in.

## What's here

| Path | What it is |
| --- | --- |
| [`apps/mobile/`](apps/mobile) | The V1 product. React Native · Expo · TypeScript. Owner, Trainer and Member apps in one binary. |
| [`backend/`](backend) | FastAPI. Authentication, roles, branch isolation, the shift/punctuality/incentive engines, the 45-day journey, PT, classes, marketing, alerts, audit. |
| [`database/migrations/`](database/migrations) | Alembic migrations for the 35-table schema. |
| [`tests/backend/`](tests/backend) | 234 tests: rules, permissions, branch isolation, journey day boundaries, PT balances, end-to-end journeys. |
| [`apps/web-demo/`](apps/web-demo) | The original browser demo, kept intact. Still published to GitHub Pages. |
| [`docs/`](docs) | Architecture, integrations, development, deployment, Codespaces, Android builds. |
| [`.devcontainer/`](.devcontainer) | Codespaces runtime — Node, Python and PostgreSQL, nothing installed locally. |

## Getting it running

**Zero install — GitHub Codespaces.** Code → Codespaces → Create codespace.
Node, Python and PostgreSQL all run in the container; the setup script installs
everything, migrates, seeds and writes both `.env` files.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/saran-sharma/GymflowAI)

```bash
npm run api        # FastAPI on :8000
npm run mobile     # Expo, tunnelled so a real phone can connect
npm run verify     # lint, backend tests, typecheck, mobile tests
```

Port 8000 must be **public** for a phone to reach the API — see
[docs/CODESPACES.md](docs/CODESPACES.md).

**On your own machine** — needs Node 22, Python 3.11 and PostgreSQL 16. Full
instructions in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Demo logins (all fictional, all flagged `DEMO` in the database):

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@slam.demo` | `SlamDemo2026!` |
| Trainer | `vikas.menon@slam.demo` | `SlamDemo2026!` |
| Member | `aditya.rao@member.slam.demo` | `SlamDemo2026!` |

Trainer check-in PIN: `246813`

## The three apps

**Trainer** — SHIFT · ATTENDANCE · SESSIONS · PROFILE. Open, see your name,
branch and shift, press one thing. Scan the branch QR or type your PIN; the
confirmation shows the *server's* time and the status it produced. Then today's
schedule — PT, group classes and own-workout support — your month's punctuality
and incentive standing, and a way to appeal a late mark or a forgotten
check-out. A trainer can record what happened; a trainer can never edit a
timestamp.

**Owner** — DASHBOARD · TRAINERS · INCENTIVES · MARKETING · PROFILE. The six
accountability numbers above the fold, one card per branch, then **NEEDS
ATTENTION**: late trainers, missing check-outs, unworked shifts, pending
corrections, Day-45 members ready for PT, low PT balances, expiring
memberships, poor class turnout. Every row opens the person or member it is
about. Branch performance, marketing, class turnout, the correction queue and
settings sit one tap away.

**Member** — HOME · WORKOUT · PT · PROGRESS · PROFILE. The 45-day journey
first: which day, which phase, today's split. The workout screen carries the
PPL chart with sets, reps and rest, and ticking it off completes the journey
day server-side. PT shows the balance ("6 / 20 completed, 14 remaining") and,
after Day 45, the conversion offer. Progress keeps gym visits, own workouts, PT
sessions and group classes as four separate things, and reserves an empty slot
for InBody rather than inventing body-composition numbers.

## The 45-day journey

```
Day 1 – 3     assessment + cardio        recorded by a trainer
Day 4 – 45    push / pull / legs         the member ticks off their own chart
Day 45        completes itself           summary · PT eligibility · alert · task
```

Day numbers are derived from the server clock, and each journey stores the
rules it was created with — so retuning the programme length tomorrow cannot
move the finish line for someone already halfway through one.

The Day-45 automation is idempotent and runs on every read of a journey as well
as from the scheduled sweep. Opening the app completes a finished journey;
the sweep catches whoever never opens it. Nothing waits for a button.

## How the rules work

An 18:00–21:00 shift with a 10-minute grace:

| | |
| --- | --- |
| 18:00 – 18:10 | **ON TIME** |
| 18:11 onward | **LATE** |
| Check-out before 21:00 | **EARLY EXIT** |
| No check-in once the shift closed | **ABSENT** |
| Check-in, no check-out | **MISSING CHECKOUT** |

Nothing above is hardcoded. Grace periods, check-in windows, punctuality
weights, incentive thresholds, journey length, the PPL rotation, PT package
sizes, class capacity and every alert threshold are rows in `settings` and
`incentive_rules`, resolvable per shift, per branch, or chain-wide, and
editable from the owner's Settings screen. The rules in force are
snapshotted onto each attendance record, so re-tuning tomorrow cannot rewrite
yesterday's verdicts.

Incentive output is **eligibility only** — never a payout figure — and always
carries *"Final payroll/incentive calculation is subject to SLAM policy."*

## Check-in security

QR proves *location*: the code on the branch's desk screen is an HMAC of that
branch's server-side secret and the current 60-second window, so it rotates
continuously and a photographed code stops working almost immediately. Only
management can display it.

PIN proves *identity*: bcrypt-hashed, rate limited, and never usable for login.

Duplicate check-in, duplicate check-out, check-out without check-in, checking in
at a branch you are not assigned to, and check-ins far outside the shift window
are all refused with a message the trainer can act on. Login, check-in,
check-out, corrections, roster changes, rule changes and admin actions are all
written to `audit_logs`, scrubbed of anything credential-shaped.

Fingerprint, RFID and face are **not** in V1. The `IAccessControlProvider`
interface is ready for them, and GymFlow never receives or stores a biometric
template.

## Integrations

Yoactiv, InBody, access-control hardware, WhatsApp and member intelligence all
have contracts in [`backend/app/integrations/`](backend/app/integrations) and
are **all disabled**. The core product is required to work that way, and the
test suite asserts it.

Two consequences you can see in the product: alerts are delivered in-app only,
and the member's body-composition panel is empty and labelled rather than
filled with plausible numbers. `body_compositions` is a real table waiting for
InBody; no V1 workflow reads or writes it.

Nothing invents a vendor API. Where documentation is missing — Yoactiv above
all — the provider raises with what is actually needed rather than returning
empty results that would read as "there is no data". See
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the exact list of what to
obtain.

## Checks

```bash
npm run verify     # everything: lint, 234 backend tests, typecheck, 47 mobile tests
```

CI runs the same three suites on every pull request, backed by a real
PostgreSQL service.

## Android builds

On EAS Build — Expo's hosted service — so no Android Studio anywhere, including
CI. **Actions → EAS Android build → Run workflow**, choosing a profile and the
API URL the build should talk to.

An Expo account, an EAS project id and an `EXPO_TOKEN` secret are needed first;
[docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md) lists exactly what to obtain.

## Design

Matte black surfaces (`#08080A` → `#141417`), one premium red (`#EF2B3C`),
white and dark grey. High contrast, large touch targets, bottom navigation,
loading/empty/error states everywhere. Carried over from the web demo so the
two read as one product.

---

**SLAM × GymFlow AI** — Trainer accountability, first.

## Demo data

Demo data is temporary. It exists only so the mobile app's screens, charts and
workflows can be evaluated before the eSSL X990, YoActiv and InBody
integrations are connected, and it is written through the same models and APIs
those integrations will eventually populate — there is no separate demo
endpoint anywhere.

Every seeded row carries `is_demo = true`. Seeded payments also carry a
`DEMO-` receipt prefix, so they are identifiable in a payment report by someone
who cannot see the column.

```bash
npm run seed          # idempotent — safe to run repeatedly
npm run seed:reset    # wipe demo rows, then seed

python -m app.scripts.clear_demo_data --dry-run   # report, delete nothing
python -m app.scripts.clear_demo_data --yes       # delete demo rows only
```

Cleanup deletes on the `is_demo` flag and nothing else, so a member who signed
up at the front desk is never in scope. It refuses to run without `--yes`, and
it is deliberately not wired into application startup — nothing should drop
rows because a process restarted.

When the integrations land: stop seeding, run the cleanup, confirm only real
data remains, then remove the demo-only code.
