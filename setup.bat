@echo off
setlocal enabledelayedexpansion

REM ===========================================================
REM  New joiner setup for the VS Code extension workspace.
REM  After this succeeds, open this folder in VS Code and press F5.
REM
REM  Usage:
REM    setup.bat
REM    setup.bat --no-pause
REM ===========================================================

cd /d "%~dp0"

set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

echo.
echo ==============================================
echo   Cost Of Code - New Joiner Setup
echo ==============================================
echo.

REM --- 1) Verify required tools -----------------------------
where node >nul 2>nul || (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo         Install Node.js 20+ LTS, then run this file again.
  goto :error
)

where npm >nul 2>nul || (
  echo [ERROR] npm is not installed or not in PATH.
  echo         Install Node.js 20+ LTS, then run this file again.
  goto :error
)

for /f "usebackq tokens=*" %%v in (`node --version`) do set "NODE_VERSION=%%v"
for /f "usebackq tokens=*" %%v in (`npm --version`) do set "NPM_VERSION=%%v"
for /f "usebackq tokens=*" %%v in (`node -p "process.versions.node.split('.')[0]"`) do set "NODE_MAJOR=%%v"

echo [1/3] Found Node.js !NODE_VERSION! and npm !NPM_VERSION!.

if "!NODE_MAJOR!"=="" (
  echo [ERROR] Could not detect Node.js version.
  goto :error
)
if !NODE_MAJOR! LSS 20 (
  echo [ERROR] Node.js 20+ is required. Current version: !NODE_VERSION!
  goto :error
)
echo.

REM --- 2) Install npm dependencies --------------------------
if exist package-lock.json (
  echo [2/3] Installing dependencies with npm ci...
  call npm ci
) else (
  echo [2/3] package-lock.json not found; installing dependencies with npm install...
  call npm install
)
if errorlevel 1 goto :error
echo.

REM --- 3) Compile once so F5 starts cleanly -----------------
echo [3/3] Compiling TypeScript...
call npm run compile
if errorlevel 1 goto :error
echo.

echo ==============================================
echo   Setup succeeded
echo ==============================================
echo.
echo Next step:
echo   Open this folder in VS Code and press F5.
echo   Choose "Run Extension" if VS Code asks for a launch configuration.
echo.

goto :done

:error
echo.
echo ==============================================
echo   Setup FAILED
echo ==============================================
echo Fix the error above, then run setup.bat again.
echo.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1

:done
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 0
