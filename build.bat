@echo off
setlocal enabledelayedexpansion

REM ===========================================================
REM  Build VS Code extension into a .vsix file
REM  Usage:  build.bat            (full build)
REM          build.bat --skip-install
REM ===========================================================

cd /d "%~dp0"

set "SKIP_INSTALL=0"
if /i "%~1"=="--skip-install" set "SKIP_INSTALL=1"

echo.
echo ==============================================
echo   Building Claude Code Usage Tracker (.vsix)
echo ==============================================
echo.

REM --- 1) Verify Node + npm are available -------------------
where node >nul 2>nul || (
  echo [ERROR] Node.js is not installed or not in PATH.
  goto :error
)
where npm >nul 2>nul || (
  echo [ERROR] npm is not installed or not in PATH.
  goto :error
)

REM --- 2) Install dependencies ------------------------------
if "%SKIP_INSTALL%"=="1" (
  echo [1/3] Skipping npm install ^(--skip-install^).
) else (
  if not exist node_modules (
    echo [1/3] Installing dependencies ^(npm install^)...
    call npm install
    if errorlevel 1 goto :error
  ) else (
    echo [1/3] node_modules present, running npm install to ensure lockfile sync...
    call npm install
    if errorlevel 1 goto :error
  )
)
echo.

REM --- 3) Compile TypeScript --------------------------------
echo [2/3] Compiling TypeScript...
call npm run compile
if errorlevel 1 goto :error
echo.

REM --- 4) Package .vsix via @vscode/vsce --------------------
echo [3/3] Packaging .vsix via @vscode/vsce...
REM Read version from package.json so the file is suffixed with the version
for /f "usebackq tokens=2 delims=:," %%v in (`findstr /R /C:"\"version\"" package.json`) do (
  set "RAW_VERSION=%%~v"
)
set "RAW_VERSION=!RAW_VERSION:"=!"
set "RAW_VERSION=!RAW_VERSION: =!"
set "VSIX_NAME=cost-of-code-!RAW_VERSION!.vsix"

call npx --yes @vscode/vsce package --out "!VSIX_NAME!"
if errorlevel 1 goto :error
echo.

REM --- 5) Done ----------------------------------------------
echo ==============================================
echo   Build succeeded
echo ==============================================
for %%I in ("!VSIX_NAME!") do (
  echo   Output : %%~fI
  echo   Size   : %%~zI bytes
)
echo.
echo Install locally with:
echo   code --install-extension "!VSIX_NAME!"
echo.
endlocal & exit /b 0

:error
echo.
echo ==============================================
echo   Build FAILED
echo ==============================================
endlocal & exit /b 1
