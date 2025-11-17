# Real Payments Guide - Using x402 on Base Sepolia Testnet

This guide shows you how to upgrade from simulated payments to real on-chain transactions using the x402.org testnet facilitator.

## Step 1: Get Testnet USDC

### 1.1 Get Your Wallet Address

You already have a test wallet generated. Use this address:
```
0xE72cfe63536FD14db2C2049a29ca22d10919019C
```

Or generate a new one:
```bash
npm run generate-wallet
```

### 1.2 Get Base Sepolia ETH (for gas)

Although x402 uses gasless transfers, you might need some ETH for other operations:

1. Visit https://www.alchemy.com/faucets/base-sepolia
2. Or https://docs.base.org/docs/tools/network-faucets
3. Enter your wallet address
4. Request testnet ETH

### 1.3 Get Testnet USDC

1. **Visit Circle's Testnet Faucet**: https://faucet.circle.com/

2. **Select Network**: Choose **"Base Sepolia"** from the dropdown

3. **Enter Wallet Address**: Paste your wallet address
   ```
   0xE72cfe63536FD14db2C2049a29ca22d10919019C
   ```

4. **Request Tokens**: Click "Get Test Tokens"

5. **Wait**: You'll receive 10 testnet USDC within 30-60 seconds

6. **Verify**: Check your balance on Base Sepolia explorer
   - https://sepolia.basescan.org/address/YOUR_ADDRESS
   - Look for USDC token balance

---

## Step 2: Update Code to Use Real Facilitator

The x402.org provides a **free testnet facilitator** at:
```
https://x402.org/facilitator
```

This facilitator will actually submit transactions to Base Sepolia blockchain.

### 2.1 Create Real Facilitator Client

Create a new file for the real facilitator:

**src/real-facilitator.ts**
```typescript
/**
 * Real Facilitator Client for x402.org
 * Submits actual transactions to Base Sepolia testnet
 */

import type {
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
  SupportedScheme,
} from './types.js';

const FACILITATOR_URL = 'https://x402.org/facilitator';

export class RealFacilitator {
  /**
   * Get supported payment schemes from the real facilitator
   */
  async getSupported(): Promise<SupportedScheme[]> {
    const response = await fetch(`${FACILITATOR_URL}/supported`);

    if (!response.ok) {
      throw new Error(`Facilitator error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Verify a payment with the real facilitator
   */
  async verify(
    paymentHeader: string,
    paymentRequirements: any
  ): Promise<VerifyResponse> {
    const request: VerifyRequest = {
      x402Version: 1,
      paymentHeader,
      paymentRequirements,
    };

    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Verification failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Settle a payment on-chain via the real facilitator
   * This will submit an actual transaction to Base Sepolia
   */
  async settle(
    paymentHeader: string,
    paymentRequirements: any
  ): Promise<SettleResponse> {
    const request: SettleRequest = {
      x402Version: 1,
      paymentHeader,
      paymentRequirements,
    };

    const response = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Settlement failed: ${errorText}`);
    }

    return response.json();
  }
}
```

### 2.2 Update Server to Use Real Facilitator

Modify **src/server.ts** to import and use the real facilitator:

```typescript
// At the top of server.ts, replace:
// import { SimpleFacilitator } from './facilitator.js';
// const facilitator = new SimpleFacilitator();

// With:
import { RealFacilitator } from './real-facilitator.js';
const facilitator = new RealFacilitator();
```

That's it! The rest of your code stays the same because both facilitators implement the same interface.

### 2.3 Environment Configuration

Create a `.env` file:

```bash
# Server Configuration
PORT=3402
SERVER_WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# USDC Contract on Base Sepolia
USDC_CONTRACT=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Client Configuration
SERVER_URL=http://localhost:3402

# Your wallet private key (for testing only!)
PRIVATE_KEY=0x81a3479488a40e54a65029dcaa067800ee9af45c87c3c08da0fa0783110f8216

# Facilitator URL (testnet)
FACILITATOR_URL=https://x402.org/facilitator
```

---

## Step 3: Make Real On-Chain Payments

### 3.1 Rebuild the Project

```bash
npm run build
```

### 3.2 Start the Server

```bash
npm run dev:server
```

### 3.3 Make a Real Payment

Now when you run the client, it will create a **real on-chain transaction**:

```bash
# Make a small payment first (0.1 USDC)
npm run dev:client -- request --endpoint //api-call --key YOUR_PRIVATE_KEY

# Or the premium endpoint (1.0 USDC)
npm run dev:client -- request --endpoint //premium-data --key YOUR_PRIVATE_KEY
```

### 3.4 Verify the Transaction

After a successful payment, you'll get a real transaction hash like:
```
Transaction: 0xabc123def456...
Network: base-sepolia
```

**Verify it on Base Sepolia Explorer:**
1. Go to https://sepolia.basescan.org/
2. Paste the transaction hash in the search bar
3. You'll see the actual USDC transfer on-chain!

---

## Understanding What Happens

### Payment Flow with Real Facilitator

1. **Client** makes a request to protected endpoint
2. **Server** returns 402 with payment requirements
3. **Client** signs payment authorization (EIP-712)
4. **Client** sends request with X-PAYMENT header
5. **Server** calls facilitator's `/verify` endpoint
6. **Facilitator** validates the signature
7. **Server** calls facilitator's `/settle` endpoint
8. **Facilitator** submits transaction to Base Sepolia blockchain
9. **Blockchain** processes the USDC transfer
10. **Server** returns protected resource

### What's Different from Simulation?

| Aspect | Simulated | Real |
|--------|-----------|------|
| Transaction | Fake hash | Real on-chain tx |
| USDC | No transfer | Actual transfer |
| Time | Instant | ~2-5 seconds |
| Gas | None | Paid by facilitator |
| Verification | Local only | On-chain verification |

---

## Costs and Limits

### Testnet (Free)
- **USDC**: Free from faucet (10 USDC)
- **Gas fees**: Paid by facilitator
- **Your cost**: $0

### Mainnet (Production)
To use real money on mainnet:

1. **Sign up for Coinbase Developer Platform**
   - Visit https://portal.cdp.coinbase.com/
   - Create an account and project
   - Generate API credentials

2. **Update Facilitator URL**
   ```typescript
   const FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';
   ```

3. **Change Network**
   - Replace `base-sepolia` with `base`
   - Use real USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

4. **Add Authentication**
   - Include CDP API credentials in facilitator requests
   - Set environment variables for API key and secret

---

## Troubleshooting

### "Insufficient USDC balance"
- Make sure you requested testnet USDC from faucet
- Check your balance on Base Sepolia explorer
- Wait a few minutes for faucet transaction to confirm

### "Facilitator error: 400"
- Check that your payment signature is valid
- Ensure nonce is properly formatted with `0x` prefix
- Verify payment amount matches requirement exactly

### "Settlement timeout"
- Base Sepolia can be slow during high traffic
- Wait 30-60 seconds and try again
- Check Base Sepolia status: https://status.base.org/

### "Invalid signature"
- Make sure you're using the correct private key
- Check that EIP-712 domain matches USDC contract
- Verify chainId is correct (84532 for Base Sepolia)

---

## Next Steps

### Monitor Your Transactions

1. **Base Sepolia Explorer**
   - https://sepolia.basescan.org/address/YOUR_ADDRESS
   - View all your transactions and USDC balance

2. **Transaction Details**
   - Each payment will show as a USDC transfer
   - You can see from/to addresses, amounts, and gas used

### Try Different Scenarios

1. **Multiple payments** - Make several small payments
2. **Different amounts** - Try both endpoints
3. **Error handling** - Try with insufficient balance
4. **Expired payments** - Wait > 5 minutes before submitting

### Explore Advanced Features

1. **Add more endpoints** with different pricing
2. **Implement payment webhooks** for notifications
3. **Add payment history** tracking
4. **Create a payment dashboard**

---

## Production Checklist

Before going to mainnet:

- [ ] Get Coinbase Developer Platform account
- [ ] Generate API credentials
- [ ] Update network to `base` (mainnet)
- [ ] Use real USDC contract address
- [ ] Test with small amounts first
- [ ] Implement proper error handling
- [ ] Add logging and monitoring
- [ ] Set up payment notifications
- [ ] Secure your private keys (use environment variables only)
- [ ] Never commit private keys to git
- [ ] Consider using a wallet service instead of raw private keys

---

## Resources

- **x402.org Facilitator**: https://x402.org/facilitator
- **Circle Testnet Faucet**: https://faucet.circle.com/
- **Base Sepolia Explorer**: https://sepolia.basescan.org/
- **x402 Documentation**: https://docs.cdp.coinbase.com/x402/welcome
- **x402 GitHub**: https://github.com/coinbase/x402
- **Base Documentation**: https://docs.base.org/

---

**Ready to test real payments?** Follow the steps above and watch your first x402 transaction happen on-chain!
