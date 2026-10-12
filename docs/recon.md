# Accountable recon notes

Source: static analysis of the web client bundle
`https://web.accountable.de/assets/index-pIPOgsal.js` (bundle id may rotate).

## Client stack
- Vite single-page app, Sentry error reporting, Stripe.js for card payments.
- Sign-in options: Google (`accounts.google.com/gsi`), Apple (`appleid`), and
  email + password. No Auth0 or Firebase global detected, so auth is a
  first-party API.
- Login page: `https://web.accountable.de/login`.

## API surface
REST, versioned `/v2/` and `/v3/`. 74 distinct paths found in the bundle; full
list in `endpoints-static.txt`. Base host is resolved at runtime (not a plain
string in the bundle); candidates seen: `app.accountable.eu`. Confirm from live
network traffic after login.

### Tax and filing (ELSTER-relevant)
- `/v2/taxes/`, `/v2/taxes/resource/`
- `/v2/taxes/income-tax/yearly-prepayments`
- `/v2/taxes/trade-tax/yearly-prepayments`
- `/v2/taxes/de/employee-expenses/calculations`
- `/v2/calculations/taxes`
- `/v2/users/tax-office` (Finanzamt link)
- `/v3/users/tax-audit-protection`

### Bookkeeping
- `/v2/revenues`, `/v3/revenues`
- `/v2/expenses/categories/predict`, `/v2/expenses/categories/search`, `/v3/expenses`
- `/v2/quotes` (quotes/invoices)
- `/v2/transactions/*`
- `/v2/integrations/peppol`, `/v2/integrations/*` (e-invoicing)

### Auth / account
- `/v2/users`, `/v2/users/settings`, `/v2/users/refresh-access-token`
- `/v3/auth/step-up` (step-up auth for sensitive ops)

## Open questions (resolve from live traffic)
1. Exact API base host and path prefix.
2. Auth: bearer token vs cookie; token lifetime; refresh flow.
3. ELSTER submission: does the API submit directly, or return a document the
   user files? Look for a submit/transmit endpoint under `/v2/taxes/`.
