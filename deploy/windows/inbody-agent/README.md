# GymFlow InBody Agent — Windows deployment

Runs on the **gym PC** (the Windows machine LookinBody120 exports to). After
installation it is fully hands-off: no console window, no login required, and
it restarts itself on crash or reboot. Nobody runs a terminal command for a
normal scan.

```
LookinBody120  ->  CSV auto-export folder  ->  [InBody Agent, background]
   -> file-stability check  -> authenticated outbound HTTPS  -> GymFlow
   -> parse / member-match on the server  -> BodyComposition  -> Progress
```

The agent only makes **outbound HTTPS** requests. It opens **no port** and
exposes nothing on the gym PC. It authenticates with a **dedicated machine
credential** (`INBODY_INGEST_SHARED_SECRET`) — never an Owner or any user
login.

---

## Prerequisites

- Windows 10/11 or Server 2016+.
- Python 3.9+ for all users (from python.org; "Add to PATH" is fine but not
  required — pass `-PythonExe` if it is installed somewhere unusual).
- The GymFlow API reachable over HTTPS from the gym PC. On a LAN with a
  private certificate, copy the server's PEM to the gym PC and pass `-CaCert`.
- From GymFlow ops: the `INBODY_INGEST_SHARED_SECRET` value and the **branch
  id** for this gym. `INBODY_INGEST_ENABLED=true` must be set on the server.

## Install

From an **elevated PowerShell**, in this folder:

```powershell
.\Install-InBodyAgent.ps1 `
    -Folder   'C:\LookinBody120\EMR\CSV' `
    -ApiUrl   'https://gymflow.example.com' `
    -BranchId 1
# (you'll be prompted to paste the shared secret)
```

Optional: `-CaCert 'C:\GymFlow\InBodyAgent\gymflow.crt'`,
`-InstallDir 'D:\GymFlow\InBodyAgent'`, `-Secret '<value>'` (skips the prompt),
`-PythonExe 'C:\Python312\python.exe'`.

The installer:

1. creates a private venv in `InstallDir\venv` and installs `requests`;
2. writes `InstallDir\config.ini` and `InstallDir\secret` (ACL: SYSTEM +
   Administrators only);
3. registers the Scheduled Task **`GymFlow InBody Agent`**:
   - **Trigger:** At startup — survives reboots.
   - **Principal:** `SYSTEM`, `RunLevel Highest`, `LogonType ServiceAccount` —
     runs whether or not a user is logged in, with no window.
   - **Settings:** `RestartCount 999`, `RestartInterval 1 minute`,
     `ExecutionTimeLimit 0` (never), `MultipleInstances IgnoreNew` — auto
     restart on crash, one instance only.
   - **Action:** `pythonw.exe inbody_agent.py --config config.ini`
     (`pythonw` = no console window).
4. runs `--check` (validates config + sends one heartbeat) and reports the
   result;
5. starts the task.

## What runs where

| Path | What |
| --- | --- |
| `InstallDir\config.ini` | folder / api_url / branch_id / secret_file / cacert |
| `InstallDir\secret` | the shared secret, ACL-locked |
| `InstallDir\state.json` | processed-file ledger (idempotency) — **not** in the export folder |
| `InstallDir\status.json` | latest local status snapshot |
| `InstallDir\logs\inbody-agent.log` | rotating operational log (2 MB × 5) |
| `InstallDir\quarantine\*.json` | one redacted note per permanently-rejected file |

The **LookinBody export folder is never modified** — no move, rename, or
delete. Rejected files stay put; the agent just records them as quarantined
so they are not retried forever.

## Health / status in GymFlow

Every `heartbeat_seconds` the agent POSTs counts + timestamps (no filename, no
phone number, no secret) to `POST /api/v1/inbody/agent/heartbeat/{secret}`.
An owner or branch manager reads it back:

```
GET /api/v1/inbody/agent/status        ->  { agents: [ {
      branch_id, branch_code, connected,
      last_heartbeat_at, last_successful_scan_at,
      pending_files, quarantined_files, failed_files, processed_total,
      last_error, agent_version } ] }
```

`connected` is false once no heartbeat has arrived for
`INBODY_AGENT_OFFLINE_AFTER_SECONDS` (default 900). A branch manager sees only
their branch; an owner sees all and can filter with `?branch_id=`.

## Managing the task

```powershell
Get-ScheduledTask     -TaskName 'GymFlow InBody Agent' | Get-ScheduledTaskInfo
Stop-ScheduledTask    -TaskName 'GymFlow InBody Agent'
Start-ScheduledTask   -TaskName 'GymFlow InBody Agent'
Restart-ScheduledTask -TaskName 'GymFlow InBody Agent'   # after editing config.ini
```

Uninstall: `.\Uninstall-InBodyAgent.ps1` (add `-RemoveFiles` to delete the
install dir).

## Manual acceptance test (run once at the gym)

Everything below is one-time verification by the installer. Normal operation
needs none of it.

| # | Step | Expected |
| --- | --- | --- |
| **A** | Reboot the gym PC (or `Start-ScheduledTask`). | `logs\inbody-agent.log` shows `watching ... branch_id=...` and a `baseline: N existing file(s)` line. `GET /agent/status` shows `connected: true`. |
| **B** | Do a real InBody scan so LookinBody writes a fresh CSV. | A new `.csv` appears in the export folder. |
| **C** | Wait up to `poll_seconds`. | Log: `uploaded file-xxxxxxxx written=1 {...}`. No filename in the log. |
| **D** | — | The POST in the log returned 200; `written` ≥ 1 for a matched member (0 = matched nothing / duplicate — see the counts). |
| **E** | In GymFlow, open that member. | A new **BodyComposition** row (weight / PBF / SMM / BMI / VFL / BMR / TBW) at the scan time in branch-local time. |
| **F** | Open the member's **Progress**. | The new measurement is the latest point. |
| **G** | Copy the same CSV back into the folder under a new name. | Server replies 200 `written=0` (duplicate by Local ID); no second BodyComposition row. Re-adding the *same* file name/bytes: not re-sent at all (state). |
| **H** | Briefly block outbound HTTPS (disable NIC or firewall the API), drop a new CSV, then restore connectivity. | Log shows `transient failure file-... (retry next cycle)`, `failed_files` rises in `status.json`; after connectivity returns, `uploaded ...` and `failed_files` returns to 0. Nothing quarantined. |
| **I** | Drop a deliberately malformed file (e.g. `bad.csv` with `x,y,z` header). | Server 400. Log: `quarantined file-... (HTTP 400: ...)`. A note appears in `quarantine\`. The file is **left in the export folder**. It is never retried. `quarantined_files` = 1 in status. |
| **J** | Restart the agent (or reboot). | It resumes automatically. Already-processed files are **not** re-uploaded (state survives). New files since the stop are picked up. |

If C/E/F fail with `written=0` and `unmatched` in the counts: the member's
phone in GymFlow does not match the InBody `ID` / `Mobile Number` on the
scan — fix the member's phone number, not the agent.
