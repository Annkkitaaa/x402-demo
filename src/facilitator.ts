/**
 * Simplified Facilitator Implementation
 *
 * Bugs fixed:
 *  BUG-02 — TOCTOU race: nonce claimed synchronously before any await
 *  BUG-14 — validAfter never validated: check added
 *  BUG-15 — Math.random() for tx hash: replaced with randomBytes
 *  BUG-06 — silent mainnet fallback in getChainId: now throws on unknown network
 */

import { ethers } from 'ethers';
import { randomBytes } from 'crypto';
import type {
  PaymentPayload,
  PaymentRequirement,
  VerifyResponse,
  SettleResponse,
  SupportedScheme,
  EIP3009Payload,
} from './types.js';

export class SimpleFacilitator {
  private usedNonces: Set<string> = new Set();

  getSupported(): SupportedScheme[] {
    return [{ scheme: 'exact', network: 'base-sepolia' }];
  }

  /**
   * Verify a payment without settling — read-only, does NOT consume the nonce.
   */
  async verify(
    paymentHeader: string,
    paymentRequirements: PaymentRequirement
  ): Promise<VerifyResponse> {
    try {
      const paymentPayloadJson = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      const paymentPayload: PaymentPayload = JSON.parse(paymentPayloadJson);

      if (paymentPayload.x402Version !== 1) {
        return { isValid: false, invalidReason: 'Unsupported x402 version' };
      }
      if (
        paymentPayload.scheme !== paymentRequirements.scheme ||
        paymentPayload.network !== paymentRequirements.network
      ) {
        return { isValid: false, invalidReason: 'Scheme or network mismatch' };
      }
      if (paymentPayload.scheme !== 'exact') {
        return { isValid: false, invalidReason: 'Unsupported payment scheme' };
      }

      const eip3009Payload = paymentPayload.payload as EIP3009Payload;

      // Read-only nonce check — does NOT consume
      if (this.usedNonces.has(eip3009Payload.nonce)) {
        return { isValid: false, invalidReason: 'Nonce already used' };
      }

      return await this.verifyPayload(eip3009Payload, paymentRequirements);
    } catch (error) {
      return {
        isValid: false,
        invalidReason: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Settle a payment (simulated for PoC).
   *
   * BUG-02 FIX — TOCTOU: nonce is claimed synchronously before the first await.
   * In Node.js's single-threaded event loop this guarantees no two concurrent
   * calls can both pass the nonce guard for the same payment.
   */
  async settle(
    paymentHeader: string,
    paymentRequirements: PaymentRequirement
  ): Promise<SettleResponse> {
    // ── Step 1: decode synchronously — zero awaits before nonce claim ─────────
    let paymentPayload: PaymentPayload;
    let eip3009Payload: EIP3009Payload;

    try {
      const json = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      paymentPayload = JSON.parse(json) as PaymentPayload;
      eip3009Payload = paymentPayload.payload as EIP3009Payload;
    } catch (error) {
      return {
        success: false,
        error: `Invalid payment header: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // ── Step 2: atomic nonce claim — synchronous, no await between check/set ──
    if (this.usedNonces.has(eip3009Payload.nonce)) {
      return { success: false, error: 'Nonce already used' };
    }
    this.usedNonces.add(eip3009Payload.nonce); // claimed — TOCTOU prevented

    // ── Step 3: cheap synchronous checks before async signature verification ──
    if (paymentPayload.x402Version !== 1) {
      return { success: false, error: 'Unsupported x402 version' };
    }
    if (
      paymentPayload.scheme !== paymentRequirements.scheme ||
      paymentPayload.network !== paymentRequirements.network
    ) {
      return { success: false, error: 'Scheme or network mismatch' };
    }
    if (paymentPayload.scheme !== 'exact') {
      return { success: false, error: 'Unsupported payment scheme' };
    }

    // ── Step 4: async payload verification (nonce already claimed) ───────────
    try {
      const result = await this.verifyPayload(eip3009Payload, paymentRequirements);
      if (!result.isValid) {
        return { success: false, error: result.invalidReason ?? 'Payment verification failed' };
      }

      // BUG-15 FIX: use cryptographically secure randomBytes, not Math.random()
      const fakeTxHash = '0x' + randomBytes(32).toString('hex');

      console.log(`[Facilitator] Simulated settlement on ${paymentPayload.network}`);
      console.log(`[Facilitator] Transaction hash: ${fakeTxHash}`);
      console.log(`[Facilitator] Amount: ${eip3009Payload.value} (smallest unit)`);
      console.log(`[Facilitator] From: ${eip3009Payload.from}`);
      console.log(`[Facilitator] To: ${eip3009Payload.to}`);

      return { success: true, txHash: fakeTxHash, networkId: paymentPayload.network };
    } catch (error) {
      return {
        success: false,
        error: `Settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate all payment fields except nonce reuse.
   * Shared by verify() and settle() to avoid duplicating logic.
   *
   * BUG-14 FIX: validAfter is now checked.
   */
  private async verifyPayload(
    eip3009Payload: EIP3009Payload,
    requirements: PaymentRequirement
  ): Promise<VerifyResponse> {
    if (eip3009Payload.value !== requirements.maxAmountRequired) {
      return { isValid: false, invalidReason: 'Payment amount mismatch' };
    }

    if (eip3009Payload.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
      return { isValid: false, invalidReason: 'Payment recipient mismatch' };
    }

    const now = Math.floor(Date.now() / 1000);

    // BUG-14 FIX: reject payments whose validity window hasn't opened yet
    if (eip3009Payload.validAfter > now) {
      return {
        isValid: false,
        invalidReason: 'Payment not yet valid (validAfter is in the future)',
      };
    }

    if (eip3009Payload.validBefore < now) {
      return { isValid: false, invalidReason: 'Payment expired' };
    }

    const isValidSignature = await this.verifyEIP3009Signature(eip3009Payload, requirements);
    if (!isValidSignature) {
      return { isValid: false, invalidReason: 'Invalid signature' };
    }

    return { isValid: true, invalidReason: null };
  }

  private async verifyEIP3009Signature(
    payload: EIP3009Payload,
    requirements: PaymentRequirement
  ): Promise<boolean> {
    try {
      const domain = {
        name: requirements.extra?.name || 'USD Coin',
        version: requirements.extra?.version || '2',
        chainId: this.getChainId(requirements.network),
        verifyingContract: requirements.asset,
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
        from: payload.from,
        to: payload.to,
        value: payload.value,
        validAfter: payload.validAfter,
        validBefore: payload.validBefore,
        nonce: payload.nonce,
      };

      const recoveredAddress = ethers.verifyTypedData(domain, types, message, payload.signature);
      return recoveredAddress.toLowerCase() === payload.from.toLowerCase();
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * BUG-06 FIX: throw on unknown networks — no silent mainnet fallback.
   */
  private getChainId(network: string): number {
    const chainIds: Record<string, number> = {
      'base-sepolia': 84532,
      'base': 8453,
      'ethereum': 1,
      'sepolia': 11155111,
    };
    const id = chainIds[network];
    if (id === undefined) {
      throw new Error(
        `Unsupported network: "${network}". Supported: ${Object.keys(chainIds).join(', ')}`
      );
    }
    return id;
  }
}
