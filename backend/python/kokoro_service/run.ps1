$ErrorActionPreference = 'Stop'
$serviceRoot = $PSScriptRoot
$python = Join-Path $serviceRoot '.venv\Scripts\python.exe'
$backendEnv = Join-Path $serviceRoot '..\..\.env'

if (-not (Test-Path $python)) {
    throw 'Kokoro TTS is not installed. Run npm run tts:setup first.'
}

if (Test-Path $backendEnv) {
    foreach ($line in Get-Content $backendEnv) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $name, $value = $line -split '=', 2
        $name = $name.Trim()
        if ($name -notmatch '^KOKORO_' -or [Environment]::GetEnvironmentVariable($name)) { continue }
        [Environment]::SetEnvironmentVariable($name, $value.Trim().Trim('"'), 'Process')
    }
}

Set-Location $serviceRoot
& $python -m uvicorn app:app --host localhost --port 8100
