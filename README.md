# Linebet AutoLogin

Automated login and Vodafone Cash deposit screenshot tool for [Linebet](https://linebet.com) using Playwright.

Processes multiple accounts from a CSV file, logs in, navigates to the deposit page, and captures payment screenshots — all in one run.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Git](https://git-scm.com/)

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/linebet-autologin.git
cd linebet-autologin
npm install
npx playwright install chromium
```

## Accounts

Create `accounts.csv` in the project root:

```csv
Email,Password,re-enter_password
user1@gmail.com,password1,user1@gmail.com
user2@gmail.com,password2,user2@gmail.com
```

> Only `Email` and `Password` columns are used. `re-enter_password` is ignored.

## Usage

```bash
npm run login
```

### Skip to a specific account

```bash
$env:START_INDEX="5"; npm run login
```

### Use environment variables instead of CSV

Create `.env`:

```
LINEBET_USERNAME=your@email.com
LINEBET_PASSWORD=yourpassword
```

## Output

| Path | Contents |
|------|----------|
| `screenshots/` | Payment screenshots named by wallet number |
| `logs/failed-accounts.log` | Error details for any failed accounts |

## How It Works

1. Opens Linebet login page
2. Fills in credentials and submits
3. Navigates to the deposit page
4. Clicks Vodafone Cash payment option
5. Dismisses the popup message
6. Captures a screenshot of the payment modal (wallet number, amount field, etc.)

Each account runs in a fresh browser context so sessions don't leak.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Could not find login fields` | Linebet may have changed their form — check selectors in `tests/login.spec.js` |
| `Payment frame not found` | Deposit page loaded too slowly — increase the 30s timeout in the script |
| `Login failed` | Double-check credentials in `accounts.csv` |
| `ENOSPC: no space left` | Free up disk space — screenshots accumulate |

## Limitations

- Does not bypass CAPTCHAs, OTPs, or 2FA
- Requires manual intervention for security challenges
- Captures screenshots only — does not auto-submit deposits

## License

MIT
