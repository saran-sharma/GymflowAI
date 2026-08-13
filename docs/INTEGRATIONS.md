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

## InBody — ACTION REQUIRED

**What:** body-composition data from the InBody machines.
**Why:** to show scan history against attendance in a later phase.
**Exact values/access needed:**

1. The exact InBody model in each of the three branches
2. Which InBody software the machines report into (Lookin' Body, InBody Web, or a local install)
3. Whether that installation exposes an API, or only a scheduled export (CSV/Excel)
4. If an API: base URL, auth and endpoint list
5. If an export: file format, delivery mechanism and cadence

No V1 feature reads body composition. The interface exists so adding it later
does not disturb anything.

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
