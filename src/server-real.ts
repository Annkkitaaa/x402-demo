/**
 * x402 Resource Server with REAL Facilitator
 * This version uses the x402.org facilitator for actual on-chain transactions
 */

import express, { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { PaymentRequiredResponse, PaymentRequirement, PaymentPayload } from './types.js';
import { RealFacilitator } from './real-facilitator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const facilitator = new RealFacilitator();

// Middleware
app.use(express.json());

// Serve static files from public directory
app.use(express.static(join(__dirname, '../public')));

// Configuration
const SERVER_ADDRESS = process.env.SERVER_WALLET_ADDRESS || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia
const PORT = process.env.PORT || 3402;

// Store nonces to prevent replay attacks
const issuedNonces = new Map<string, { expires: number; used: boolean }>();

/**
 * Public endpoint - no payment required
 */
app.get('/public', (req: Request, res: Response) => {
  res.json({
    message: 'This is a public endpoint, no payment required!',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Protected endpoint - requires x402 payment
 */
app.get('/premium-data', async (req: Request, res: Response) => {
  const paymentHeader = req.headers['x-payment'] as string | undefined;

  // If no payment header is provided, return 402 Payment Required
  if (!paymentHeader) {
    return sendPaymentRequired(res, '/premium-data', '1000000'); // 1 USDC (6 decimals)
  }

  // Verify and settle the payment
  try {
    const paymentPayloadJson = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    const paymentPayload: PaymentPayload = JSON.parse(paymentPayloadJson);

    // Get the payment requirement (reconstruct from the nonce or store it)
    const requirement = createPaymentRequirement('/premium-data', '1000000');

    // Verify the payment
    const verification = await facilitator.verify(paymentHeader, requirement);

    if (!verification.isValid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        reason: verification.invalidReason,
      });
    }

    // Settle the payment ON-CHAIN
    const settlement = await facilitator.settle(paymentHeader, requirement);

    if (!settlement.success) {
      return res.status(402).json({
        error: 'Payment settlement failed',
        reason: settlement.error,
      });
    }

    // Payment successful - return the protected resource
    res.json({
      message: 'Payment successful! Here is your premium data.',
      data: {
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
    return res.status(400).json({
      error: 'Invalid payment format',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Another protected endpoint with different pricing
 */
app.get('/api-call', async (req: Request, res: Response) => {
  const paymentHeader = req.headers['x-payment'] as string | undefined;

  if (!paymentHeader) {
    return sendPaymentRequired(res, '/api-call', '100000'); // 0.1 USDC
  }

  try {
    const requirement = createPaymentRequirement('/api-call', '100000');
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
    return res.status(400).json({
      error: 'Invalid payment format',
    });
  }
});

/**
 * Facilitator endpoints (proxying to real facilitator)
 */
app.post('/facilitator/verify', async (req: Request, res: Response) => {
  const { paymentHeader, paymentRequirements } = req.body;
  const result = await facilitator.verify(paymentHeader, paymentRequirements);
  res.json(result);
});

app.post('/facilitator/settle', async (req: Request, res: Response) => {
  const { paymentHeader, paymentRequirements } = req.body;
  const result = await facilitator.settle(paymentHeader, paymentRequirements);
  res.json(result);
});

app.get('/facilitator/supported', async (req: Request, res: Response) => {
  const result = await facilitator.getSupported();
  res.json(result);
});

/**
 * Helper: Send 402 Payment Required response
 */
function sendPaymentRequired(res: Response, endpoint: string, amount: string): void {
  const nonce = '0x' + randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  issuedNonces.set(nonce, { expires: expiresAt, used: false });

  const requirement = createPaymentRequirement(endpoint, amount, nonce);

  const response: PaymentRequiredResponse = {
    x402Version: 1,
    accepts: [requirement],
    error: `Payment required for ${endpoint}`,
  };

  res.status(402).json(response);
}

/**
 * Helper: Create payment requirement object
 */
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
    extra: {
      name: 'USD Coin',
      version: '2',
    },
  };
}

// Start server
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
║  ⚠️  WARNING: This will make REAL on-chain transactions!  ║
║     Make sure you have testnet USDC from the faucet.      ║
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
╠════════════════════════════════════════════════════════════╣
║  View transactions:                                        ║
║  https://sepolia.basescan.org/                             ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Cleanup expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of issuedNonces.entries()) {
    if (data.expires < now) {
      issuedNonces.delete(nonce);
    }
  }
}, 60000); // Every minute
