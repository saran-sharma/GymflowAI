# GymFlow InBody Agent — real gym-PC validation runbook

Code is **frozen** for this pass. This is the exact sequence to install and
validate the production agent on the gym Windows PC. Background and the design
rationale are in `README.md`; this file is the checklist you execute on site.

Everything is driven through the **installed agent**, which holds the shared
secret in an ACL-locked file. You type the secret **once**, into a masked
prompt. No step puts it on a command line, in a log, or in shell history.

---

## 0. Preconditions (confirm before you start)

- **Server side** (GymFlow ops, not on the gym PC):
  - `INBODY_INGEST_ENABLED=true`
  - `INBODY_INGEST_SHARED_SECRET=<a dedicated value>` — generated for this
    integration only, **not** any user/Owner password, not reused elsewhere.
  - The GymFlow API is reachable from the gym PC over **HTTPS**.
  - You know the **branch id** for this gym.
- **Gym PC:**
  - Windows 10/11 or Server 2016+.
  - Python 3.9+ installed (python.org). Check: `py -3 --version`.
  - Elevated PowerShell ("Run as administrator").
  - If the server uses a private/LAN certificate: the server's PEM copied to
    the PC (you will pass its path as `-CaCert`).
- **Have ready:** the shared secret (to paste once), the API URL, the branch id.

Turn off history capture for this session so nothing you paste is stored:

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing
```

---

## 1. Exact files to copy to the gym PC

Copy this whole folder to the gym PC, e.g. `C:\Temp\inbody-agent\`:

```
deploy/windows/inbody-agent/
  Install-InBodyAgent.ps1
  Uninstall-InBodyAgent.ps1
  config.example.ini
  README.md
  VALIDATION.md            (this file)
backend/app/scripts/inbody_agent.py
```

Put `inbody_agent.py` **next to** `Install-InBodyAgent.ps1` (the installer
looks there first), or pass its path via `-AgentScript`.

Nothing else from the repo is needed — the agent is standalone (Python stdlib
+ `requests`, installed into a private venv by the installer).

---

## 2. Exact PowerShell — install

From the elevated PowerShell, in `C:\Temp\inbody-agent\`:

```powershell
.\Install-InBodyAgent.ps1 `
    -Folder   'C:\LookinBody120\EMR\CSV' `      # verify in step 4 first
    -ApiUrl   'https://gymflow.example.com' `
    -BranchId 1 `
    -CaCert   'C:\Temp\inbody-agent\gymflow.crt'   # omit if the server uses a public cert
```

You will be prompted: **`Paste the INBODY_INGEST_SHARED_SECRET`** — the input
is masked (`SecureString`). This is the only time the secret is handled.

Optional parameters: `-InstallDir` (default `C:\GymFlow\InBodyAgent`),
`-PythonExe` (auto-detected otherwise), `-Secret` (skips the prompt — avoid;
use the prompt), `-AgentScript`.

The installer, in order:

1. creates `C:\GymFlow\InBodyAgent\venv` and installs `requests`;
2. copies `inbody_agent.py` into the install dir;
3. writes `config.ini`, and `secret` (ACL reset to **SYSTEM + Administrators,
   read-only** via `icacls`);
4. registers the scheduled task **`GymFlow InBody Agent`** —
   `AtStartup` trigger; principal `SYSTEM` / `ServiceAccount` / `RunLevel
   Highest` (no window, runs logged in or not); `RestartCount 999`,
   `RestartInterval 1 minute`, `ExecutionTimeLimit 0`, `MultipleInstances
   IgnoreNew`; action `pythonw.exe inbody_agent.py --config config.ini`;
5. runs `--check` and prints `OK` / `FAILED`;
6. `Start-ScheduledTask`.

---

## 3. Exact INI configuration fields

`C:\GymFlow\InBodyAgent\config.ini`, section `[inbody-agent]` (the installer
writes it; edit here only if something changes, then
`Restart-ScheduledTask -TaskName 'GymFlow InBody Agent'`):

| Key | Required | Meaning |
| --- | --- | --- |
| `folder` | yes | LookinBody120 CSV auto-export folder (step 4) |
| `api_url` | yes | GymFlow API base URL — must be `https://` (only `http://localhost` / `127.0.0.1` allowed, for a dev box) |
| `branch_id` | yes | positive integer — this gym's GymFlow branch id |
| `secret_file` | yes\* | path to the ACL-locked file holding the secret. \*Or `secret =` inline, or the `INBODY_INGEST_SHARED_SECRET` env var. **No default.** |
| `work_dir` | no | where `state.json`, `status.json`, `logs\`, `quarantine\` live. Default: the config file's folder. **Never the watched folder.** |
| `cacert` | no | PEM to verify a private/LAN server certificate |
| `insecure` | no | `true` disables TLS verification — short trusted-LAN test only, never leave on |
| `poll_seconds` | no | folder scan interval (default 30) |
| `heartbeat_seconds` | no | status POST interval (default 120) |

---

## 4. Discover / verify the LookinBody120 export folder

The auto-export path is set inside LookinBody120: **Setup Menu → "Export Data
as CSV/Image Files"** — read the configured output directory there. The
common default is `C:\LookinBody120\EMR\CSV`.

Verify from PowerShell (it exists and has recent `.csv` files):

```powershell
$Folder = 'C:\LookinBody120\EMR\CSV'
Test-Path -PathType Container $Folder
Get-ChildItem $Folder -Filter *.csv | Sort-Object LastWriteTime -Descending |
    Select-Object -First 5 Name, Length, LastWriteTime
(Get-ChildItem $Folder -File | Measure-Object).Count   # note this number for step 6
```

If LookinBody writes CSVs somewhere else, use that path for `-Folder`.

---

## 5. Run installer `--check` (standalone)

`--check` validates the config, prints the resolved config with the secret
**redacted** (`"secret": "***set***"`), sends **one** heartbeat, and exits
`0` (delivered) or `1` (failed):

```powershell
& 'C:\GymFlow\InBodyAgent\venv\Scripts\python.exe' `
  'C:\GymFlow\InBodyAgent\inbody_agent.py' --config 'C:\GymFlow\InBodyAgent\config.ini' --check
echo "exit=$LASTEXITCODE"    # 0 = OK
```

Also useful — print the resolved config only, no network:

```powershell
& 'C:\GymFlow\InBodyAgent\venv\Scripts\python.exe' `
  'C:\GymFlow\InBodyAgent\inbody_agent.py' --config 'C:\GymFlow\InBodyAgent\config.ini' --print-config
```

Expected on success: log line `config OK: {... "secret": "***set***" ...}`
then `heartbeat delivered`.

If it fails, the message names the exact problem: `config file has no
[inbody-agent] section`, `'api_url' must be an https:// URL`, `no shared
secret: ...`, `'folder' is not a directory: ...`, or (heartbeat) an HTTP
status / connection error with the secret already scrubbed to `***`.

---

## 6. Start / verify the Task Scheduler job

```powershell
$T = 'GymFlow InBody Agent'
Start-ScheduledTask   -TaskName $T
Get-ScheduledTask     -TaskName $T | Get-ScheduledTaskInfo   # LastRunResult should be 0 (or 267009 = currently running)
Get-ScheduledTask     -TaskName $T | Select-Object State     # Running
(Get-ScheduledTask -TaskName $T).Principal                   # UserId SYSTEM, RunLevel Highest, LogonType ServiceAccount
(Get-ScheduledTask -TaskName $T).Triggers                    # MSFT_TaskBootTrigger  (AtStartup)
(Get-ScheduledTask -TaskName $T).Settings |
    Select-Object RestartCount, RestartInterval, ExecutionTimeLimit, MultipleInstances
```

Then confirm the agent actually started and **baselined every pre-existing
file** (so no historical CSV is uploaded):

```powershell
Get-Content 'C:\GymFlow\InBodyAgent\logs\inbody-agent.log' -Tail 20
```

Expected, once:

```
<ts> INFO baseline: <N> existing file(s) recorded as seen, none uploaded. Only files created after now are processed.
<ts> INFO watching C:\LookinBody120\EMR\CSV branch_id=1 poll=30s heartbeat=120s work_dir=C:\GymFlow\InBodyAgent version=1.0.0
```

**`<N>` must equal the file count from step 4.** If it does, every existing
export — including any historical per-scan CSVs already in that folder — is
marked `baseline` in `state.json` and will never be uploaded. The bulk
1,345-row XLSX is a different file elsewhere and is not in scope for this
agent at all.

---

## 7. Verify heartbeat / status in GymFlow

From any GymFlow client, as an **owner or branch manager** (normal bearer
token — this is a management endpoint, unrelated to the machine secret):

```
GET /api/v1/inbody/agent/status
```

Expected for this branch:

```json
{
  "ingest_enabled": true,
  "offline_after_seconds": 900,
  "agents": [
    {
      "branch_id": 1,
      "branch_code": "SLAM-...",
      "connected": true,
      "last_heartbeat_at": "<recent ISO-8601>",
      "last_successful_scan_at": null,
      "pending_files": 0,
      "quarantined_files": 0,
      "failed_files": 0,
      "processed_total": 0,
      "last_error": null,
      "agent_version": "1.0.0"
    }
  ]
}
```

`connected: true` means a heartbeat arrived within the last 900 s. Locally,
`C:\GymFlow\InBodyAgent\status.json` holds the same snapshot (mode `600`) and
carries **no filename, phone, or secret** — only counts and timestamps.

---

## 8. Exact one-scan test procedure

1. Note the current state:
   ```powershell
   Get-ChildItem 'C:\LookinBody120\EMR\CSV' -Filter *.csv |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1 Name, LastWriteTime
   ```
2. **Perform ONE fresh InBody measurement for the demo member** on the
   machine. LookinBody writes one new `.csv` into the export folder.
3. (Optional, no writes) inspect the new file's headers/values locally —
   no network, no secret:
   ```powershell
   $NEW = (Get-ChildItem 'C:\LookinBody120\EMR\CSV' -Filter *.csv |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
   & 'C:\GymFlow\InBodyAgent\venv\Scripts\python.exe' -c "import csv,sys;r=list(csv.reader(open(sys.argv[1],encoding='utf-8-sig')));print('HEADERS');[print(f'{i:2} {h!r}') for i,h in enumerate(r[0])];print('ROW1');[print(f'{r[0][i]!r:34}= {v!r}') for i,v in enumerate(r[1])]" $NEW
   ```
   Check the header carries: `Name`, `ID`, `Mobile Number`, `Test Date /
   Time` (or `Test Date` + `Test Time`), `Weight`, `PBF`, `SMM`, `BMI`,
   `BMR`, `TBW`, `VFL`, `Local ID`, `Protein`, `Minerals`, `Date of Birth`.
4. Wait up to `poll_seconds` (default 30). Do **not** run any command — the
   installed agent detects it, waits for the file to stop growing, and
   uploads it over HTTPS.
5. Read the log (step 9) and open the demo member's **Progress** in GymFlow.

The demo member's GymFlow phone must equal the InBody `Mobile Number` (or
`ID`) on the scan — matching is by phone only, never by name.

---

## 9. Expected logs / status after a successful upload

`C:\GymFlow\InBodyAgent\logs\inbody-agent.log`:

```
<ts> INFO uploaded file-xxxxxxxx written=1 {"ambiguous": 0, "duplicate": 0, "invalid": 0, "matched": 1, "unmatched": 0}
```

- `file-xxxxxxxx` is a hash — the real filename (a phone number) is never
  logged.
- `written=1`, `matched: 1` → the row resolved to the demo member and a
  `BodyComposition` was created.
- `written=0` with `unmatched: 1` → the CSV parsed but the phone matched no
  active member (fix the member's phone, not the agent).
- `written=0` with `invalid: 1` → a row failed validation; see step 11.

`state.json` gains an entry `"<newfile>.csv": {"result": "uploaded", ...}` and
`meta.processed_total` / `meta.last_success_at` advance.

`GET /api/v1/inbody/agent/status` (after the next heartbeat, ≤120 s):
`processed_total` +1, `last_successful_scan_at` set, `pending_files` 0,
`last_error` null.

**GymFlow → demo member → body composition / Progress:** a new point at the
scan time (shown in branch-local time; stored UTC), with
Weight / PBF / SMM / BMI / VFL / BMR / TBW. `Protein` and `Minerals` are
parsed and validated but not stored (no column). `Local ID` is saved as
`external_ref` (the dedup key).

---

## 10. Duplicate test

**Two independent guards — verify both.**

**a. Agent-level (same file):** copy the same CSV back with the **same
name**:
```powershell
Copy-Item $NEW "$env:TEMP\dup.csv"; Copy-Item "$env:TEMP\dup.csv" $NEW -Force
```
The agent's state entry for that name already says `uploaded` and the
`name:size:mtime` key is unchanged → the agent **does nothing**: no request,
no new log line. (If the copy changed the mtime, it re-sends and the server
dedupes as in (b).)

**b. Server-level (same scan, new name):** copy the CSV under a **new**
name into the folder:
```powershell
Copy-Item $NEW (Join-Path 'C:\LookinBody120\EMR\CSV' ('dupe-' + (Split-Path $NEW -Leaf)))
```
Within `poll_seconds` the agent uploads it; the server matches the `Local ID`
already stored and returns `200` with `written=0`:

```
<ts> INFO uploaded file-yyyyyyyy written=0 {"duplicate": 1, "matched": 0, ...}
```

**No second `BodyComposition` row** is created (also enforced by the DB
unique constraint on `(member_id, external_ref)`). Delete your `dupe-*.csv`
test copy afterwards if you like — but **never delete a real LookinBody
export.**

---

## 11. Invalid CSV test

Drop a deliberately malformed file into the watched folder:

```powershell
Set-Content -Path (Join-Path 'C:\LookinBody120\EMR\CSV' 'zz-invalid-test.csv') `
    -Value "col_a,col_b,col_c`r`n1,2,3" -Encoding ascii
```

Within `poll_seconds` the agent uploads it; the server rejects it `400`
(missing required columns). Expected log:

```
<ts> ERROR quarantined file-zzzzzzzz (HTTP 400: InBody export is missing expected column(s): ...)
```

- A redacted note appears: `C:\GymFlow\InBodyAgent\quarantine\file-zzzzzzzz.json`
  (`reason`, `size`, `detected_at`, `file_hint` — **no real filename**).
- `state.json` marks it `quarantined` → it is **never retried**.
- The file is **left in the watched folder** — the agent does not move,
  rename, or delete anything there.
- Next heartbeat: `quarantined_files` = 1, `last_error` set,
  `GET /agent/status` shows the same.

Delete your `zz-invalid-test.csv` afterwards (it is your test file, not a
LookinBody export).

Transient-failure behaviour (optional): briefly block outbound HTTPS, drop a
CSV, restore connectivity → log shows `transient failure file-... (retry next
cycle)`, `failed_files` rises, then `uploaded ...` and it clears. Nothing is
quarantined for a network error.

---

## 12. Safe rollback / uninstall

Stop only:
```powershell
Stop-ScheduledTask -TaskName 'GymFlow InBody Agent'
```

Full uninstall (removes the scheduled task; **keeps** files unless
`-RemoveFiles`):
```powershell
.\Uninstall-InBodyAgent.ps1
# or, to also delete C:\GymFlow\InBodyAgent (venv, config, secret, state, logs):
.\Uninstall-InBodyAgent.ps1 -RemoveFiles
```

Rollback is clean: the agent only ever **reads** the LookinBody folder and
makes **outbound** calls. Removing the task stops all activity immediately;
no LookinBody data, no GymFlow data, and no server config is touched.
Already-ingested `BodyComposition` rows remain (they are real measurements) —
remove them in GymFlow if a run needs to be undone.

---

## Safety checklist (mapped to the steps)

| Rule | How it holds |
| --- | --- |
| Secret never in commands / logs / screenshots / docs | Typed once into a masked `Read-Host -AsSecureString` (step 2); stored ACL-locked (SYSTEM + Administrators); `--check`/`--print-config` redact it (step 5); network-error strings are scrubbed to `***`; `PSReadLine` history disabled (step 0). Placeholders only in this file. |
| Dedicated `INBODY_INGEST_SHARED_SECRET` | Precondition 0 — a value generated for this integration only, not a user/Owner password, not reused. |
| Outbound HTTPS only | Agent only calls `requests.post`; `config.ini` rejects non-`https://` (localhost excepted for dev). No port is opened; nothing on the gym PC listens. |
| No human Owner account | Auth is the machine secret in the URL path. `GET /agent/status` uses a normal management token and is read-only — separate from ingestion. |
| Do not delete LookinBody source CSVs | The agent never moves/renames/deletes in the watched folder. Quarantine writes a note to `work_dir`, leaving the file in place (step 11). Only *your* `dupe-*` / `zz-invalid-test.csv` test files are yours to remove. |
| Do not process the historical 1,345-row export | The agent watches only the CSV auto-export folder; first run **baselines** every pre-existing file as seen (step 6 — `<N>` must match the folder count). The bulk XLSX is never touched. `--process-existing` / the manual importer are not used here. |

Stop here and hand back for **real gym-PC validation**. No commit/push.
