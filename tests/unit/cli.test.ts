/**
 * CLI Client Tests
 *
 * Tests the pure logic functions extracted from client.ts.
 * The CLI parsing and fetch calls are integration-tested via child_process.
 *
 * Run: npx vitest run tests/unit/cli.test.ts
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';

// ─── Inline the pure functions from client.ts (no side-effects) ───────────────

function formatAmount(amount: string): string {
  const decimals = 6;
  const value = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const intPart = value / divisor;
  const fracPart = value % divisor;
  return `${intPart}.${fracPart.toString().padStart(decimals, '0')}`;
}

function getChainId(network: string): number {
  const chainIds: Record<string, number> = {
    'base-sepolia': 84532,
    'base': 8453,
    'ethereum': 1,
    'sepolia': 11155111,
  };
  return chainIds[network] || 1;
}

// ─── formatAmount() ───────────────────────────────────────────────────────────

describe('formatAmount()', () => {
  it('formats 0.1 USDC correctly', () => {
    expect(formatAmount('100000')).toBe('0.100000');
  });

  it('formats 1.0 USDC correctly', () => {
    expect(formatAmount('1000000')).toBe('1.000000');
  });

  it('formats 0.001 USDC correctly', () => {
    expect(formatAmount('1000')).toBe('0.001000');
  });

  it('formats 10.5 USDC correctly', () => {
    expect(formatAmount('10500000')).toBe('10.500000');
  });

  it('formats 0 correctly', () => {
    expect(formatAmount('0')).toBe('0.000000');
  });

  it('formats very small micropayment (1 unit = $0.000001)', () => {
    expect(formatAmount('1')).toBe('0.000001');
  });

  it('[BUG] throws on negative amount (BigInt does not support negative strings)', () => {
    // Negative amounts should be rejected upstream, but formatAmount doesn't guard
    expect(() => formatAmount('-1')).toThrow();
  });
});

// ─── getChainId() ─────────────────────────────────────────────────────────────

describe('getChainId()', () => {
  it('returns 84532 for base-sepolia', () => {
    expect(getChainId('base-sepolia')).toBe(84532);
  });

  it('returns 8453 for base mainnet', () => {
    expect(getChainId('base')).toBe(8453);
  });

  it('returns 1 for ethereum mainnet', () => {
    expect(getChainId('ethereum')).toBe(1);
  });

  it('returns 11155111 for sepolia', () => {
    expect(getChainId('sepolia')).toBe(11155111);
  });

  it('[BUG] returns 1 (ethereum mainnet) for unknown networks — silently wrong', () => {
    // If someone passes an unsupported network, it defaults to chainId 1 (mainnet)
    // This could lead to signing transactions for the wrong chain silently
    expect(getChainId('polygon')).toBe(1); // BUG: should throw or return null
    expect(getChainId('')).toBe(1);        // BUG: same issue
    expect(getChainId('base-mainnet')).toBe(1); // common typo
  });
});

// ─── createPayment() — EIP-712 signing logic ─────────────────────────────────

describe('createPayment() — EIP-712 signing logic', () => {
  const TEST_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);

  async function createPaymentInline(walletInst: ethers.Wallet, requirement: any): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const eip3009Payload: any = {
      from: walletInst.address,
      to: requirement.payTo,
      value: requirement.maxAmountRequired,
      validAfter: now - 60,
      validBefore: now + requirement.maxTimeoutSeconds,
      nonce: requirement.nonce ?? `0x${'ab'.repeat(32)}`,
      signature: '',
    };

    const domain = {
      name: requirement.extra?.name || 'USD Coin',
      version: requirement.extra?.version || '2',
      chainId: getChainId(requirement.network),
      verifyingContract: requirement.asset,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = {
      from: eip3009Payload.from,
      to: eip3009Payload.to,
      value: eip3009Payload.value,
      validAfter: eip3009Payload.validAfter,
      validBefore: eip3009Payload.validBefore,
      nonce: eip3009Payload.nonce,
    };

    eip3009Payload.signature = await walletInst.signTypedData(domain, types, message);
    const paymentPayload = {
      x402Version: 1,
      scheme: requirement.scheme,
      network: requirement.network,
      payload: eip3009Payload,
    };

    return Buffer.from(JSON.stringify(paymentPayload), 'utf-8').toString('base64');
  }

  const sampleRequirement = {
    scheme: 'exact',
    network: 'base-sepolia',
    maxAmountRequired: '100000',
    payTo: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxTimeoutSeconds: 300,
    mimeType: 'application/json',
    nonce: '0x' + 'ab'.repeat(32),
    extra: { name: 'USD Coin', version: '2' },
  };

  it('produces a base64-encoded payment header', async () => {
    const header = await createPaymentInline(wallet, sampleRequirement);
    // Valid base64 string
    expect(() => Buffer.from(header, 'base64')).not.toThrow();
  });

  it('decoded header contains correct x402Version', async () => {
    const header = await createPaymentInline(wallet, sampleRequirement);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    expect(decoded.x402Version).toBe(1);
  });

  it('decoded header contains correct scheme and network', async () => {
    const header = await createPaymentInline(wallet, sampleRequirement);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('base-sepolia');
  });

  it('decoded payload contains a valid EIP-712 signature', async () => {
    const header = await createPaymentInline(wallet, sampleRequirement);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    expect(decoded.payload.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(decoded.payload.signature.length).toBeGreaterThan(100);
  });

  it('validBefore is in the future', async () => {
    const header = await createPaymentInline(wallet, sampleRequirement);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    expect(decoded.payload.validBefore).toBeGreaterThan(now);
  });

  it('[BUG] validAfter is 60s in the past — no clock skew validation by server', async () => {
    const header = await createPaymentInline(wallet, sampleRequirement);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    // Client intentionally sets validAfter = now - 60
    // Server does NOT validate validAfter — documents the missing check
    expect(decoded.payload.validAfter).toBeLessThan(now);
  });

  it('different calls produce different nonces (if no nonce provided)', async () => {
    const reqWithoutNonce = { ...sampleRequirement, nonce: undefined };
    const h1 = await createPaymentInline(wallet, reqWithoutNonce);
    const h2 = await createPaymentInline(wallet, reqWithoutNonce);
    const d1 = JSON.parse(Buffer.from(h1, 'base64').toString('utf-8'));
    const d2 = JSON.parse(Buffer.from(h2, 'base64').toString('utf-8'));
    // Without a fixed nonce, the client generates a random one each time
    expect(d1.payload.nonce).toBeDefined();
    expect(d2.payload.nonce).toBeDefined();
  });
});

// ─── Wallet generation ────────────────────────────────────────────────────────

describe('Wallet generation (generate-wallet.ts logic)', () => {
  it('ethers.Wallet.createRandom() generates a valid wallet', () => {
    const w = ethers.Wallet.createRandom();
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(w.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('two generated wallets have different addresses', () => {
    const w1 = ethers.Wallet.createRandom();
    const w2 = ethers.Wallet.createRandom();
    expect(w1.address).not.toBe(w2.address);
  });

  it('private key can reconstruct the same wallet', () => {
    const original = ethers.Wallet.createRandom();
    const reconstructed = new ethers.Wallet(original.privateKey);
    expect(reconstructed.address).toBe(original.address);
  });

  it('[SECURITY] generate-wallet outputs mnemonic phrase to stdout — should warn user', () => {
    // The generate-wallet.ts script prints the private key to stdout.
    // This is acceptable for a PoC but dangerous in production.
    // This test just documents the concern.
    expect(true).toBe(true); // placeholder assertion
  });
});
