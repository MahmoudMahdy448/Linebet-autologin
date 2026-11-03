# Running Commands

All projects share the same pattern. Run each command **from that project's own directory** (`C:\Users\Dell\Desktop\workspace\Linebet-autologin`, `...\betjam-autologin`, `...\1xauto`).

`npm run login` is just `playwright test`. By default the browser runs **visible** (headed) unless `HEADLESS=true` is set.

---

## Environment variables (all projects)

| Variable                 | Default | Meaning                                                            |
| ------------------------ | ------- | ------------------------------------------------------------------ |
| `HEADLESS`               | unset   | `true` = hidden browser, `false`/unset = visible browser            |
| `HEADED`                 | unset   | `true` forces a visible browser (overrides `HEADLESS`) — 1xauto only |
| `START_INDEX`            | `1`     | First account to process (1-based row number in `accounts.csv`)     |
| `END_INDEX`              | last    | Last account to process (inclusive)                                  |
| `ACCOUNT_DELAY_SECONDS`  | `120`   | Cooldown between accounts (Linebet/betjam). `0` disables it          |
| `ACCOUNT_DELAY_SECONDS`  | `2`     | Cooldown between accounts (1xauto). `0` disables it                  |
| `ACCOUNT_TIMEOUT_SECONDS`| `180`   | Per-account timeout — betjam only                                     |
| `ALLOW_LIVE_RUN`         | unset   | `true` required for live runs — 1xauto only (guard)                  |
| `DRY_RUN`                | unset   | `true` validates accounts without navigating — 1xauto only           |
| `PROXY_URL`              | unset   | Proxy for all accounts — 1xauto only                                  |
| `MAX_RETRIES`            | `2`     | Retry ladder per account — 1xauto only                               |
| `LOW_MEMORY`             | unset   | `true` = single-process Chromium (1 GiB VMs) — 1xauto only           |

> `.env` files are loaded with `override: true`. If a variable is set both in `.env` and on the command line, **command line wins** for Linebet/betjam (config keeps it), and for 1xauto `HEADLESS`/`HEADED` passed on the CLI are preserved.

---

## Linebet-autologin / betjam-autologin

### 1. Visible browser, all accounts (default)
```powershell
npm run login
```

### 2. Headless (hidden) browser, all accounts
```powershell
$env:HEADLESS="true"; npm run login
```

### 3. Visible, starting from a specific account
```powershell
$env:START_INDEX="20"; npm run login
```

### 4. Headless, starting from a specific account
```powershell
$env:HEADLESS="true"; $env:START_INDEX="20"; npm run login
```

### 5. Visible, specific account range
```powershell
$env:START_INDEX="5"; $env:END_INDEX="15"; npm run login
```

### 6. Headless, specific account range
```powershell
$env:HEADLESS="true"; $env:START_INDEX="5"; $env:END_INDEX="15"; npm run login
```

### 7. Fast test — single account, visible, no cooldown
```powershell
$env:START_INDEX="1"; $env:END_INDEX="1"; $env:ACCOUNT_DELAY_SECONDS="0"; npm run login
```

### 8. Headless, no cooldown, single account
```powershell
$env:HEADLESS="true"; $env:START_INDEX="1"; $env:END_INDEX="1"; $env:ACCOUNT_DELAY_SECONDS="0"; npm run login
```

### 9. Long cooldown between accounts (safer against detection)
```powershell
$env:ACCOUNT_DELAY_SECONDS="300"; npm run login
```

### 10. Resume from where it left off with a 2-minute cooldown
```powershell
$env:START_INDEX="10"; $env:ACCOUNT_DELAY_SECONDS="120"; npm run login
```

### 11. betjam only — per-account timeout override
```powershell
$env:ACCOUNT_TIMEOUT_SECONDS="300"; npm run login
```

### 12. Full headless production-style batch with delays
```powershell
$env:HEADLESS="true"; $env:ACCOUNT_DELAY_SECONDS="120"; npm run login
```

---

## 1xauto (1xBet)

> Live runs are blocked unless `ALLOW_LIVE_RUN=true`. If the project auto-resumes from `state.json`, pass `START_INDEX` to force a restart point.

### 1. Visible browser, all accounts
```powershell
$env:ALLOW_LIVE_RUN="true"; npm run login
```

### 2. Headless, all accounts
```powershell
$env:HEADLESS="true"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 3. Visible, starting from a specific account
```powershell
$env:START_INDEX="20"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 4. Headless, starting from a specific account
```powershell
$env:HEADLESS="true"; $env:START_INDEX="20"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 5. Visible, specific range
```powershell
$env:START_INDEX="5"; $env:END_INDEX="15"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 6. Headless, specific range
```powershell
$env:HEADLESS="true"; $env:START_INDEX="5"; $env:END_INDEX="15"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 7. Fast test — single account, visible, no cooldown
```powershell
$env:START_INDEX="1"; $env:END_INDEX="1"; $env:ACCOUNT_DELAY_SECONDS="0"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 8. Headless, no cooldown, single account
```powershell
$env:HEADLESS="true"; $env:START_INDEX="1"; $env:END_INDEX="1"; $env:ACCOUNT_DELAY_SECONDS="0"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 9. Cooldown between accounts (default is only 2s)
```powershell
$env:ACCOUNT_DELAY_SECONDS="60"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 10. Headless with proxy + retries
```powershell
$env:HEADLESS="true"; $env:PROXY_URL="http://user:pass@host:port"; $env:MAX_RETRIES="3"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

### 11. Dry run (no browser navigation) — safe validation
```powershell
$env:DRY_RUN="true"; npm run login
```

### 12. Low-memory headless batch (1 GiB VM)
```powershell
$env:HEADLESS="true"; $env:LOW_MEMORY="true"; $env:ALLOW_LIVE_RUN="true"; npm run login
```

---

## Notes

- Env vars set this way persist for the rest of that PowerShell session. To clear them: `Remove-Item Env:HEADLESS, Env:START_INDEX, Env:ACCOUNT_DELAY_SECONDS -ErrorAction SilentlyContinue`.
- Default `ACCOUNT_DELAY_SECONDS` on Linebet/betjam is **120s** — the run can look "stuck" between accounts; that is the intentional cooldown (it logs `Cooling down Ns before next account...`).
- If the payment modal opens but the amount field never appears, the script now retries (reloads the recharge page) up to 3 times and saves `screenshots/debug-modal-<account>-<attempt>.jpg` for diagnosis.
- CMD (non-PowerShell) equivalent: `set HEADLESS=true && playwright test` or `set "START_INDEX=20" && npm run login`.
