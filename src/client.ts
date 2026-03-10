/**
 * x402 CLI Client
 * Demonstrates the full payment workflow for accessing paid resources
 */

import { ethers } from 'ethers';
import { program } from 'commander';
import { randomBytes } from 'crypto';
import type { PaymentRequiredResponse, PaymentPayload, EIP3009Payload } from './types.js';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3402';

interface RequestOptions {
  endpoint: string;
  privateKey: string;
  verbose?: boolean;
}

/**
 * Main function to make a request with x402 payment
 */
async function makeX402Request(options: RequestOptions): Promise<void> {
  const { endpoint, privateKey, verbose = false } = options;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              x402 Payment Flow - Starting                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize wallet
    const wallet = new ethers.Wallet(privateKey);
    console.log(`[1/5] Wallet initialized`);
    console.log(`      Address: ${wallet.address}\n`);

    // Step 1: Make initial request without payment
    console.log(`[2/5] Making initial request to ${endpoint}`);
    const initialResponse = await fetch(`${SERVER_URL}${endpoint}`);

    if (initialResponse.status !== 402) {
      // No payment required or different error
      const data = await initialResponse.json();
      console.log(`\n✓ Response received (no payment required):`);
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(`      Status: 402 Payment Required ✓\n`);

    // Step 2: Parse payment requirements
    const paymentRequired = await initialResponse.json() as PaymentRequiredResponse;

    if (verbose) {
      console.log('      Payment Requirements:');
      console.log(JSON.stringify(paymentRequired, null, 2));
      console.log('');
    }

    if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
      throw new Error('No payment options available');
    }

    // Select first payment option
    const requirement = paymentRequired.accepts[0];
    console.log(`[3/5] Payment requirement received:`);
    console.log(`      Scheme: ${requirement.scheme}`);
    console.log(`      Network: ${requirement.network}`);
    console.log(`      Amount: ${formatAmount(requirement.maxAmountRequired)} USDC`);
    console.log(`      Recipient: ${requirement.payTo}`);
    console.log(`      Timeout: ${requirement.maxTimeoutSeconds}s\n`);

    // Step 3: Create payment
    console.log(`[4/5] Creating payment authorization...`);
    const paymentHeader = await createPayment(wallet, requirement);

    if (verbose) {
      console.log(`      Payment Header: ${paymentHeader.substring(0, 50)}...`);
      console.log('');
    }

    // Step 4: Make request with payment
    console.log(`[5/5] Submitting request with payment...\n`);
    const paidResponse = await fetch(`${SERVER_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'X-PAYMENT': paymentHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!paidResponse.ok) {
      const errorData = await paidResponse.json();
      throw new Error(`Payment failed: ${JSON.stringify(errorData)}`);
    }

    // Success!
    const responseData = await paidResponse.json() as any;

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              ✓ Payment Successful!                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('Response Data:');
    console.log(JSON.stringify(responseData, null, 2));
    console.log('');

    if (responseData.payment) {
      console.log('Payment Details:');
      console.log(`  Transaction: ${responseData.payment.txHash}`);
      console.log(`  Network: ${responseData.payment.network}`);
      console.log('');
    }

  } catch (error) {
    console.error('\n✗ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Create a payment using EIP-3009 (transferWithAuthorization)
 */
async function createPayment(
  wallet: ethers.Wallet,
  requirement: any
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Create EIP-3009 payload
  const eip3009Payload: EIP3009Payload = {
    from: wallet.address,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter: now - 60, // Valid from 1 minute ago
    validBefore: now + requirement.maxTimeoutSeconds,
    nonce: requirement.nonce || `0x${randomBytes(32).toString('hex')}`,
    signature: '', // Will be filled after signing
  };

  // Create EIP-712 domain
  const domain = {
    name: requirement.extra?.name || 'USD Coin',
    version: requirement.extra?.version || '2',
    chainId: getChainId(requirement.network),
    verifyingContract: requirement.asset,
  };

  // Define EIP-3009 types
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

  // Create message
  const message = {
    from: eip3009Payload.from,
    to: eip3009Payload.to,
    value: eip3009Payload.value,
    validAfter: eip3009Payload.validAfter,
    validBefore: eip3009Payload.validBefore,
    nonce: eip3009Payload.nonce,
  };

  // Sign the message
  const signature = await wallet.signTypedData(domain, types, message);
  eip3009Payload.signature = signature;

  // Create payment payload
  const paymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: eip3009Payload,
  };

  // Encode as base64
  const paymentJson = JSON.stringify(paymentPayload);
  const paymentHeader = Buffer.from(paymentJson, 'utf-8').toString('base64');

  return paymentHeader;
}

/**
 * Get chain ID for a network.
 * BUG-06 FIX: throw on unknown networks instead of silently defaulting to
 * Ethereum mainnet (chain ID 1), which could cause signatures for the wrong chain.
 */
function getChainId(network: string): number {
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

/**
 * Format amount from smallest unit to human-readable
 */
function formatAmount(amount: string): string {
  const decimals = 6; // USDC has 6 decimals
  const value = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  return `${integerPart}.${fractionalPart.toString().padStart(decimals, '0')}`;
}

/**
 * Test the public endpoint (no payment required)
 */
async function testPublicEndpoint(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          Testing Public Endpoint (No Payment)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const response = await fetch(`${SERVER_URL}/public`);
    const data = await response.json();

    console.log('✓ Public endpoint accessed successfully:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
  } catch (error) {
    console.error('✗ Error:', error instanceof Error ? error.message : error);
  }
}

/**
 * CLI Interface
 */
program
  .name('x402-client')
  .description('CLI client for x402 payment protocol')
  .version('1.0.0');

program
  .command('request')
  .description('Make a paid request to a protected endpoint')
  .requiredOption('-e, --endpoint <endpoint>', 'API endpoint to access (e.g., /premium-data)')
  .requiredOption('-k, --key <privateKey>', 'Private key of the wallet')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    await makeX402Request({
      endpoint: options.endpoint,
      privateKey: options.key,
      verbose: options.verbose,
    });
  });

program
  .command('test-public')
  .description('Test the public endpoint (no payment required)')
  .action(async () => {
    await testPublicEndpoint();
  });

program
  .command('info')
  .description('Show information about available endpoints')
  .action(() => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              Available Endpoints                          ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  /public           FREE - No payment required             ║');
    console.log('║  /premium-data     1.0 USDC - Premium market data         ║');
    console.log('║  /api-call         0.1 USDC - Generic API call            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  });

// Parse CLI arguments
program.parse();
