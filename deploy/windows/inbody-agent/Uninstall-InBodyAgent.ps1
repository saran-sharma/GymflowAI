<#
.SYNOPSIS
    Remove the GymFlow InBody Agent scheduled task (and optionally its files).

.PARAMETER InstallDir
    Where the agent was installed. Default: C:\GymFlow\InBodyAgent

.PARAMETER RemoveFiles
    Also delete the install directory (venv, config, secret, logs, state).

.EXAMPLE
    .\Uninstall-InBodyAgent.ps1
    .\Uninstall-InBodyAgent.ps1 -RemoveFiles
#>
[CmdletBinding()]
param(
    [string] $InstallDir = 'C:\GymFlow\InBodyAgent',
    [switch] $RemoveFiles
)

$ErrorActionPreference = 'Stop'
$TaskName = 'GymFlow InBody Agent'

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated (Administrator) PowerShell.'
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
}
else {
    Write-Host "Scheduled task '$TaskName' was not present."
}

if ($RemoveFiles) {
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
        Write-Host "Deleted $InstallDir"
    }
}
else {
    Write-Host "Left files in $InstallDir (pass -RemoveFiles to delete)."
}
