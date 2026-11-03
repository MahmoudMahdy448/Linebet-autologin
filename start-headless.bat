@echo off
cd /d "%~dp0"
echo Starting Linebet AutoLogin (HEADLESS mode)
echo =========================================
set HEADLESS=true
rem Seconds between accounts.
set ACCOUNT_DELAY_SECONDS=5
echo Cooldown between accounts: %ACCOUNT_DELAY_SECONDS%s
npm run login
pause
