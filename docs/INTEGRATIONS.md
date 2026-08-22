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
| `IAccessControlProvider` | `SoftwareAccessControlProvider` (QR + PIN) | `X2008FingerprintProvider` — best-effort, **not yet verified against real device traffic** |
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

## Access control (fingerprint / RFID / face) — X2008 confirmed, protocol unverified

V1 uses a rotating branch QR code and a PIN. Both are validated inside GymFlow.
A third method, fingerprint, now has a real device and a best-effort provider
behind it — off by default, and honest about what has and has not been
confirmed.

**Hard rule, enforced by the interface: GymFlow never receives, stores or
transmits a biometric template.** A hardware provider matches on its own device
and returns only an identifier plus an allow/deny decision. Nothing below
changes that — the terminal resolves a scan to its own numeric "enroll ID" on
its own hardware, and that small identifier is the only thing GymFlow ever
sees.

### The confirmed device

One SLAM branch has a physically inspected ZKTeco **X2008** fingerprint
attendance terminal:

| Fact | Value |
| --- | --- |
| Serial | `CUB7250201499` |
| MAC | `00:17:61:10:15:f2` |
| Device ID (ADMS) | `1` |
| LAN IP / TCP port | `192.168.0.5` / `4370` |
| Fingerprint algorithm | Finger VX10.0 |
| Platform / MCU | ZMM200_TFT / 14 |
| Server mode | **ADMS** (push) |
| ADMS Server currently configured on the device | `http://biometric.yoactiv.com` |
| Communication Key | `0` (factory default / unset) |

These facts are real (confirmed from the unit), not inferred. This
environment has no network path to the device, so nothing below has been
tested against it — only against the documented shape of the protocol family.

### What "ADMS" means, and what is/isn't built

ADMS is ZKTeco's standard *push* protocol: the terminal periodically POSTs its
attendance log to a configured server URL, conventionally under
`/iclock/cdata`, as tab-delimited text. It is a widely published protocol
family, not proprietary — but this repository has **never seen real traffic
from serial CUB7250201499**, and firmware revisions are known to vary in
field-level detail (delimiter, optional columns, whether a handshake is
required before the terminal will start pushing).

Given that, this PR builds:

* The full configuration/adapter boundary (device registry, member↔enrolled-id
  mapping, `IAccessControlProvider` conformance) — this part is not
  protocol-dependent and is fully tested.
* A best-effort parser for the classic tab-delimited `ATTLOG` push body
  (`app/integrations/access_control/x2008.py::parse_adms_attlog`), clearly
  commented as unverified, tolerant of malformed lines, and reachable only
  when `ACCESS_CONTROL_ENABLED=true`.
* A receiver endpoint (`POST /api/v1/hardware/fingerprint/x2008/{secret}/iclock/cdata`)
  authenticated by a GymFlow-controlled shared secret embedded in the URL the
  device is configured to push to (see below) — **not** the device's own
  Communication Key, which stays in `FINGERPRINT_COMM_KEY` for whatever
  future protocol path actually needs it.

**Explicitly NOT built:** the ADMS handshake some firmware requires before it
will begin POSTing at all (`GET /iclock/cdata` option negotiation,
`/iclock/getrequest` command polling, `/iclock/devicecmd` acknowledgement).
The GET route that exists today answers "OK" and nothing more. If the X2008's
firmware needs more than that, attendance batches may simply never arrive
until this is built and verified against real device logs. **This must be
confirmed against actual traffic from the unit before flipping
`ACCESS_CONTROL_ENABLED` on in production.**

### Authenticating the device push

The device has no GymFlow account and cannot carry a bearer token. Two
secrets are involved and must not be confused:

* `FINGERPRINT_COMM_KEY` — the terminal's own Communication Key (currently
  `0`/unset on the real unit). This authenticates GymFlow *to the device* for
  older SDK/pull-style protocols. **Do not change the value configured on the
  physical device from this PR or any code it ships.**
* `FINGERPRINT_ADMS_SHARED_SECRET` — a secret GymFlow generates and controls,
  required in the push URL before a batch is accepted. This is what
  authenticates the push request *to GymFlow*.

The device's "ADMS Server" setting is a base URL; standard firmware appends a
fixed `/iclock/cdata` suffix and query parameters (at minimum `SN=<serial>`)
to whatever base is configured. The intended setup is to configure that base
URL as:

```
https://<api-host>/api/v1/hardware/fingerprint/x2008/<FINGERPRINT_ADMS_SHARED_SECRET>
```

so the secret travels as a URL path segment we control entirely, independent
of whatever query parameters the firmware happens to append. **This exact
appending behaviour is the same unverified-protocol-shape assumption as
everything else in this section** — confirm it against the real device before
relying on it. IP allowlisting was considered and rejected as the *primary*
mechanism: the device's LAN IP (`192.168.0.5`) is behind SLAM's router, and
the ADMS server it currently talks to is a public host
(`biometric.yoactiv.com`), so GymFlow would see the branch's NAT egress IP,
not the device's LAN address.

### What is now built

* `fingerprint_devices` / `fingerprint_enrollments` tables — see the
  docstrings on `FingerprintDevice`/`FingerprintEnrollment` in
  `backend/app/db/models.py` for why this is a bespoke table rather than
  `Member.external_ref` (reserved for Yoactiv) or a `Setting` JSON blob.
* `attendance_events.external_event_id` — nullable, unique when present, so a
  redelivered ADMS batch (normal behaviour for this protocol family) resolves
  to the same row instead of a duplicate visit.
* `X2008FingerprintProvider` (`backend/app/integrations/access_control/x2008.py`)
  — satisfies `IAccessControlProvider`; `open_gate()` returns `False` for real
  reasons, not as a stub: the X2008 is a standalone attendance recorder with
  no actuator, not a turnstile controller.
* `attendance_service.record_fingerprint_scan()` — the device-facing write
  path, sharing its actual row-construction code
  (`_write_member_event`) with the existing interactive `member_event()` so
  there remains exactly one place a member `AttendanceEvent` is written.
* Staff admin endpoints under `/api/v1/hardware/fingerprint/` to register a
  device and map a member to their enrolled ID — ordinary bearer-token API,
  unrelated to the device-push trust model above.

**Still required before enabling in production:**

1. Real ADMS traffic from serial CUB7250201499 to confirm the ATTLOG field
   order/delimiter and whether the option-negotiation handshake is required.
2. A decision on whether the device's own Communication Key needs to be set
   to something other than the factory default for whatever future
   pull-style path might use it — out of scope for this PR, and nothing here
   changes it.
3. `FINGERPRINT_ADMS_SHARED_SECRET` generated and set, and the device's ADMS
   Server URL updated to embed it, by whoever has hands-on access to the unit.

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
