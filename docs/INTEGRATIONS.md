# Integrations — contracts now, implementations later

Every integration is **off** in V1. The core product is required to work with
all of them disabled, and `tests/backend/test_integrations_and_config.py`
asserts exactly that.

Each one sits behind a `Protocol` in `backend/app/integrations/base.py`:

| Interface | V1 provider | Future provider |
| --- | --- | --- |
| `IMemberProvider` | `LocalMemberProvider` (GymFlow's own database) | Yoactiv |
| `ITrainerProvider` | `LocalMemberProvider` | Yoactiv |
| `IAttendanceProvider` | GymFlow's own events | Yoactiv |
| `IBodyCompositionProvider` | `NullBodyCompositionProvider` | InBody — writes to the empty `body_compositions` table |
| `IAccessControlProvider` | `SoftwareAccessControlProvider` (QR + PIN) | Turnstile / fingerprint / RFID / face |
| `INotificationProvider` | `OutboxNotificationProvider` (in-app) | WhatsApp, Expo push |
| `IIntelligenceProvider` | `RuleBasedIntelligenceProvider` (deterministic) | A model |

`backend/app/integrations/registry.py` is the single place that decides which
implementation is live, so turning one on is an environment change.

**A disabled provider raises rather than returning empty results.** An invented
Yoactiv client returning `[]` would read as "Yoactiv has no members", which is a
claim we cannot make. `IntegrationDisabled` says what is actually true and what
is needed to fix it.

---

## Yoactiv — ACTION REQUIRED

Yoactiv is SLAM's system of record for members, trainers, memberships and
payments. Nothing here invents an endpoint, a payload shape or an auth scheme,
and nothing scrapes the product.

**What:** Yoactiv API access.
**Why:** to sync members, trainers, memberships and attendance instead of
maintaining them twice.
**Exact values/access needed:**

1. API documentation (or a support contact who can provide it)
2. Authentication scheme — API key, OAuth, or session; and how credentials are issued
3. Base URL for SLAM's tenant
4. Endpoint list for: members, trainers, memberships, payments, attendance
5. Rate limits, and the expected page size for list endpoints
6. Whether webhooks exist, and which events they cover
7. Whether attendance can be *read* only, or also *written*
8. A sandbox or test tenant

Until then: GymFlow owns its own member and trainer records. V1 does not depend
on Yoactiv in any way, and the local provider means switching later is a
registry change rather than a rewrite.

---

## InBody

**Machine and software are now confirmed, not a guess:** InBody 120,
reporting into LookinBody120, exported as Excel. SLAM's export carries 1,345
InBody measurement records (87 columns) and a separate 845-record Blood
Pressure sheet — the two are different data and are not assumed to share a
row shape. Identity in the export: InBody's own "ID" field is the member's
phone number by SLAM's convention; InBody's "Local ID" is the machine's own
identifier for a scan and is not a GymFlow identifier of any kind.

**What's built (this PR):** a standalone, human-supervised import pipeline —
not a running integration, and not wired into `InBodyProvider` or the
registry, which stay interface-only until InBody offers something GymFlow can
read live rather than a manual export.

- `backend/app/integrations/inbody/importer.py` — parses the Excel export,
  validates its header against the named fields above (raises a clear error
  naming exactly which column is missing, rather than guessing), maps only
  the semantically-known fields (`Weight → weight_kg`, `PBF → body_fat_pct`,
  `SMM → muscle_mass_kg`, `BMI → bmi`, `VFL → visceral_fat`,
  `BMR → bmr_kcal`, `TBW → body_water_pct`, `Local ID → external_ref`,
  `Test Date/Time → measured_at`), matches each row to a GymFlow member by
  phone number only (never by name), and classifies every row into MATCHED /
  AMBIGUOUS / UNMATCHED / DUPLICATE / INVALID before anything is written.
- `backend/app/scripts/import_inbody.py` — the script a human runs:
  `--dry-run` to see the classification and counts and write nothing, or
  `--import --yes` to write MATCHED, non-duplicate rows to
  `body_compositions`. AMBIGUOUS/UNMATCHED/INVALID/DUPLICATE rows are never
  silently written or silently discarded — they stay visible in the report
  for a human to resolve.
- The database itself now guarantees re-running the same file can't duplicate
  a scan: `body_compositions` carries a unique constraint on
  `(member_id, external_ref)`, plus a partial unique index on
  `(member_id, measured_at)` for the rare row with no Local ID at all.
- The other ~70 columns in the export (segmental body composition, impedance,
  and the rest) are read but not mapped — `body_compositions` was not turned
  into an 87-column table. Two fields worth a second look: **Protein** and
  **Minerals** are validated and parsed (required columns) but have nowhere
  to go — `body_compositions` has no column for either — so they are
  currently discarded after validation. If SLAM wants them retained, that's a
  schema decision for a human, not something this pipeline should invent.

**What's still manual, and still ACTION REQUIRED:**

1. The real 1,345-row export has not been run through this pipeline by
   anyone. This PR was built and tested only against small, synthetic .xlsx
   fixtures — the shape is right, the real data has not been seen.
2. A human must review a `--dry-run` report against the real export — in
   particular every AMBIGUOUS row (two-plus active members sharing a phone
   number, which `User.phone` allows and is a real, expected case, not an
   edge case) and every UNMATCHED row (a phone in the export that matches no
   active GymFlow member) — before anyone runs `--import`.
3. The Blood Pressure sheet (845 records) is not handled by this pipeline at
   all — it is a separate dataset with an unconfirmed shape, deliberately out
   of scope here.
4. Whether InBody/LookinBody120 ever offers something beyond a manual Excel
   export (an API, a watched folder, a scheduled feed) — that's what would
   let `InBodyProvider` graduate from interface-only to real, and this
   import script from manual to routine.

---

## Access control (fingerprint / RFID / face) — ACTION REQUIRED

V1 uses a rotating branch QR code and a PIN. Both are validated inside GymFlow.

**Hard rule, enforced by the interface: GymFlow never receives, stores or
transmits a biometric template.** A hardware provider matches on its own device
and returns only an identifier plus an allow/deny decision.

**Exact values/access needed:**

1. Vendor and model of the turnstile / reader controller at each branch
2. Whether it exposes a local API, a cloud API, or only a file/DB export
3. How it identifies a person to an external system (employee code? card ID?)
4. Whether it can push events, or must be polled
5. Network access from the GymFlow server to the controller

---

## WhatsApp — ACTION REQUIRED

Not required for V1. Notifications are written to the `notifications` table and
stay visible in-app.

**Future use:** owner alerts (trainer late, trainer absent), trainer shift
reminders, member membership and PT reminders.

**Exact values/access needed:**

1. A WhatsApp Business account with an approved sender
2. Phone number ID and business account ID
3. A permanent access token (never committed — environment only)
4. Approved message templates for each notification type
5. Confirmation of who may be messaged and how opt-out is handled

---

## Member intelligence

`RuleBasedIntelligenceProvider` ships enabled and makes **no prediction**. It
restates counts the dashboard already shows — "12 of 48 rostered shifts started
after the grace window this month" — so an owner can always ask where a number
came from and get an answer.

`churn_risk()` returns an empty map rather than zeros, because returning zeros
would be a claim that nobody is at risk.

Later phases (churn, renewal, occupancy recommendations, trainer utilisation)
plug in behind the same interface. **No V1 feature depends on this.**

---

## Push notifications

`backend/app/integrations/whatsapp/provider.py` carries `ExpoPushProvider`, and
`apps/mobile/src/notifications/` carries the client abstraction. Both are off
(`PUSH_ENABLED=false`), and a build with it off never prompts for permission.

**Needed to turn on:** an EAS project ID, and a decision on which alerts are
push-worthy versus in-app only.
