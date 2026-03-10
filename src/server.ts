/**
 * x402 Resource Server (simulated payments)
 *
 * Bugs fixed:
 *  BUG-01  — nonce issued ≠ nonce verified: store full requirement, look up by nonce
 *  BUG-07  — no input validation on facilitator endpoints: guards added
 *  BUG-08  — no body size limit: express.json({ limit: '10kb' })
 *  BUG-09  — issuedNonces Map never used: replaced by issuedRequirements
 *  BUG-10  — unused paymentPayload decode in route handlers: removed
 *  BUG-11  — static market data presented as real: isDemo flag added
 *  BUG-16  — missing security headers: Content-Security-Policy etc. added
 */

import express, { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type {
  PaymentRequiredResponse,
  PaymentRequirement,
  PaymentPayload,
  EIP3009Payload,
} from './types.js';
import { SimpleFacilitator } from './facilitator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const facilitator = new SimpleFacilitator();

// ── BUG-16 FIX: security headers ─────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
    ].join('; ')
  );
  next();
});

// BUG-08 FIX: body size limit prevents DoS via oversized JSON payloads
app.use(express.json({ limit: '10kb' }));

// Serve static files from public directory
app.use(express.static(join(__dirname, '../public')));

// Configuration
const SERVER_ADDRESS = process.env.SERVER_WALLET_ADDRESS || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PORT = process.env.PORT || 3402;

// BUG-01 FIX: store the full PaymentRequirement keyed by its nonce so the
// route handler can look it up precisely when verifying a paid request.
// BUG-09 FIX: replaces the dead issuedNonces Map that was never consulted.
const issuedRequirements = new Map<string, { requirement: PaymentRequirement; expires: number }>();

// ── Helper functions ─────────────────────────────────────────────────────────

function createPaymentRequirement(
  endpoint: string,
  amount: string,
  nonce?: string
): PaymentRequirement {
  return {
    scheme: 'exact',
    network: 'base-sepolia',
    maxAmountRequired: amount,
    payTo: SERVER_ADDRESS,
    asset: USDC_BASE_SEPOLIA,
    maxTimeoutSeconds: 300,
    mimeType: 'application/json',
    nonce: nonce || '0x' + randomBytes(32).toString('hex'),
    extra: { name: 'USD Coin', version: '2' },
  };
}

/**
 * BUG-01 FIX: Issue a 402 and store the full requirement so we can look it
 * up precisely (by nonce) when the paid request arrives.
 */
function sendPaymentRequired(res: Response, endpoint: string, amount: string): void {
  const nonce = '0x' + randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  const requirement = createPaymentRequirement(endpoint, amount, nonce);

  issuedRequirements.set(nonce, { requirement, expires: expiresAt });

  const response: PaymentRequiredResponse = {
    x402Version: 1,
    accepts: [requirement],
    error: `Payment required for ${endpoint}`,
  };
  res.status(402).json(response);
}

/**
 * BUG-01 FIX: Decode the nonce from a base64 payment header synchronously.
 * Returns null on any parse failure.
 */
function extractNonce(paymentHeader: string): string | null {
  try {
    const json = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    const parsed = JSON.parse(json) as PaymentPayload;
    const nonce = (parsed.payload as EIP3009Payload).nonce;
    return typeof nonce === 'string' ? nonce : null;
  } catch {
    return null;
  }
}

/**
 * BUG-01 FIX: Look up and consume the stored requirement for a nonce.
 * Returns null if the nonce is unknown or has expired.
 * The entry is deleted on retrieval — prevents reuse at the server layer.
 */
function consumeRequirement(nonce: string): PaymentRequirement | null {
  const entry = issuedRequirements.get(nonce);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    issuedRequirements.delete(nonce);
    return null;
  }
  issuedRequirements.delete(nonce); // consume
  return entry.requirement;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/public', (_req: Request, res: Response) => {
  res.json({
    message: 'This is a public endpoint, no payment required!',
    timestamp: new Date().toISOString(),
  });
});

app.get('/premium-data', async (req: Request, res: Response) => {
  const paymentHeader = req.headers['x-payment'] as string | undefined;

  if (!paymentHeader) {
    return sendPaymentRequired(res, '/premium-data', '1000000'); // 1 USDC
  }

  // BUG-01 FIX: look up the original requirement issued for this nonce
  const nonce = extractNonce(paymentHeader);
  if (!nonce) {
    return res.status(400).json({ error: 'Invalid payment header format' });
  }

  const requirement = consumeRequirement(nonce);
  if (!requirement) {
    return res.status(402).json({
      error: 'Payment nonce not recognised or expired. Please initiate a new payment request.',
    });
  }

  // Guard against cross-endpoint nonce reuse
  if (requirement.maxAmountRequired !== '1000000') {
    return res.status(402).json({ error: 'Payment was not issued for this endpoint' });
  }

  try {
    const verification = await facilitator.verify(paymentHeader, requirement);
    if (!verification.isValid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        reason: verification.invalidReason,
      });
    }

    const settlement = await facilitator.settle(paymentHeader, requirement);
    if (!settlement.success) {
      return res.status(402).json({
        error: 'Payment settlement failed',
        reason: settlement.error,
      });
    }

    res.json({
      message: 'Payment successful! Here is your premium data.',
      data: {
        // BUG-11 FIX: clearly flag demo/static data so it cannot be mistaken for live prices
        isDemo: true,
        disclaimer: 'Prices shown are static demo data, not live market prices.',
        secret: 'This is valuable premium content!',
        bitcoinPrice: '$94,523.45',
        ethereumPrice: '$3,234.12',
        marketInsights: [
          'BTC showing bullish momentum',
          'ETH upgrade scheduled for Q2',
          'DeFi TVL reaching new highs',
        ],
      },
      payment: {
        txHash: settlement.txHash,
        network: settlement.networkId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

app.get('/api-call', async (req: Request, res: Response) => {
  const paymentHeader = req.headers['x-payment'] as string | undefined;

  if (!paymentHeader) {
    return sendPaymentRequired(res, '/api-call', '100000'); // 0.1 USDC
  }

  const nonce = extractNonce(paymentHeader);
  if (!nonce) {
    return res.status(400).json({ error: 'Invalid payment header format' });
  }

  const requirement = consumeRequirement(nonce);
  if (!requirement) {
    return res.status(402).json({
      error: 'Payment nonce not recognised or expired. Please initiate a new payment request.',
    });
  }

  if (requirement.maxAmountRequired !== '100000') {
    return res.status(402).json({ error: 'Payment was not issued for this endpoint' });
  }

  try {
    const verification = await facilitator.verify(paymentHeader, requirement);
    if (!verification.isValid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        reason: verification.invalidReason,
      });
    }

    const settlement = await facilitator.settle(paymentHeader, requirement);
    if (!settlement.success) {
      return res.status(402).json({
        error: 'Payment settlement failed',
        reason: settlement.error,
      });
    }

    res.json({
      message: 'API call successful!',
      result: {
        status: 'ok',
        data: 'Your API request has been processed',
        requestId: randomBytes(16).toString('hex'),
      },
      payment: {
        txHash: settlement.txHash,
        network: settlement.networkId,
      },
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

// ── Facilitator proxy endpoints ───────────────────────────────────────────────

// BUG-07 FIX: validate request body before passing to facilitator
app.post('/facilitator/verify', async (req: Request, res: Response) => {
  const { paymentHeader, paymentRequirements } = req.body ?? {};
  if (typeof paymentHeader !== 'string' || !paymentHeader) {
    return res.status(400).json({ error: 'Missing or invalid paymentHeader' });
  }
  if (!paymentRequirements || typeof paymentRequirements !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid paymentRequirements' });
  }
  const result = await facilitator.verify(paymentHeader, paymentRequirements);
  res.json(result);
});

app.post('/facilitator/settle', async (req: Request, res: Response) => {
  const { paymentHeader, paymentRequirements } = req.body ?? {};
  if (typeof paymentHeader !== 'string' || !paymentHeader) {
    return res.status(400).json({ error: 'Missing or invalid paymentHeader' });
  }
  if (!paymentRequirements || typeof paymentRequirements !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid paymentRequirements' });
  }
  const result = await facilitator.settle(paymentHeader, paymentRequirements);
  res.json(result);
});

app.get('/facilitator/supported', (_req: Request, res: Response) => {
  res.json(facilitator.getSupported());
});

// ── Server startup ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           x402 Resource Server - Running                  ║
╠════════════════════════════════════════════════════════════╣
║  Port:              ${PORT}                                    ║
║  Network:           Base Sepolia (Testnet)                ║
║  Server Address:    ${SERVER_ADDRESS.slice(0, 20)}...      ║
║  USDC Contract:     ${USDC_BASE_SEPOLIA.slice(0, 20)}...   ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /public           (Free - no payment required)    ║
║    GET  /premium-data     (1.0 USDC)                      ║
║    GET  /api-call         (0.1 USDC)                      ║
║                                                            ║
║  Facilitator:                                              ║
║    POST /facilitator/verify                                ║
║    POST /facilitator/settle                                ║
║    GET  /facilitator/supported                             ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// BUG-09 FIX: cleanup now uses issuedRequirements (the live map)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of issuedRequirements.entries()) {
    if (data.expires < now) {
      issuedRequirements.delete(nonce);
    }
  }
}, 60_000);
