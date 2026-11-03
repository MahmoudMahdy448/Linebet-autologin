@echo off
cd /d "%~dp0"
echo Starting Linebet AutoLogin (HEADED mode)
echo ========================================
set HEADLESS=false
rem Seconds between accounts.
set ACCOUNT_DELAY_SECONDS=5
echo Cooldown between accounts: %ACCOUNT_DELAY_SECONDS%s
npm run login
pause
