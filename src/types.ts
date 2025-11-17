/**
 * x402 Protocol Type Definitions
 * Based on: https://github.com/coinbase/x402
 */

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  mimeType: string;
  nonce?: string;
  extra?: {
    name: string;
    version: string;
  };
}

export interface PaymentRequiredResponse {
  x402Version: number;
  accepts: PaymentRequirement[];
  error?: string;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown;
}

export interface EIP3009Payload {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
}

export interface VerifyRequest {
  x402Version: number;
  paymentHeader: string;
  paymentRequirements: PaymentRequirement;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason: string | null;
}

export interface SettleRequest {
  x402Version: number;
  paymentHeader: string;
  paymentRequirements: PaymentRequirement;
}

export interface SettleResponse {
  success: boolean;
  error?: string;
  txHash?: string;
  networkId?: string;
}

export interface SupportedScheme {
  scheme: string;
  network: string;
}
