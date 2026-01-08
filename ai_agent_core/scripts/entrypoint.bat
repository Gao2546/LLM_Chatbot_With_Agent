# Check if npm exists
Write-Host "=== Checking for npm... ==="
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm not found. Installing Node.js..."
    Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v18.x/node-v18.20.3-x64.msi" -OutFile "$env:TEMP\node_installer.msi"
    Start-Process msiexec.exe -Wait -ArgumentList "/i $env:TEMP\node_installer.msi /quiet"
} else {
    Write-Host "npm found: $(npm -v)"
}

# Create folder in user's home
$installDir = Join-Path $HOME "api_local_server"
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

# Install npm package
Write-Host "=== Installing api_local_server in $installDir ==="
Set-Location $installDir
if (-not (Test-Path "package.json")) {
    npm init -y | Out-Null
}
npm i api_local_server

# Run the package
Write-Host "=== Running api_local_server ==="
#npx api_local_server
node ./node_modules/api_local_server/build/index.js

echo.
pause
