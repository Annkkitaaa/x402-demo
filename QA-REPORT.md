# x402 PoC — Complete QA Report

> Prepared as a senior QA engineer & developer review.
> Stack: TypeScript · Express · ethers.js · EIP-712 · EIP-3009

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                       │
│  public/script.js  (browser, ethers UMD)                │
│  src/client.ts     (Node.js CLI, commander)             │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP (GET + X-PAYMENT header)
┌──────────────────────▼──────────────────────────────────┐
│                    SERVER LAYER                         │
│  src/server.ts       (simulated facilitator)            │
│  src/server-real.ts  (real x402.org facilitator)        │
│  Routes:  /public · /api-call · /premium-data           │
│           /facilitator/verify · /settle · /supported    │
└──────────────────────┬──────────────────────────────────┘
                       │  in-process call (simulated)
                       │  or HTTPS call (real mode)
┌──────────────────────▼──────────────────────────────────┐
│                 FACILITATOR LAYER                       │
│  src/facilitator.ts       (SimpleFacilitator)           │
│  src/real-facilitator.ts  (RealFacilitator → x402.org)  │
└─────────────────────────────────────────────────────────┘
```

### Component Inventory

| File | Role |
|------|------|
| `src/types.ts` | TypeScript interfaces for the x402 protocol |
| `src/server.ts` | Express server — simulated payments (demo mode) |
| `src/server-real.ts` | Express server — real on-chain payments |
| `src/facilitator.ts` | In-process payment verifier + mock settler |
| `src/real-facilitator.ts` | HTTP client to x402.org facilitator API |
| `src/client.ts` | CLI tool (`commander`) — full payment workflow |
| `src/generate-wallet.ts` | One-shot wallet generator (for testnet) |
| `public/index.html` | Web demo UI |
| `public/script.js` | Frontend payment logic (ethers UMD) |
| `public/styles.css` | Dark-theme CSS |

---

## 2. Expected Payment Flow (How x402 Works Here)

```
1. Client  → GET /api-call                          (no header)
2. Server  ← 402 + PaymentRequiredResponse          (nonce + requirement)
3. Client  → signs EIP-712 TransferWithAuthorization
4. Client  → GET /api-call + X-PAYMENT: <base64>    (payment header)
5. Server  → SimpleFacilitator.verify()             (signature check)
6. Server  → SimpleFacilitator.settle()             (marks nonce used, returns fake txHash)
7. Client  ← 200 + protected resource + txHash
```

The **X-PAYMENT** header is a base64-encoded JSON:
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "from": "0x...", "to": "0x...", "value": "100000",
    "validAfter": 1720000000, "validBefore": 1720000300,
    "nonce": "0xabcd...", "signature": "0x..."
  }
}
```

---

## 3. Bugs Found — Severity Classification

### 🔴 CRITICAL

#### BUG-01 — Nonce Issued ≠ Nonce Verified (Broken Replay Protection at Server Level)
**File:** [src/server.ts:60-62](src/server.ts#L60-L62), [src/server-real.ts:60-62](src/server-real.ts#L60-L62)

```typescript
// When a paid request arrives, the server reconstructs a FRESH requirement
// with a NEW random nonce — the original nonce from the 402 response is lost.
const requirement = createPaymentRequirement('/premium-data', '1000000');
//                                                              ^ no nonce passed!
```

**Impact:** The `issuedNonces` Map in `server.ts` is completely inert — nonces stored there are never checked against the payment. The server cannot verify that the payment nonce was one it actually issued. A client can present any self-generated nonce and it passes server-level nonce validation. Only the in-memory `usedNonces` Set in `SimpleFacilitator` provides any replay protection.

**Fix:** Pass the original nonce from the 402 response through to `createPaymentRequirement()` when verifying. Store the nonce-to-requirement mapping in a server-side map and look it up when verifying.

---

#### BUG-02 — TOCTOU Race Condition in `SimpleFacilitator.settle()`
**File:** [src/facilitator.ts:135-181](src/facilitator.ts#L135-L181)

```typescript
async settle(paymentHeader, requirements) {
  const verification = await this.verify(/* reads usedNonces */);  // Step A
  // ... async gap ...
  this.usedNonces.add(eip3009Payload.nonce);                      // Step B
}
```

**Impact:** Two concurrent requests with the same payment header can both pass `verify()` (Step A) before either marks the nonce used (Step B). In a high-traffic scenario this could allow double-spending of a single signed payment.

**Fix:** Use an atomic check-and-set (e.g., a database transaction, or `if (!set.has(n)) { set.add(n); }` synchronously before any `await`).

---

#### BUG-03 — XSS via `error.message` Injected into `innerHTML`
**File:** [public/script.js:146](public/script.js#L146)

```javascript
resultDiv.innerHTML = `<div class="error"><strong>Error:</strong> ${error.message}</div>`;
```

**Impact:** If the server returns a response whose `error` field contains HTML (e.g., `<img src=x onerror=alert(1)>`), it executes in the victim's browser. Since the page handles private keys, XSS could steal the wallet key.

**Fix:** Use `textContent` or escape the string: `element.textContent = error.message`.

---

### 🟠 HIGH

#### BUG-04 — Implicit `window.event` Global in `accessContent()`
**File:** [public/script.js:50](public/script.js#L50)

```javascript
const button = event.target;  // 'event' is window.event — deprecated
```

**Impact:** Breaks in Firefox and any browser running in strict ES module mode. The button reference is `undefined`, causing the disabled/re-enable logic to fail silently.

**Fix:** Pass the event to the function: `onclick="accessContent('/api-call', 'api', event)"` and add `event` as a parameter.

---

#### BUG-05 — Private Key Stored in `sessionStorage`
**File:** [public/script.js:23](public/script.js#L23)

```javascript
sessionStorage.setItem('privateKey', privateKey);
```

**Impact:** Any JavaScript on the page (including third-party scripts or via XSS) can read the private key. Combined with BUG-03, this is a full key-theft vector.

**Fix (for production):** Never store private keys in browser storage. Use a hardware wallet (MetaMask, WalletConnect) or derive an ephemeral session key.

---

#### BUG-06 — `getChainId()` Silently Defaults to Chain ID 1 (Ethereum Mainnet)
**Files:** [src/client.ts:192-200](src/client.ts#L192-L200), [public/script.js:283-291](public/script.js#L283-L291)

```typescript
return chainIds[network] || 1;  // unknown network → Ethereum mainnet!
```

**Impact:** A typo like `base-mainnet` or an unsupported network silently causes the EIP-712 signature to use chain ID 1. The signature is valid but for the wrong chain; it would be rejected by the correct-chain contract but could theoretically be replayed on Ethereum mainnet (which has a real USDC contract with the same address).

**Fix:** Throw an error for unrecognised networks instead of defaulting.

---

### 🟡 MEDIUM

#### BUG-07 — No Input Validation on Facilitator HTTP Endpoints
**File:** [src/server.ts:163-177](src/server.ts#L163-L177)

```typescript
app.post('/facilitator/verify', async (req, res) => {
  const { paymentHeader, paymentRequirements } = req.body;
  // No check: what if body is undefined, or paymentHeader is an object?
  const result = await facilitator.verify(paymentHeader, paymentRequirements);
```

**Impact:** A `POST /facilitator/verify` with an empty or malformed body causes an unhandled exception that crashes the route (500 error). The facilitator endpoints are also publicly accessible with no authentication.

**Fix:** Add `express-validator` or manual guards; add an API key or IP-allowlist to facilitator routes.

---

#### BUG-08 — No Body Size Limit on Express
**File:** [src/server.ts:20](src/server.ts#L20)

```typescript
app.use(express.json()); // default limit is 100kb
```

**Impact:** A client sending a 50 MB base64 X-PAYMENT header in a GET request triggers unnecessary CPU parsing work. Express does impose a 100 KB JSON body limit, but there's no limit on header size.

**Fix:** Add `express.json({ limit: '10kb' })` and consider an HTTP reverse proxy (nginx) to cap header sizes.

---

#### BUG-09 — `issuedNonces` Map Is Never Used for Verification
**File:** [src/server.ts:31](src/server.ts#L31), [src/server.ts:186-196](src/server.ts#L186-L196)

The `issuedNonces` map stores nonces issued in 402 responses but is **never consulted** during payment verification. This dead code creates a false sense of security.

**Fix:** Either remove the map or actually use it — check that the payment nonce was issued by this server and hasn't been used before, then delegate to the facilitator.

---

#### BUG-10 — Decoded `paymentPayload` Variable Is Unused in Route Handlers
**File:** [src/server.ts:56-57](src/server.ts#L56-L57), [src/server-real.ts:56-57](src/server-real.ts#L56-L57)

```typescript
const paymentPayloadJson = Buffer.from(paymentHeader, 'base64').toString('utf-8');
const paymentPayload: PaymentPayload = JSON.parse(paymentPayloadJson);
// ^ Never used — facilitator re-decodes it internally
```

**Fix:** Remove the redundant decode from the route handlers (it's already done inside the facilitator).

---

#### BUG-11 — Static / Hardcoded Crypto Price Data in Premium Endpoint
**File:** [src/server.ts:87-94](src/server.ts#L87-L94)

```typescript
bitcoinPrice: '$94,523.45',
ethereumPrice: '$3,234.12',
```

**Impact:** Users might not realise this is demo data; could be misleading. For a production-like PoC, a disclaimer should be clear.

---

### 🟢 LOW / UX

#### BUG-12 — `showNotification()` Logs to Console Only — No Visible Toast
**File:** [public/script.js:307-318](public/script.js#L307-L318)

```javascript
function showNotification(message, type) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // No DOM notification created
}
```

**Impact:** Users see no feedback for events like "Payment required: 0.1 USDC" or "Wallet connected successfully!" Only developers watching the console get this information.

**Fix:** Implement a simple toast/snackbar DOM element.

---

#### BUG-13 — No Loading Spinner During Payment Processing
When the user clicks "Pay & Access", the button says "Processing..." but there is no loading spinner and no indication of which step is currently active beyond the subtle opacity change.

---

#### BUG-14 — `validAfter` Is Never Validated by the Server/Facilitator
**File:** [src/facilitator.ts:92-98](src/facilitator.ts#L92-L98)

The facilitator only checks `validBefore < now` but does **not** check `validAfter > now`. A payment with `validAfter` far in the future is accepted immediately.

---

#### BUG-15 — Fake tx Hash Uses `Math.random()` (Cryptographically Insecure)
**File:** [src/facilitator.ts:160-163](src/facilitator.ts#L160-L163)

```typescript
const fakeTxHash = `0x${Array.from({ length: 64 }, () =>
  Math.floor(Math.random() * 16).toString(16)
).join('')}`;
```

This is acceptable for a demo but `randomBytes` would be more appropriate.

---

#### BUG-16 — Missing Content-Security-Policy and Security Headers
The Express server returns no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security` headers.

---

## 4. Test Plan

### 4.1 Unit Tests (Vitest — offline, fast)

| Test File | Coverage |
|-----------|----------|
| `tests/unit/facilitator.test.ts` | `SimpleFacilitator.verify()` & `.settle()` — all paths |
| `tests/unit/cli.test.ts` | `formatAmount()`, `getChainId()`, `createPayment()`, wallet gen |

**Categories covered:**
- Happy path (valid signed payment)
- Version mismatch
- Scheme/network mismatch
- Amount mismatch (underpayment, overpayment, zero)
- Recipient mismatch
- Expired payment (`validBefore` in past)
- Bad signature (wrong wallet, corrupted sig)
- Malformed input (bad base64, invalid JSON, empty string)
- Replay attack (nonce reuse after settle)
- TOCTOU race (concurrent settlements — documented as bug)

### 4.2 Integration Tests (Vitest + Supertest — HTTP layer)

| Test File | Coverage |
|-----------|----------|
| `tests/integration/api.test.ts` | All Express routes end-to-end |

**Categories covered:**
- `GET /public` — free access, timestamp field
- `GET /api-call` — 402 response shape, nonce, amount, replay attack
- `GET /premium-data` — correct price gate
- `POST /facilitator/verify` — direct facilitator API
- `POST /facilitator/settle` — empty body crash test
- Static file serving (HTML, CSS, JS)
- Edge cases: huge header, SQL injection strings, null bytes
- Security: missing CORS, missing CSP headers
- HTTP method correctness (404 vs 405)

### 4.3 E2E Tests (Playwright — real browser)

| Test File | Coverage |
|-----------|----------|
| `tests/e2e/payment-flow.spec.ts` | Full browser user journey |

**Categories covered:**
- Page load, title, layout
- Three content cards present
- Wallet connection (valid key, invalid key, auto-reconnect)
- `sessionStorage` key persistence (security documentation)
- Free content access (no payment)
- 0.1 USDC payment — full 5-step animation
- 1.0 USDC premium payment
- Transaction section with tx hash + explorer link
- Button re-enable after payment
- Responsive design (mobile/tablet)
- Accessibility basics (lang attr, password input type)
- XSS via `error.message` innerHTML (security bug test)
- `window.event` bug documentation

---

## 5. How to Run the Tests

### Step 1 — Install test dependencies
```bash
npm install --save-dev vitest supertest @vitest/coverage-v8 @types/supertest \
  @playwright/test
```

### Step 2 — Unit + Integration tests (no server needed)
```bash
# Run all unit and integration tests
npx vitest run

# Run with coverage report
npx vitest run --coverage

# Watch mode during development
npx vitest
```

### Step 3 — E2E tests (server must be running)
```bash
# Install Playwright browsers (first time)
npx playwright install chromium

# Start server in one terminal
npm run dev:server

# Run E2E tests in another terminal
npx playwright test

# With UI mode (visual)
npx playwright test --ui

# Single test file
npx playwright test tests/e2e/payment-flow.spec.ts
```

### Step 4 — Manual CLI smoke test
```bash
# Terminal 1: start server
npm run dev:server

# Terminal 2: test free endpoint
npm run dev:client test-public

# Test paid endpoint (use a key from npm run generate-wallet)
npm run dev:client request --endpoint /api-call --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --verbose

# Test premium endpoint
npm run dev:client request --endpoint /premium-data --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Step 5 — Replay attack manual test
```bash
# Capture a valid X-PAYMENT header
PAYMENT=$(curl -s http://localhost:3402/api-call | node -e "
  const readline = require('readline');
  // ... run CLI with --verbose and copy X-PAYMENT header
")

# First request — should succeed (200)
curl -H "X-PAYMENT: $PAYMENT" http://localhost:3402/api-call

# Second request — should fail (402, nonce already used)
curl -H "X-PAYMENT: $PAYMENT" http://localhost:3402/api-call
```

---

## 6. Simulated Real User Scenarios

### Scenario A — New User (Happy Path)
1. `npm install && npm run build`
2. `npm run generate-wallet` → save address + key
3. `npm run dev:server`
4. Open `http://localhost:3402`
5. Paste private key → Connect Wallet ✓
6. Click "Access Now" on FREE card → instant 200 ✓
7. Click "Pay & Access" on 0.1 USDC → watch 5-step animation → transaction shown ✓
8. Click "Pay & Access" on 1.0 USDC → premium data shown ✓

### Scenario B — CLI User
1. Start server: `npm run dev:server`
2. Test public: `npm run dev:client test-public`
3. View endpoints: `npm run dev:client info`
4. Make paid request: `npm run dev:client request -e /api-call -k <KEY>`
5. Verify output shows Payment Successful + txHash

### Scenario C — Replay Attack Attempt
1. Run CLI request, capture X-PAYMENT header
2. Re-send same header to the same endpoint
3. **Expected:** 402, `"reason": "Nonce already used"`
4. **Actual:** Works correctly in simulated mode ✓
   (But resets on server restart — persisted storage needed for production)

### Scenario D — Invalid Payment
1. Send a request with a random base64 string as X-PAYMENT
2. **Expected:** 400 Invalid payment format
3. **Actual:** Works correctly ✓

### Scenario E — Wrong Amount
1. Sign a payment for 50,000 (0.05 USDC) against the 0.1 USDC endpoint
2. **Expected:** 402, `"reason": "Payment amount mismatch"`
3. **Actual:** Works correctly ✓

### Scenario F — Expired Payment
1. Create a signed payment with `validBefore` in the past
2. **Expected:** 402, `"reason": "Payment expired"`
3. **Actual:** Works correctly ✓

---

## 7. Production Readiness Assessment

| Category | Score | Notes |
|----------|-------|-------|
| Core protocol correctness | 7/10 | EIP-712 signing correct; nonce lifecycle broken (BUG-01) |
| Replay protection | 5/10 | In-memory only; resets on restart; BUG-01 bypasses server-level check |
| Security | 3/10 | XSS (BUG-03), private key in sessionStorage (BUG-05), no CSP |
| Error handling | 6/10 | Most errors caught; facilitator endpoints unguarded |
| UX | 5/10 | Good visual flow; no visible notifications; implicit event global |
| Code quality | 7/10 | TypeScript, clean structure; some dead code |
| Test coverage | 0/10 | No tests exist before this PR |
| Scalability | 2/10 | In-memory state; no rate limiting; no persistence |

---

## 8. Recommendations for Production

### Security
1. **Fix BUG-03 immediately** — replace `innerHTML` with `textContent` for error messages
2. **Fix BUG-05** — integrate MetaMask/WalletConnect instead of raw private key input
3. **Fix BUG-06** — throw on unknown network instead of defaulting to mainnet
4. Add `helmet()` middleware for security headers (CSP, HSTS, X-Frame-Options)
5. Add authentication (API key or HMAC) on facilitator endpoints

### Architecture
6. **Fix BUG-01** — track issued nonces server-side and validate them during payment verification
7. **Fix BUG-02** — use atomic nonce marking (database transaction or synchronous set-before-await)
8. Replace in-memory nonce storage with Redis or a database for persistence across restarts
9. Add rate limiting per IP (`express-rate-limit`)
10. Add CORS configuration

### UX
11. Implement visible toast notifications (replace console.log)
12. **Fix BUG-04** — pass event as parameter to `accessContent()`
13. Add `validAfter` validation in the facilitator
14. Show a loading spinner with accessible aria-live announcements

### Testing
15. Run the unit + integration tests in CI on every pull request
16. Run Playwright E2E tests nightly against the staging server
17. Add fuzz testing for the payment header parser
