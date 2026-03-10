/**
 * Shared test utilities for x402 PoC test suite
 */

import { ethers } from 'ethers';
import type { PaymentPayload, EIP3009Payload, PaymentRequirement } from '../../src/types.js';

// Deterministic test wallet (known private key - TESTNET ONLY)
export const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const TEST_WALLET = new ethers.Wallet(TEST_PRIVATE_KEY);
export const TEST_WALLET_ADDRESS = TEST_WALLET.address;

// Hardhat default account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
// We use the same SERVER_ADDRESS as the server default
export const SERVER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/**
 * Build a valid PaymentRequirement for a given endpoint + amount
 */
export function buildRequirement(
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
    nonce: nonce ?? `0x${'ab'.repeat(32)}`,
    extra: { name: 'USD Coin', version: '2' },
  };
}

/**
 * Create a valid signed EIP-712 payment header
 */
export async function buildPaymentHeader(
  wallet: ethers.Wallet,
  requirement: PaymentRequirement,
  overrides: Partial<EIP3009Payload> = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const eip3009Payload: EIP3009Payload = {
    from: wallet.address,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter: now - 60,
    validBefore: now + requirement.maxTimeoutSeconds,
    nonce: requirement.nonce ?? `0x${'ab'.repeat(32)}`,
    signature: '',
    ...overrides,
  };

  const domain = {
    name: requirement.extra?.name ?? 'USD Coin',
    version: requirement.extra?.version ?? '2',
    chainId: BASE_SEPOLIA_CHAIN_ID,
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

  eip3009Payload.signature = await wallet.signTypedData(domain, types, message);

  const paymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: eip3009Payload,
  };

  return Buffer.from(JSON.stringify(paymentPayload), 'utf-8').toString('base64');
}

/**
 * Build a raw (unsigned / bad-signature) payment header for negative tests
 */
export function buildMalformedPaymentHeader(overrides: Partial<PaymentPayload> = {}): string {
  const base: PaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      from: TEST_WALLET_ADDRESS,
      to: SERVER_ADDRESS,
      value: '100000',
      validAfter: 0,
      validBefore: Math.floor(Date.now() / 1000) + 300,
      nonce: `0x${'ff'.repeat(32)}`,
      signature: '0xdeadbeef', // invalid signature
    },
    ...overrides,
  };
  return Buffer.from(JSON.stringify(base), 'utf-8').toString('base64');
}

/** Sleep helper */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
