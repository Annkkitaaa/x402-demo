/**
 * Generate a test wallet for x402 PoC
 */

import { ethers } from 'ethers';

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║           x402 Test Wallet Generator                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('⚠️  WARNING: This wallet is for TESTNET ONLY!');
console.log('   Never use this wallet with real funds!\n');

const wallet = ethers.Wallet.createRandom();

console.log('Generated Wallet:');
console.log('─────────────────────────────────────────────────────────────');
console.log(`Address:     ${wallet.address}`);
console.log(`Private Key: ${wallet.privateKey}`);
console.log('─────────────────────────────────────────────────────────────\n');

console.log('Next Steps:');
console.log('1. Copy the private key above');
console.log('2. Add it to your .env file as PRIVATE_KEY');
console.log('3. Get testnet USDC from Base Sepolia faucet');
console.log('   - Visit: https://faucet.circle.com/');
console.log('   - Select Base Sepolia network');
console.log('   - Enter your wallet address');
console.log('   - Request testnet USDC\n');

console.log('4. You can also get Sepolia ETH for gas (if needed):');
console.log('   - Visit: https://sepoliafaucet.com/\n');
