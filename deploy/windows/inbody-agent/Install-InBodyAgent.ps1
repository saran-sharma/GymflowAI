<#
.SYNOPSIS
    Install the GymFlow InBody Agent on a gym Windows PC as an unattended,
    auto-starting background task. No console window; no manual step after this.

.DESCRIPTION
    Sets up a private Python venv, drops the agent script and an INI config,
    stores the shared secret in an ACL-locked file, and registers a Scheduled
    Task that:
      * starts at Windows startup (survives restarts),
      * runs as SYSTEM whether or not a user is logged in (no window),
      * restarts automatically if the process ever exits unexpectedly.

    A Windows Service was considered; running Python as a true service needs
    NSSM or pywin32 packaging on the gym PC, which requirement 19 says to
    avoid. Task Scheduler with these settings meets the same goals with
    nothing extra to install.

.PARAMETER Folder
    The LookinBody120 CSV auto-export folder, e.g. C:\LookinBody120\EMR\CSV

.PARAMETER ApiUrl
    GymFlow API base URL, e.g. https://gymflow.example.com  (https required)

.PARAMETER BranchId
    The GymFlow branch id this gym maps to.

.PARAMETER Secret
    INBODY_INGEST_SHARED_SECRET. Omit to be prompted (kept off the command line
    and the process list).

.PARAMETER CaCert
    Optional PEM file to verify a private / LAN server certificate.

.PARAMETER InstallDir
    Where the agent, venv, config, logs, state and quarantine notes live.
    Default: C:\GymFlow\InBodyAgent

.PARAMETER PythonExe
    Optional path to python.exe. Auto-detected from 'py -3' / PATH otherwise.

.PARAMETER AgentScript
    Optional path to inbody_agent.py. Defaults to the copy shipped next to
    this installer, then to the repo location.

.EXAMPLE
    .\Install-InBodyAgent.ps1 -Folder 'C:\LookinBody120\EMR\CSV' `
        -ApiUrl 'https://gymflow.example.com' -BranchId 1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Folder,
    [Parameter(Mandatory = $true)] [string] $ApiUrl,
    [Parameter(Mandatory = $true)] [int]    $BranchId,
    [string] $Secret,
    [string] $CaCert,
    [string] $InstallDir = 'C:\GymFlow\InBodyAgent',
    [string] $PythonExe,
    [string] $AgentScript
)

$ErrorActionPreference = 'Stop'
$TaskName = 'GymFlow InBody Agent'

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this installer from an elevated (Administrator) PowerShell.'
    }
}

function Resolve-Python {
    if ($PythonExe) {
        if (-not (Test-Path $PythonExe)) { throw "PythonExe not found: $PythonExe" }
        return $PythonExe
    }
    $cand = & { (& py -3 -c "import sys; print(sys.executable)") 2>$null }
    if ($LASTEXITCODE -eq 0 -and $cand) { return $cand.Trim() }
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw 'Python 3 not found. Install it (python.org) or pass -PythonExe.'
}

function Resolve-AgentScript {
    if ($AgentScript) {
        if (-not (Test-Path $AgentScript)) { throw "AgentScript not found: $AgentScript" }
        return (Resolve-Path $AgentScript).Path
    }
    $local = Join-Path $PSScriptRoot 'inbody_agent.py'
    if (Test-Path $local) { return $local }
    $repo = Join-Path $PSScriptRoot '..\..\..\backend\app\scripts\inbody_agent.py'
    if (Test-Path $repo) { return (Resolve-Path $repo).Path }
    throw 'inbody_agent.py not found next to the installer or in the repo. Pass -AgentScript.'
}

function Lock-FileAcl([string] $Path) {
    # Only SYSTEM (the task's identity) and Administrators may read the secret.
    icacls $Path /inheritance:r | Out-Null
    icacls $Path /grant:r 'SYSTEM:(R)' 'Administrators:(R)' | Out-Null
}

# --------------------------------------------------------------------------

Assert-Admin

if ($ApiUrl -notmatch '^https://' -and $ApiUrl -notmatch '^http://(localhost|127\.0\.0\.1)') {
    throw "ApiUrl must be https:// (got '$ApiUrl')."
}
if (-not (Test-Path -PathType Container $Folder)) {
    throw "Export folder does not exist: $Folder"
}

$python = Resolve-Python
$agentSrc = Resolve-AgentScript
Write-Host "Python : $python"
Write-Host "Agent  : $agentSrc"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host 'Creating a private virtual environment...'
& $python -m venv (Join-Path $InstallDir 'venv')
$venvPy  = Join-Path $InstallDir 'venv\Scripts\python.exe'
$venvPyw = Join-Path $InstallDir 'venv\Scripts\pythonw.exe'
& $venvPy -m pip install --upgrade --quiet pip
& $venvPy -m pip install --quiet requests

Copy-Item -Force $agentSrc (Join-Path $InstallDir 'inbody_agent.py')

if (-not $Secret) {
    $sec = Read-Host -AsSecureString 'Paste the INBODY_INGEST_SHARED_SECRET'
    $Secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
$secretPath = Join-Path $InstallDir 'secret'
Set-Content -Path $secretPath -Value $Secret -NoNewline -Encoding ascii
Lock-FileAcl $secretPath

$configPath = Join-Path $InstallDir 'config.ini'
$lines = @(
    '[inbody-agent]'
    "folder = $Folder"
    "api_url = $($ApiUrl.TrimEnd('/'))"
    "branch_id = $BranchId"
    "secret_file = $secretPath"
    "work_dir = $InstallDir"
    'poll_seconds = 30'
    'heartbeat_seconds = 120'
)
if ($CaCert) {
    if (-not (Test-Path $CaCert)) { throw "CaCert not found: $CaCert" }
    $lines += "cacert = $CaCert"
}
Set-Content -Path $configPath -Value $lines -Encoding ascii
Write-Host "Wrote $configPath"

Write-Host 'Registering the Scheduled Task...'
$action = New-ScheduledTaskAction -Execute $venvPyw `
    -Argument ('"{0}\inbody_agent.py" --config "{0}\config.ini"' -f $InstallDir)
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host 'Verifying connectivity (--check)...'
& $venvPy (Join-Path $InstallDir 'inbody_agent.py') --config $configPath --check
$checkOk = ($LASTEXITCODE -eq 0)

Start-ScheduledTask -TaskName $TaskName

Write-Host ''
Write-Host '======================================================================'
Write-Host " Installed. Task '$TaskName' is running and will start at every boot."
Write-Host " Connectivity check: $(if ($checkOk) {'OK'} else {'FAILED - see the log'})"
Write-Host ''
Write-Host " Config     : $configPath"
Write-Host " Logs       : $InstallDir\logs\inbody-agent.log"
Write-Host " Status     : $InstallDir\status.json  (also pushed to GymFlow)"
Write-Host " Quarantine : $InstallDir\quarantine\"
Write-Host ''
Write-Host ' In GymFlow, an owner/manager sees live status at:'
Write-Host "   GET $($ApiUrl.TrimEnd('/'))/api/v1/inbody/agent/status"
Write-Host ''
Write-Host ' Manage the task:  Get-ScheduledTask -TaskName ""$TaskName""'
Write-Host ' Uninstall     :  .\Uninstall-InBodyAgent.ps1'
Write-Host '======================================================================'
