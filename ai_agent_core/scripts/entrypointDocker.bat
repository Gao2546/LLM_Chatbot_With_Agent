@echo off
echo Checking for Docker...
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo Docker not found. Please install Docker first:
    echo https://www.docker.com/products/docker-desktop
    echo.
    pause
    exit /b 1
)

echo.
echo Running Local Agent container...
echo.

docker run --rm ^
    --name local_api_agent ^
    --user %UID%:%GID% ^
    -v "%USERPROFILE%":/app/files ^
    -p 3333:3333 ^
    gao2546/local_api_agent:latest

echo.
echo Agent is running at:
echo http://localhost:3333
echo.
pause
