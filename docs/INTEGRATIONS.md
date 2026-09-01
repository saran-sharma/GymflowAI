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

## Yoactiv — connector built, LIVE ACCESS BLOCKED

Yoactiv is SLAM's operational system of record (member identity, memberships,
invoices/payments, attendance/check-ins, fingerprint access, enquiries,
followups, PT commercial records). GymFlow stays the source of truth for
training data (programs, Program Days, sets/reps, PRs, trends, InBody,
analytics, auth). The shared-field rule: Yoactiv wins for operational fields,
GymFlow wins for training fields.

### The real contract (from SLAM's Postman collection)

`Yoactiv_Data_Api.postman_collection.json` is a real export. The Data API is
five GET-only ASMX operations under the `backdata.asmx` root, authenticated
by an `API_Key` request header, each taking a `fromdate`/`todate` window
(`dd-MM-yyyy`) and returning `{"Results": [...]}`:

| Operation | Unique id in the row | Drives |
| --- | --- | --- |
| `checkins` | none — a composed key | `attendance_events` (member visits) |
| `invoices` | `bill_id` | `memberships` + `members.is_active` (via `Billed_Services[].Start_date/End_date`) |
| `enquires` | `Enquiry_ID` | (P1) enquiry mirror |
| `followups` | `Call_ID` | (P1) followup mirror |
| `ptTrialConversion` | none | (P1) PT commercial mirror |

**Confirmed gaps, handled explicitly (never invented around):** no member or
staff master endpoint (an unresolved `Member_ID` becomes a dead letter, never
a fabricated member); no membership-status endpoint (derived from invoice
service dates); no webhooks; no `updatedSince` (hence overlapping windows +
weekly reconciliation); no pagination/result-cap documented (7-day default
window).

### Live access — BLOCKED (probe 2026-08-30)

The Data API host has **migrated to AWS** (`backstage.yoactiv.com`,
`13.206.230.46`; bare `yoactiv.co.in/` now 302s there). Every path under it —
including `backdata.asmx?WSDL` — returns **`401` with `WWW-Authenticate:
Basic Realm`**: the host is behind **IIS HTTP Basic auth in front of** the
app-level `API_Key` check. The 2022 collection carries no Basic credentials,
and both keys in it 401 at that layer regardless. Tried: header `API_Key`
(both keys), `API_Key` as a query param, browser UA + `Accept: application/json`,
the exact 2022 date range, `?WSDL`.

**To unblock (from SLAM's Yoactiv admin or Yoactiv support):**

1. HTTP **Basic username + password** for the Data API host
2. The authoritative current **base URL** (likely under `backstage.yoactiv.com`)
3. The current **`API_Key`** value(s) if rotated since 2022
4. Whether **source-IP allowlisting** also applies (SLAM office/gym egress IP)
5. A sandbox/test tenant, and the real rate limits / result cap

### What is built now (off by default — `YOACTIV_ENABLED=false`)

A server-side connector under `app/integrations/yoactiv/`. The mobile app
never touches it and never sees the key.

- `client.py` — `YoactivClient`: the five confirmed operations only (asking
  for any other raises), `API_Key` header + optional Basic auth, retry with
  exponential backoff + jitter on transport/5xx/429, **immediate halt on
  401/403**, a client-side rate bucket. Transport is injectable; the default
  is stdlib `urllib` (no new production dependency).
- `mapping.py` — typed row parsers built from the collection's saved response
  bodies. `dd-MM-yyyy` / `hh:mm AM/PM`. A row that will not parse is dead-
  lettered, not dropped.
- `identity.py` — `resolve_member()`: match precedence `external_ref` →
  exact email → **unique** active phone → `ambiguous` (shared phone, never
  auto-linked) → `none`. A name is never a match key.
- `lifecycle.py` — `apply_invoice()`: upserts `Membership` rows from billed
  services (a renewal is a **new** row; the old one stays), recomputes
  `Member.is_active` (INACTIVE once every membership has ended, ACTIVE again
  on the next renewal). Never deletes; never touches workouts / PRs / body
  compositions / attendance / PT.
- `sync.py` — `run_endpoint_sync()`: overlapping incremental window from a
  per-`(endpoint, branch)` `YoactivSyncCursor`, idempotent upserts
  (check-ins keyed on `attendance_events.external_event_id`), a
  `YoactivDeadLetter` table for unresolved rows, `consecutive_failures` →
  `stuck` after 3 (that endpoint freezes, the rest keep going), one
  `audit_logs` row per run (key redacted), `dry_run` (rolls back, reports
  what it would do), and `run_reconciliation()` (wide fixed window, cursor
  not moved).
- `app/api/v1/yoactiv.py` — `GET/POST /api/v1/admin/yoactiv/{status,sync,reconcile,dead-letters}`,
  OWNER / SUPER_ADMIN only. `sync` defaults to `dry_run=true`. Returns `409`
  while the connector is unconfigured.
- Migration `f1a2c3d4e5f6` — two additive tables (`yoactiv_sync_cursors`,
  `yoactiv_dead_letters`). No existing table changes shape.
- `assert_production_safe`: with `YOACTIV_ENABLED=true`, refuses to boot
  without `YOACTIV_API_KEY`, an `https://` `YOACTIV_BASE_URL`, and
  `YOACTIV_DEFAULT_BRANCH_ID`.

Attendance timestamp note: a mirrored Yoactiv check-in is filed at Yoactiv's
own `Attendance_Date` + `clockIn` — a deliberate, documented exception to the
"server clock only" rule for GymFlow-originated events, because Yoactiv is the
attendance authority here.

`tests/backend/test_yoactiv_connector.py` (23 tests) pins all of the above
against a fake transport returning the collection's real response shapes —
including idempotency, the dead-letter path, cursor advance, `stuck` after 3
failures, and the full membership lifecycle (create → expire → renew →
reactivate, history retained).

**Still required before this can run for real:** the five unblock items
above. Nothing else in the connector is waiting on code.

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

### `--create-missing-members` — DEFERRED (not in the RC), no membership

The default import path never creates an account. `--create-missing-members`
is an **opt-in, not-for-the-RC** helper (see `docs/NEXT_STEPS.md`): for every
**UNMATCHED** row (a real 10-digit mobile number that no active member has) it
creates a GymFlow member *record* only —

- a `User` whose **Login ID is that mobile number** (`users.login_phone`, the
  normalised 10 digits under a unique index — `find_user_by_identifier` resolves
  a phone login without a scan; `users.email` is a deterministic non-deliverable
  placeholder `<phone>@no-email.gymflow.app` only because the column is
  `NOT NULL UNIQUE`), `is_demo` false;
- a `Member` (`is_active` true, so the scan attaches on re-classify);
- **no `Membership`.** Yoactiv is the system of record for commercial
  membership; a phone number in an InBody export is not evidence of one.
  Membership-gated features stay closed for the account until Yoactiv sync or a
  human sets one.

Guards, all enforced:

- `--branch-id` is required (the export has no branch).
- `INBODY_BOOTSTRAP_PASSWORD` must be set in the environment — the temporary
  password the records start on. **No default.** `--import` refuses without it.
  Every created account has `users.must_change_password = true` (a soft flag —
  login still works — surfaced on `UserOut`; a hard gate needs the
  password-reset flow that does not exist yet).
- A mobile number under two different names (`shared_phone`), or one an
  existing GymFlow account already uses (`phone_in_use`), is never
  auto-created — it is listed for a human, like AMBIGUOUS/UNMATCHED. MATCHED /
  DUPLICATE / INVALID rows are untouched.

Migration `c8f2a1d0b7e3` adds `users.login_phone` and
`users.must_change_password` (both additive; every existing account gets
`NULL` / `false`). `tests/backend/test_inbody_bootstrap.py` pins the behaviour,
including that the default path creates nothing.

### Production deployment — hands-off, no terminal

`app/scripts/inbody_watch_agent.py` is the **validation** tool (`--dry-run`,
`--resend`, `--once` against ad-hoc arguments). Production does not ask gym
staff to run a terminal command per scan: `app/scripts/inbody_agent.py` is the
unattended runner, installed on the gym Windows PC by
`deploy/windows/inbody-agent/Install-InBodyAgent.ps1` as a Scheduled Task
(**At startup**, principal **SYSTEM** / `RunLevel Highest` /
`LogonType ServiceAccount` → runs with no window whether or not anyone is
logged in, `RestartCount 999` / `RestartInterval 1m` → auto-restart on crash).
A true Windows Service was rejected: running Python as one needs NSSM/pywin32
packaging on the gym PC, which the Task Scheduler settings above make
unnecessary.

Runtime behaviour (all pinned by `tests/backend/test_inbody_agent.py`):

- **Config is an INI file**, never the command line — `folder`, `api_url`
  (https), `branch_id`, and the secret via `secret_file` (ACL-locked) or the
  `INBODY_INGEST_SHARED_SECRET` env var. There is no default secret.
- **Baseline on first run** (explicit `baselined` flag in the state file, not
  "state is empty") → existing exports are recorded as seen, never uploaded.
- **Stability gate**: three consecutive equal, non-zero size reads before a
  file is touched — a half-written CSV is never sent.
- **Exactly once**: a per-file ledger (`state.json`, kept in the agent's work
  dir, *never* the watched folder) keyed on `name:size:mtime`. Changed bytes
  are reprocessed; unchanged are not.
- **Transient vs permanent**: network / timeout / 5xx / 429 → retried every
  cycle indefinitely, never quarantined. A `400` (unparseable file) → the file
  is left in place (the LookinBody EMR store is never modified), recorded
  `quarantined` so it is never retried, and a redacted note is written to
  `work_dir/quarantine/`. `401/403/404` → surfaced as `last_error`, not
  quarantined, retried once the config is fixed.
- **Outbound HTTPS only**, no listening port, dedicated machine credential in
  the URL path (never a user login).
- **Logs** rotate in `work_dir/logs/`; filenames appear only as `file-<hash>`
  (LookinBody names exports after the member's phone), and the secret is
  scrubbed from every record by a logging filter.
- **Heartbeat**: every `heartbeat_seconds` the agent POSTs counts + timestamps
  (no filename, no phone, no secret) to
  `POST /api/v1/inbody/agent/heartbeat/{secret}`. It lands in one `settings`
  row per branch (`inbody_agent_heartbeat`) — **no schema change**.
  `GET /api/v1/inbody/agent/status` (owner / branch manager; a manager sees
  only their branch) returns per branch: `connected` (heartbeat within
  `INBODY_AGENT_OFFLINE_AFTER_SECONDS`, default 900), `last_successful_scan_at`,
  `pending_files`, `quarantined_files`, `failed_files`, `processed_total`,
  `last_error`, `agent_version`.

The A–J on-site acceptance runbook is in
`deploy/windows/inbody-agent/README.md`. Still open: the same real TLS story
as every other off-LAN path, and running that runbook once against the gym's
own X2008/LookinBody hardware.

**What's still manual, and still ACTION REQUIRED:**

1. **Header shape now verified** (2026-08-30): the real bulk export
   (`InBodyExcelData_2026-08-20_13-21-10.xlsx`, 1,345 InBody rows / 87
   columns + an 845-row Blood Pressure sheet) was checked against
   `importer._resolve_headers` — all 15 required fields plus `Test Date /
   Time` resolve (the numbered `"14. Test Date / Time"` / spelled-out
   `"36. PBF (Percent Body Fat)"` style included).
   `tests/backend/test_inbody_import.py::test_parse_workbook_resolves_the_real_87_column_export_header`
   locks the exact 87 column names in. What is *not* yet done: an actual
   `--dry-run` of the 1,345 data rows against real GymFlow members (needs the
   member set loaded), and the per-scan **CSV** auto-export shape
   (`parse_csv_export`) is still `UNVERIFIED` — that is a different file from
   this bulk XLSX.
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

### Phase 1 preparation for the real-device test

Nothing below changes the endpoint's behaviour when
`FINGERPRINT_ADMS_DEBUG_CAPTURE` is left at its default (`false`) — it exists
solely to make the eventual real-device session legible, and is refused at
boot in production/staging by `assert_production_safe` so it can never be
left on by accident.

Set `FINGERPRINT_ADMS_DEBUG_CAPTURE=true` (alongside `ACCESS_CONTROL_ENABLED=true`
and `FINGERPRINT_ADMS_SHARED_SECRET`) only for the duration of the capture
session, and set the `gymflow.hardware.fingerprint.debug` logger to `DEBUG`.
Both the handshake `GET` and the batch `POST` then log one line per request,
after authentication succeeds, containing:

* HTTP method and request path — the secret path segment is replaced with
  `***` before logging, never the real value
* An allow-listed header subset (anything containing `authorization`,
  `cookie`, `secret`, `token` or `key`, case-insensitive, is dropped)
* `Content-Type` and the query parameters (`SN`, `table`, …)
* The resolved device identity (serial, device id, branch id)
* The raw `ATTLOG` body and the parsed fields (`enrolled_id`, both the raw
  and parsed device timestamp, and whatever landed in the optional
  status/verify-type columns) for a `POST`

This is what lets whoever runs the real test at the gym capture exactly what
`parse_adms_attlog` needs corrected — without turning on anything that
touches production attendance data, and without ever logging the shared
secret or a fingerprint template.

**Exact gym-side steps for that session** (nothing here can be done from this
environment — no network path to the device exists here):

1. Stand up a GymFlow backend instance reachable from the X2008's network —
   either the same LAN (temporarily run the backend on a laptop on the gym
   Wi-Fi) or a tunnel (e.g. `ngrok`) exposing it over HTTPS, since the whole
   point is confirming behaviour under the same transport the device will use
   in production.
2. Set `ACCESS_CONTROL_ENABLED=true`, `FINGERPRINT_ADMS_SHARED_SECRET=<a
   generated value>`, and `FINGERPRINT_ADMS_DEBUG_CAPTURE=true` on that
   instance only — never in the shared production environment.
3. Register the device (`POST /api/v1/hardware/fingerprint/devices`) with
   serial `CUB7250201499` and the branch it belongs to, using a real admin
   account.
4. Create one enrollment (`POST /api/v1/hardware/fingerprint/enrollments`)
   mapping a designated test member to whatever enrolled-id the terminal
   already has for a real registered finger — do not enroll a random/fake id,
   since the goal is to see what the device actually sends for a real scan.
5. On the physical unit's own menu (Comm → Cloud Server Setting / ADMS),
   point its ADMS Server URL at:
   `https://<reachable-host>/api/v1/hardware/fingerprint/x2008/<FINGERPRINT_ADMS_SHARED_SECRET>`
   — see "Authenticating the device push" above for why the secret belongs in
   the path, not a query parameter.
6. Have the test member scan their enrolled finger once, then watch the
   `gymflow.hardware.fingerprint.debug` and `gymflow.hardware.fingerprint`
   logs for the resulting `adms_debug_capture` / `adms_push_received` /
   `adms_push_complete` lines. If nothing arrives within the device's normal
   push interval, that itself is the answer to the biggest open question in
   this document: the option-negotiation handshake this PR does not
   implement is very likely required for this firmware.
7. Immediately after the session: set `FINGERPRINT_ADMS_DEBUG_CAPTURE=false`
   again, and treat the captured `adms_debug_capture` lines as the source of
   truth for correcting `parse_adms_attlog`'s field-order assumptions — do
   not guess further from protocol documentation once real traffic exists.

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
   order/delimiter and whether the option-negotiation handshake is required —
   see "Phase 1 preparation for the real-device test" above for the exact
   steps and the opt-in `FINGERPRINT_ADMS_DEBUG_CAPTURE` capture aid built for
   that session.
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
