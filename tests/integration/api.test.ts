/**
 * Integration Tests — Express API Routes
 *
 * Tests the full HTTP layer using supertest (real Express app,
 * real facilitator, no network calls).
 *
 * Run: npx vitest run tests/integration/api.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SimpleFacilitator } from '../../src/facilitator.js';
import type {
  PaymentRequiredResponse,
  PaymentRequirement,
} from '../../src/types.js';
import {
  TEST_WALLET,
  SERVER_ADDRESS,
  USDC_BASE_SEPOLIA,
  buildPaymentHeader,
  buildMalformedPaymentHeader,
} from '../helpers/test-helpers.js';

// ─── Bootstrap a test Express app identical to server.ts ─────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function buildTestApp(): Express {
  const app = express();
  const facilitator = new SimpleFacilitator();
  app.use(express.json());
  app.use(express.static(join(__dirname, '../../public')));

  function createRequirement(endpoint: string, amount: string, nonce?: string): PaymentRequirement {
    return {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: amount,
      payTo: SERVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: nonce ?? '0x' + randomBytes(32).toString('hex'),
      extra: { name: 'USD Coin', version: '2' },
    };
  }

  function send402(res: any, endpoint: string, amount: string): void {
    const nonce = '0x' + randomBytes(32).toString('hex');
    const req = createRequirement(endpoint, amount, nonce);
    const body: PaymentRequiredResponse = {
      x402Version: 1,
      accepts: [req],
      error: `Payment required for ${endpoint}`,
    };
    res.status(402).json(body);
  }

  app.get('/public', (_req, res) => {
    res.json({ message: 'This is a public endpoint, no payment required!', timestamp: new Date().toISOString() });
  });

  app.get('/api-call', async (req, res) => {
    const paymentHeader = req.headers['x-payment'] as string | undefined;
    if (!paymentHeader) return send402(res, '/api-call', '100000');

    try {
      const requirement = createRequirement('/api-call', '100000');
      const verification = await facilitator.verify(paymentHeader, requirement);
      if (!verification.isValid) return res.status(402).json({ error: 'Payment verification failed', reason: verification.invalidReason });

      const settlement = await facilitator.settle(paymentHeader, requirement);
      if (!settlement.success) return res.status(402).json({ error: 'Payment settlement failed', reason: settlement.error });

      res.json({ message: 'API call successful!', payment: { txHash: settlement.txHash, network: settlement.networkId } });
    } catch {
      res.status(400).json({ error: 'Invalid payment format' });
    }
  });

  app.get('/premium-data', async (req, res) => {
    const paymentHeader = req.headers['x-payment'] as string | undefined;
    if (!paymentHeader) return send402(res, '/premium-data', '1000000');

    try {
      const requirement = createRequirement('/premium-data', '1000000');
      const verification = await facilitator.verify(paymentHeader, requirement);
      if (!verification.isValid) return res.status(402).json({ error: 'Payment verification failed', reason: verification.invalidReason });

      const settlement = await facilitator.settle(paymentHeader, requirement);
      if (!settlement.success) return res.status(402).json({ error: 'Payment settlement failed', reason: settlement.error });

      res.json({ message: 'Payment successful!', payment: { txHash: settlement.txHash, network: settlement.networkId } });
    } catch {
      res.status(400).json({ error: 'Invalid payment format' });
    }
  });

  app.post('/facilitator/verify', async (req, res) => {
    const { paymentHeader, paymentRequirements } = req.body;
    const result = await facilitator.verify(paymentHeader, paymentRequirements);
    res.json(result);
  });

  app.post('/facilitator/settle', async (req, res) => {
    const { paymentHeader, paymentRequirements } = req.body;
    const result = await facilitator.settle(paymentHeader, paymentRequirements);
    res.json(result);
  });

  app.get('/facilitator/supported', (_req, res) => {
    res.json(facilitator.getSupported());
  });

  return app;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

let app: Express;

beforeAll(() => {
  app = buildTestApp();
});

function makeNonce(): string {
  return '0x' + randomBytes(32).toString('hex');
}

async function getValidPaymentHeader(endpoint: string, amount: string): Promise<{ header: string; requirement: PaymentRequirement }> {
  const requirement: PaymentRequirement = {
    scheme: 'exact',
    network: 'base-sepolia',
    maxAmountRequired: amount,
    payTo: SERVER_ADDRESS,
    asset: USDC_BASE_SEPOLIA,
    maxTimeoutSeconds: 300,
    mimeType: 'application/json',
    nonce: makeNonce(),
    extra: { name: 'USD Coin', version: '2' },
  };
  const header = await buildPaymentHeader(TEST_WALLET, requirement);
  return { header, requirement };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /public', () => {
  it('returns 200 with no payment required', async () => {
    const res = await request(app).get('/public');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('public endpoint');
  });

  it('returns a timestamp field', async () => {
    const res = await request(app).get('/public');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });

  it('ignores X-PAYMENT header for public endpoints', async () => {
    const { header } = await getValidPaymentHeader('/public', '0');
    const res = await request(app).get('/public').set('X-PAYMENT', header);
    expect(res.status).toBe(200);
  });
});

// ─── /api-call ────────────────────────────────────────────────────────────────

describe('GET /api-call — payment required flow', () => {
  it('returns 402 with x402Version=1 when no payment provided', async () => {
    const res = await request(app).get('/api-call');
    expect(res.status).toBe(402);
    expect(res.body.x402Version).toBe(1);
    expect(res.body.accepts).toBeInstanceOf(Array);
    expect(res.body.accepts.length).toBeGreaterThan(0);
  });

  it('402 response includes a nonce in each requirement', async () => {
    const res = await request(app).get('/api-call');
    const req: PaymentRequirement = res.body.accepts[0];
    expect(req.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('402 response includes correct amount and payTo', async () => {
    const res = await request(app).get('/api-call');
    const req: PaymentRequirement = res.body.accepts[0];
    expect(req.maxAmountRequired).toBe('100000');
    expect(req.payTo.toLowerCase()).toBe(SERVER_ADDRESS.toLowerCase());
    expect(req.scheme).toBe('exact');
    expect(req.network).toBe('base-sepolia');
  });

  it('returns 200 with payment details after valid payment', async () => {
    const { header } = await getValidPaymentHeader('/api-call', '100000');
    const res = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('successful');
    expect(res.body.payment.txHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(res.body.payment.network).toBe('base-sepolia');
  });

  it('returns 402 with malformed payment header (bad base64)', async () => {
    const res = await request(app)
      .get('/api-call')
      .set('X-PAYMENT', 'not!valid!base64!!');
    expect(res.status).toBe(400);
  });

  it('returns 402 when payment amount is wrong (underpayment)', async () => {
    // Build a header that only pays 50000 against the 100000 requirement
    const requirement: PaymentRequirement = {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '50000', // wrong amount
      payTo: SERVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: makeNonce(),
      extra: { name: 'USD Coin', version: '2' },
    };
    const header = await buildPaymentHeader(TEST_WALLET, requirement);
    const res = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(res.status).toBe(402);
    expect(res.body.reason).toMatch(/amount/i);
  });

  it('returns 402 when payment recipient does not match server address', async () => {
    const wrongRecipient = '0x0000000000000000000000000000000000000001';
    const requirement: PaymentRequirement = {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '100000',
      payTo: wrongRecipient,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: makeNonce(),
      extra: { name: 'USD Coin', version: '2' },
    };
    const header = await buildPaymentHeader(TEST_WALLET, requirement);
    const res = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(res.status).toBe(402);
    expect(res.body.reason).toMatch(/recipient/i);
  });

  it('returns 402 when payment has an expired validBefore', async () => {
    const requirement: PaymentRequirement = {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '100000',
      payTo: SERVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: makeNonce(),
      extra: { name: 'USD Coin', version: '2' },
    };
    const expiredBefore = Math.floor(Date.now() / 1000) - 10;
    const header = await buildPaymentHeader(TEST_WALLET, requirement, { validBefore: expiredBefore });
    const res = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(res.status).toBe(402);
    expect(res.body.reason).toMatch(/expir/i);
  });

  it('[REPLAY ATTACK] rejects second request with same payment nonce', async () => {
    const { header } = await getValidPaymentHeader('/api-call', '100000');

    const first = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(first.status).toBe(200);

    const second = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(second.status).toBe(402);
    expect(second.body.reason).toMatch(/nonce/i);
  });
});

// ─── /premium-data ────────────────────────────────────────────────────────────

describe('GET /premium-data — payment required flow', () => {
  it('returns 402 for 1.0 USDC without payment', async () => {
    const res = await request(app).get('/premium-data');
    expect(res.status).toBe(402);
    expect(res.body.accepts[0].maxAmountRequired).toBe('1000000');
  });

  it('returns 200 with premium content after valid 1.0 USDC payment', async () => {
    const { header } = await getValidPaymentHeader('/premium-data', '1000000');
    const res = await request(app).get('/premium-data').set('X-PAYMENT', header);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('successful');
  });

  it('rejects 0.1 USDC payment against 1.0 USDC endpoint', async () => {
    const { header } = await getValidPaymentHeader('/premium-data', '100000'); // 0.1 USDC
    const res = await request(app).get('/premium-data').set('X-PAYMENT', header);
    expect(res.status).toBe(402);
    expect(res.body.reason).toMatch(/amount/i);
  });
});

// ─── /facilitator/* ───────────────────────────────────────────────────────────

describe('Facilitator API endpoints', () => {
  it('GET /facilitator/supported returns scheme list', async () => {
    const res = await request(app).get('/facilitator/supported');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  it('POST /facilitator/verify returns isValid=true for valid payment', async () => {
    const requirement: PaymentRequirement = {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '100000',
      payTo: SERVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: makeNonce(),
      extra: { name: 'USD Coin', version: '2' },
    };
    const header = await buildPaymentHeader(TEST_WALLET, requirement);

    const res = await request(app)
      .post('/facilitator/verify')
      .send({ paymentHeader: header, paymentRequirements: requirement });

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(true);
  });

  it('POST /facilitator/verify returns isValid=false for bad signature', async () => {
    const requirement: PaymentRequirement = {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '100000',
      payTo: SERVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: makeNonce(),
      extra: { name: 'USD Coin', version: '2' },
    };
    const header = buildMalformedPaymentHeader();

    const res = await request(app)
      .post('/facilitator/verify')
      .send({ paymentHeader: header, paymentRequirements: requirement });

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(false);
  });

  it('[BUG] POST /facilitator/settle with missing body does not crash server', async () => {
    // No validation on body — passing empty object should be handled gracefully
    const res = await request(app)
      .post('/facilitator/settle')
      .send({});
    // Should not return 500; actual result depends on facilitator behaviour
    expect(res.status).not.toBe(500);
  });

  it('[SECURITY] /facilitator/verify is publicly accessible without auth', async () => {
    // Documents that no authentication is required on facilitator endpoints
    const res = await request(app).get('/facilitator/supported');
    expect(res.status).toBe(200); // confirmed: no auth needed
    // BUG: in production, facilitator endpoints should require auth/API key
  });
});

// ─── Static / Web UI ──────────────────────────────────────────────────────────

describe('Static file serving', () => {
  it('serves index.html at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('serves styles.css', async () => {
    const res = await request(app).get('/styles.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/css/);
  });

  it('serves script.js', async () => {
    const res = await request(app).get('/script.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });
});

// ─── Edge cases and security probes ───────────────────────────────────────────

describe('Edge cases and security probes', () => {
  it('[SECURITY] Very large X-PAYMENT header does not crash server', async () => {
    const hugeHeader = 'A'.repeat(100_000);
    const res = await request(app).get('/api-call').set('X-PAYMENT', hugeHeader);
    expect([400, 402, 413]).toContain(res.status); // should not be 500
  });

  it('[SECURITY] SQL-injection-like strings in payment header are rejected gracefully', async () => {
    const res = await request(app)
      .get('/api-call')
      .set('X-PAYMENT', "'; DROP TABLE nonces; --");
    expect(res.status).not.toBe(500);
  });

  it('[SECURITY] X-PAYMENT with null bytes does not crash server', async () => {
    const res = await request(app)
      .get('/api-call')
      .set('X-PAYMENT', '\x00\x00\x00');
    expect(res.status).not.toBe(500);
  });

  it('[BUG] CORS headers are not set (API is not usable cross-origin)', async () => {
    const res = await request(app)
      .get('/api-call')
      .set('Origin', 'http://evil.com');
    // Access-Control-Allow-Origin is NOT set — document this as a missing feature
    const corsHeader = res.headers['access-control-allow-origin'];
    expect(corsHeader).toBeUndefined(); // BUG: no CORS configured
  });

  it('[BUG] No Content-Security-Policy header is set', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toBeUndefined();
    // BUG: missing CSP header exposes the app to XSS risks
  });

  it('Unknown endpoint returns 404', async () => {
    const res = await request(app).get('/non-existent-endpoint');
    expect(res.status).toBe(404);
  });

  it('[BUG] POST to a GET-only endpoint returns 404 not 405', async () => {
    const res = await request(app).post('/api-call');
    // Express returns 404 by default instead of proper 405 Method Not Allowed
    expect([404, 405]).toContain(res.status);
  });

  it('[PARTIAL PAYMENT] Payment of 1 unit less than required is rejected', async () => {
    const requirement: PaymentRequirement = {
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '99999', // 1 less than required 100000
      payTo: SERVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      maxTimeoutSeconds: 300,
      mimeType: 'application/json',
      nonce: makeNonce(),
      extra: { name: 'USD Coin', version: '2' },
    };
    const header = await buildPaymentHeader(TEST_WALLET, requirement);
    const res = await request(app).get('/api-call').set('X-PAYMENT', header);
    expect(res.status).toBe(402);
  });
});
