$ErrorActionPreference = 'Stop'
$serviceRoot = $PSScriptRoot
$venv = Join-Path $serviceRoot '.venv'

if (-not (Test-Path $venv)) {
    python -m venv $venv
}

$python = Join-Path $venv 'Scripts\python.exe'
& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $serviceRoot 'requirements.txt')

Write-Host 'Kokoro TTS environment is ready.'
