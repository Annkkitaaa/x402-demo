/**
 * x402 Resource Server — REAL on-chain payments via x402.org facilitator
 *
 * Bugs fixed (same as server.ts):
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
import { RealFacilitator } from './real-facilitator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const facilitator = new RealFacilitator();

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

// BUG-08 FIX: body size limit
app.use(express.json({ limit: '10kb' }));

// Serve static files from public directory
app.use(express.static(join(__dirname, '../public')));

// Configuration
const SERVER_ADDRESS = process.env.SERVER_WALLET_ADDRESS || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PORT = process.env.PORT || 3402;

// BUG-01 FIX / BUG-09 FIX: store full requirements keyed by nonce
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

function sendPaymentRequired(res: Response, endpoint: string, amount: string): void {
  const nonce = '0x' + randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const requirement = createPaymentRequirement(endpoint, amount, nonce);
  issuedRequirements.set(nonce, { requirement, expires: expiresAt });
  const response: PaymentRequiredResponse = {
    x402Version: 1,
    accepts: [requirement],
    error: `Payment required for ${endpoint}`,
  };
  res.status(402).json(response);
}

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

function consumeRequirement(nonce: string): PaymentRequirement | null {
  const entry = issuedRequirements.get(nonce);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    issuedRequirements.delete(nonce);
    return null;
  }
  issuedRequirements.delete(nonce);
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
    return sendPaymentRequired(res, '/premium-data', '1000000');
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
        // BUG-11 FIX: flag as demo data
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
        explorer: `https://sepolia.basescan.org/tx/${settlement.txHash}`,
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
    return sendPaymentRequired(res, '/api-call', '100000');
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
        explorer: `https://sepolia.basescan.org/tx/${settlement.txHash}`,
      },
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

// ── Facilitator proxy endpoints ───────────────────────────────────────────────

// BUG-07 FIX: validate request body
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

app.get('/facilitator/supported', async (_req: Request, res: Response) => {
  const result = await facilitator.getSupported();
  res.json(result);
});

// ── Server startup ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     x402 Resource Server - REAL PAYMENTS MODE             ║
╠════════════════════════════════════════════════════════════╣
║  Port:              ${PORT}                                    ║
║  Network:           Base Sepolia (Testnet)                ║
║  Facilitator:       x402.org (REAL TRANSACTIONS)          ║
║  Server Address:    ${SERVER_ADDRESS.slice(0, 20)}...      ║
║  USDC Contract:     ${USDC_BASE_SEPOLIA.slice(0, 20)}...   ║
╠════════════════════════════════════════════════════════════╣
║  WARNING: This will make REAL on-chain transactions!       ║
║  Make sure you have testnet USDC from the faucet.          ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /public           (Free - no payment required)    ║
║    GET  /premium-data     (1.0 USDC)                      ║
║    GET  /api-call         (0.1 USDC)                      ║
║                                                            ║
║  View transactions: https://sepolia.basescan.org/          ║
╚════════════════════════════════════════════════════════════╝
  `);
});

setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of issuedRequirements.entries()) {
    if (data.expires < now) {
      issuedRequirements.delete(nonce);
    }
  }
}, 60_000);
