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

**Member synchronization is pending because the real Yoactiv API/member
contract is not yet available.** What exists today is groundwork that does not
depend on that contract:

- `Member.external_ref` (nullable, `String(64)`) is GymFlow's side of the
  link to a member's Yoactiv identity. It now carries a **unique** index
  (migration `b4e6bbcca127`) — one Yoactiv identity can never be claimed by
  two GymFlow members, while any number of members can still be unlinked
  (`NULL`). Nothing writes to it yet; the constraint is there so nothing ever
  can write to it unsafely.
- `app/integrations/yoactiv/identity.py` is the one place that resolves an
  `ExternalMember` to a GymFlow `Member` (`find_member_by_external_ref`) and
  stamps the link (`link_member`). A real sync, once one can exist, calls
  through here rather than each caller writing its own query against
  `external_ref`.
- `Settings.yoactiv_base_url` / `Settings.yoactiv_api_key` are typed,
  environment-driven config slots, following the same pattern as every other
  setting in `core/config.py`. Both default to `""` and are read nowhere —
  they exist only so there is somewhere to put real values the day they
  arrive, without another config-shape change.

None of this invents an endpoint, a payload shape, an auth scheme, or a
sync — the eight items above are still exactly what is missing.

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
* A normalized `AccessEvent` (`app/integrations/base.py`) and two explicit
  pipeline stages in `x2008.py` — `to_access_event()` (the ADMS record,
  normalized) and `resolve_member()` (the Member Resolver: an enrolled-id
  this device has never had registered comes back `None`, never a guess) —
  sitting between the ADMS adapter and `attendance_service` so a future
  RFID/face terminal could produce the same shape without touching anything
  downstream.
* **Membership-gated, not PT-gated**: `record_fingerprint_scan()` now checks
  the member's *effective* membership status (reusing
  `app.domain.pt_eligibility`, the same computation PT eligibility uses) and
  denies the scan — writing no attendance row — when it is not ACTIVE. An
  active PT package with sessions remaining does not override a lapsed
  membership; this is deliberately the same rule PT eligibility already
  established, not a second copy of it.
* Structured logging with no biometric content, ever: `adms_push_received`,
  `adms_push_complete` / `adms_push_partial` (with a per-reason-code
  breakdown of denials) in `hardware.py`; `fingerprint_scan_recorded`,
  `fingerprint_scan_denied`, `fingerprint_scan_duplicate` /
  `_duplicate_race` in `attendance_service.py`. Every one logs only
  member/branch/device *identifiers* already stored in the database —
  never the request body, never anything resembling a template.

**Still required before enabling in production:**

1. Real ADMS traffic from serial CUB7250201499 to confirm the ATTLOG field
   order/delimiter and whether the option-negotiation handshake is required.
2. A decision on whether the device's own Communication Key needs to be set
   to something other than the factory default for whatever future
   pull-style path might use it — out of scope for this PR, and nothing here
   changes it.
3. `FINGERPRINT_ADMS_SHARED_SECRET` generated and set, and the device's ADMS
   Server URL updated to embed it, by whoever has hands-on access to the unit.
4. `attendance_events.occurred_at` for a fingerprint scan is always the
   *server's* receive time, never the device's own reported timestamp — the
   same "never trust a client/device clock" rule `app/core/clock.py`
   documents for every other attendance path. A batch the terminal held back
   during a network outage and resent later will file under whenever it
   actually arrived, not whenever the visit really happened. This is a
   deliberate consequence of that existing rule, not a defect introduced
   here, but it is worth knowing operationally before relying on fingerprint
   attendance timestamps for anything time-sensitive.

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
