/**
 * Real Facilitator Client for x402.org
 * Submits actual transactions to Base Sepolia testnet
 */

import type {
  PaymentRequirement,
  VerifyResponse,
  SettleResponse,
  SupportedScheme,
} from './types.js';

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';

export class RealFacilitator {
  /**
   * Get supported payment schemes from the real facilitator
   */
  async getSupported(): Promise<SupportedScheme[]> {
    try {
      const response = await fetch(`${FACILITATOR_URL}/supported`);

      if (!response.ok) {
        throw new Error(`Facilitator error: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching supported schemes:', error);
      throw error;
    }
  }

  /**
   * Verify a payment with the real facilitator
   */
  async verify(
    paymentHeader: string,
    paymentRequirements: PaymentRequirement
  ): Promise<VerifyResponse> {
    try {
      const request = {
        x402Version: 1,
        paymentHeader,
        paymentRequirements,
      };

      console.log(`[RealFacilitator] Verifying payment...`);

      const response = await fetch(`${FACILITATOR_URL}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[RealFacilitator] Verification failed: ${errorText}`);
        return {
          isValid: false,
          invalidReason: `Facilitator error: ${errorText}`,
        };
      }

      const result = await response.json();
      console.log(`[RealFacilitator] Verification result:`, result);

      return result;
    } catch (error) {
      console.error('[RealFacilitator] Verification error:', error);
      return {
        isValid: false,
        invalidReason: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Settle a payment on-chain via the real facilitator
   * This will submit an actual transaction to Base Sepolia
   */
  async settle(
    paymentHeader: string,
    paymentRequirements: PaymentRequirement
  ): Promise<SettleResponse> {
    try {
      const request = {
        x402Version: 1,
        paymentHeader,
        paymentRequirements,
      };

      console.log(`[RealFacilitator] Settling payment on-chain...`);
      console.log(`[RealFacilitator] Amount: ${paymentRequirements.maxAmountRequired} (smallest unit)`);
      console.log(`[RealFacilitator] Network: ${paymentRequirements.network}`);

      const response = await fetch(`${FACILITATOR_URL}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[RealFacilitator] Settlement failed: ${errorText}`);
        return {
          success: false,
          error: `Settlement failed: ${errorText}`,
        };
      }

      const result = await response.json();

      if (result.success) {
        console.log(`[RealFacilitator] ✓ Payment settled successfully!`);
        console.log(`[RealFacilitator] Transaction hash: ${result.txHash}`);
        console.log(`[RealFacilitator] Network: ${result.networkId}`);
        console.log(`[RealFacilitator] View on explorer: https://sepolia.basescan.org/tx/${result.txHash}`);
      } else {
        console.error(`[RealFacilitator] Settlement failed:`, result.error);
      }

      return result;
    } catch (error) {
      console.error('[RealFacilitator] Settlement error:', error);
      return {
        success: false,
        error: `Settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
