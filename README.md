# x402 Payment Protocol - PoC

A proof-of-concept demonstrating the [x402 payment protocol](https://github.com/coinbase/x402) developed by Coinbase. This project includes both a **web interface** and **CLI tools** to show how HTTP 402 "Payment Required" enables seamless micropayments for API access using stablecoins.

## What is x402?

x402 is an open payment protocol that enables instant, automatic stablecoin payments directly over HTTP. It uses the HTTP 402 "Payment Required" status code to request payment for resources.

**Key Features:**
- **Micropayments**: Support for payments as low as $0.001
- **Zero fees**: No transaction fees for merchants or customers
- **Chain agnostic**: Works with multiple blockchains (Base, Solana, Polygon, Avalanche, etc.)
- **Simple integration**: Built on standard HTTP protocol
- **Instant settlement**: 2-5 seconds for on-chain transactions

## Quick Start

Get started with x402 in 5 minutes!

### Prerequisites

- Node.js 18+ and npm
- Basic understanding of blockchain/crypto wallets

### Installation

```bash
# 1. Clone and install dependencies
npm install

# 2. Generate a test wallet
npm run generate-wallet
```

Save the wallet address and private key shown.

### Web Demo (Recommended)

Perfect for presentations and demos!

```bash
# 1. Build the project
npm run build

# 2. Start the server (simulated payments - instant, no setup)
npm run dev:server

# 3. Open your browser
http://localhost:3402
```

You'll see a modern web interface with:
- Wallet connection section
- Three content cards (FREE, 0.1 USDC, 1.0 USDC)
- Live payment flow visualization (5 steps)
- Transaction details after payment

**For real on-chain payments:**
```bash
npm run start:real
```
(Requires testnet USDC - see Real Payments section below)

### CLI Usage

**Start the Server:**
```bash
npm run dev:server
```

**Test Free Endpoint:**
```bash
npm run dev:client test-public
```

**Make Paid Request:**
```bash
npm run dev:client request --endpoint /api-call --key YOUR_PRIVATE_KEY
```

**View Available Endpoints:**
```bash
npm run dev:client info
```

## Project Structure

```
CLI-based-x402-Poc/
├── src/
│   ├── types.ts           # x402 protocol type definitions
│   ├── facilitator.ts     # Payment verification and settlement
│   ├── server.ts          # Resource server requiring payments
│   ├── client.ts          # CLI client for making paid requests
│   └── generate-wallet.ts # Utility to generate test wallets
├── public/
│   ├── index.html         # Web demo interface
│   └── styles.css         # Modern dark theme styling
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

### Payment Flow

1. **Initial Request**: Client requests a protected resource
2. **402 Response**: Server responds with "402 Payment Required" and payment requirements
3. **Payment Creation**: Client creates a signed payment authorization (EIP-712)
4. **Paid Request**: Client resubmits request with `X-PAYMENT` header
5. **Verification**: Server verifies and settles the payment
6. **Resource Access**: Server returns the protected resource

### Architecture

```
┌─────────┐                ┌─────────────┐              ┌──────────────┐
│ Client  │───── GET ─────>│   Server    │              │ Facilitator  │
│         │                 │  (402)      │              │   Service    │
└─────────┘                 └─────────────┘              └──────────────┘
     │                            │                             │
     │   Payment Requirements     │                             │
     │<───────────────────────────│                             │
     │                            │                             │
     │   Sign Payment (EIP-712)   │                             │
     │────────┐                   │                             │
     │        │                   │                             │
     │<───────┘                   │                             │
     │                            │                             │
     │   GET + X-PAYMENT Header   │                             │
     │───────────────────────────>│                             │
     │                            │                             │
     │                            │   Verify Payment            │
     │                            │────────────────────────────>│
     │                            │                             │
     │                            │   Settle Payment (on-chain) │
     │                            │────────────────────────────>│
     │                            │                             │
     │                            │   Settlement Result         │
     │                            │<────────────────────────────│
     │                            │                             │
     │   Protected Resource       │                             │
     │<───────────────────────────│                             │
     │                            │                             │
```

## Available Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/public` | FREE | Public endpoint, no payment required |
| `/api-call` | 0.1 USDC | Generic API call example |
| `/premium-data` | 1.0 USDC | Premium market data and insights |

## Real On-Chain Payments

By default, the server runs in **simulated mode** (perfect for demos). To use **real blockchain transactions**:

### Step 1: Get Testnet USDC

1. **Get Base Sepolia ETH** (for gas, optional):
   - Visit https://www.alchemy.com/faucets/base-sepolia
   - Enter your wallet address
   - Request testnet ETH

2. **Get Testnet USDC**:
   - Visit https://faucet.circle.com/
   - Select "Base Sepolia" network
   - Enter your wallet address (from `npm run generate-wallet`)
   - Request testnet USDC (you'll get 10 USDC)
   - Wait 30-60 seconds for tokens to arrive

3. **Verify Balance**:
   - Check on Base Sepolia explorer: https://sepolia.basescan.org/address/YOUR_ADDRESS

### Step 2: Start Real Payments Server

```bash
# Build the project
npm run build

# Start server with real facilitator
npm run start:real
```

This uses the **x402.org testnet facilitator** which submits actual transactions to Base Sepolia blockchain.

### Step 3: Make Real Payments

```bash
# Web Interface
http://localhost:3402

# Or CLI
npm run dev:client request --endpoint /api-call --key YOUR_PRIVATE_KEY
```

### Step 4: Verify Transaction

After payment, you'll get a real transaction hash. View it on:
- **Base Sepolia Explorer**: https://sepolia.basescan.org/
- Paste the transaction hash to see the actual USDC transfer!

## Technical Details

### Payment Scheme: EIP-3009

This PoC uses the `exact` payment scheme with EIP-3009 (transferWithAuthorization). This allows gasless transfers where:

1. User signs an authorization message (EIP-712)
2. Server or facilitator submits the transaction
3. User doesn't need ETH for gas fees

### Signature Format (EIP-712)

```typescript
{
  domain: {
    name: "USD Coin",
    version: "2",
    chainId: 84532,  // Base Sepolia
    verifyingContract: "0x036CbD..."  // USDC contract
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" }
    ]
  }
}
```

### X-PAYMENT Header Format

The payment is sent as a base64-encoded JSON object:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "from": "0x...",
    "to": "0x...",
    "value": "1000000",
    "validAfter": 1234567890,
    "validBefore": 1234568190,
    "nonce": "0x...",
    "signature": "0x..."
  }
}
```

## Demo Modes

### Simulated Mode (Default)

```bash
npm run dev:server
```

**Benefits:**
- Works instantly, no testnet tokens needed
- Perfect for quick demos and testing
- Shows full payment flow
- Simulated transaction hashes

**Use for:**
- Client presentations
- Quick demos
- Training sessions
- No internet/faucet access

### Real On-Chain Mode

```bash
npm run start:real
```

**Benefits:**
- Real blockchain transactions
- Actual USDC transfers
- Viewable on block explorer
- Production-like behavior

**Use for:**
- Technical audiences
- Showing actual blockchain integration
- Full end-to-end testing
- When you have testnet USDC

## Presentation Tips

### Quick Demo Flow (5 minutes)

**Step 1: Introduction (1 min)**
> "I'll show you x402 - a protocol that enables micropayments for APIs. It makes payments as simple as clicking a button."

**Step 2: Connect Wallet (30 sec)**
- Open http://localhost:3402
- Paste private key and connect

**Step 3: Free Content (30 sec)**
- Click "Access Now" on FREE endpoint
- Show instant response

**Step 4: Paid Content - The Magic! (2 min)**
- Click "Pay & Access" on 0.1 USDC endpoint
- Watch 5-step payment flow animation
- Explain each step as it happens
- Show returned content and transaction details

**Step 5: Premium Content (1 min, optional)**
- Click "Pay & Access" on 1.0 USDC endpoint
- Show market data response

### Key Talking Points

**Benefits:**
- No subscriptions required - pay only for what you use
- Instant micropayments as low as $0.001
- No transaction fees for merchants or customers
- Developer-friendly - works with any programming language
- No account setup or API keys needed

**Use Cases:**
- AI APIs: Pay per request instead of monthly subscriptions
- Data APIs: Buy only the data you need
- Content paywalls: Micropayments for articles/reports
- IoT Services: Machine-to-machine payments
- Gaming: In-game micropurchases without payment processors

### Common Questions

**Q: How is this different from Stripe?**
> Stripe is great for traditional payments, but has minimums and fees that make micropayments impractical. x402 enables payments as low as a tenth of a cent with near-zero fees.

**Q: What about gas fees?**
> x402 uses EIP-3009 for gasless transfers. The facilitator handles gas fees, so users just pay the content price.

**Q: Which blockchains are supported?**
> Base, Solana, Polygon, Avalanche, Sei, and more. It's chain-agnostic by design.

**Q: How long to integrate?**
> About 30 minutes for basic integration. SDKs available for Node.js, Python, Java, and Go.

## Development

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Run Production Build

```bash
npm run server           # Start server (simulated)
npm run server:real      # Start server (real payments)
npm run client           # Run CLI client
```

### Customization

**Change Brand Colors** (edit `public/styles.css`):
```css
:root {
    --primary-color: #YOUR_COLOR;
    --secondary-color: #YOUR_COLOR;
}
```

**Update Pricing** (edit `src/server.ts`):
```typescript
// Change amounts (in smallest unit, 6 decimals for USDC)
sendPaymentRequired(res, '/api-call', '50000');  // 0.05 USDC
```

**Customize Card Text** (edit `public/index.html`):
```html
<h3>Your Use Case</h3>
<p class="card-desc">Tailored description here</p>
```

## Troubleshooting

### "Insufficient funds" error

Make sure you've:
1. Generated a wallet with `npm run generate-wallet`
2. Got testnet USDC from the faucet
3. Used the correct private key in your command

### Server not responding

Check that:
1. Server is running (`npm run dev:server`)
2. Server is on the correct port (3402)
3. No firewall blocking localhost connections

### Payment verification failed

Ensure:
1. Your wallet has testnet USDC
2. You're using the correct network (Base Sepolia)
3. Payment hasn't expired (default 5 minutes)

### Web page won't load

Solution:
- Check server is running: `npm run dev:server`
- Verify port 3402 is not in use
- Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache

### "Wallet won't connect"

Solution:
- Make sure private key starts with `0x`
- Use test key from `npm run generate-wallet`
- Refresh page and try again

## Security Notes

**Important**: This is a PoC for educational purposes:

- Uses Base Sepolia testnet only
- Never use test wallets with real funds
- Private keys are stored in `.env` (never commit this file)
- Facilitator is simplified (production would use Coinbase's facilitator)
- Simulated mode does not actually settle on-chain

## Limitations

This PoC demonstrates the protocol but has some simplifications:

1. **Simulated Settlement** (default mode): Transactions are not actually sent to blockchain
2. **In-Memory Storage**: Nonces and state are not persisted
3. **No Rate Limiting**: Production servers would need this
4. **Basic Error Handling**: Simplified for demonstration
5. **Mock Facilitator**: Real implementation would use Coinbase's facilitator API





Before deploying to mainnet:

- [ ] Get Coinbase Developer Platform account at https://portal.cdp.coinbase.com/
- [ ] Generate API credentials
- [ ] Update network from `base-sepolia` to `base`
- [ ] Use real USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- [ ] Update facilitator URL to production endpoint




## Learn More

### Official Resources

- [x402 GitHub Repository](https://github.com/coinbase/x402)
- [x402 Documentation](https://docs.cdp.coinbase.com/x402/welcome)
- [x402 Official Website](https://www.x402.org/)
- [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)

### Technical Specifications

- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009)
- [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
- [HTTP 402 Status Code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)

### Blockchain Explorers

- [Base Sepolia Explorer](https://sepolia.basescan.org/)
- [Base Mainnet Explorer](https://basescan.org/)

### Testnet Resources

- [Circle Testnet Faucet](https://faucet.circle.com/)
- [Alchemy Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)
- [Base Network Documentation](https://docs.base.org/)

## Contributing

This is a learning project! Feel free to:
- Experiment with different payment amounts
- Add new protected endpoints
- Implement real blockchain settlement
- Add support for other chains/tokens
- Improve the web interface
- Add more payment schemes

## Example Output

### Web Demo

After clicking "Pay & Access", you'll see a 5-step animation:

1. ⏳ Request Resource
2. 💳 402 Payment Required
3. ✍️ Create Payment (EIP-712 signing)
4. 📤 Submit Payment
5. ✅ Access Granted

Plus transaction details with amount, network, and tx hash.

### CLI Output

```
╔════════════════════════════════════════════════════════════╗
║              x402 Payment Flow - Starting                 ║
╚════════════════════════════════════════════════════════════╝

[1/5] Wallet initialized
      Address: 0x1234...5678

[2/5] Making initial request to /premium-data
      Status: 402 Payment Required ✓

[3/5] Payment requirement received:
      Scheme: exact
      Network: base-sepolia
      Amount: 1.000000 USDC
      Recipient: 0x742d...0bEb
      Timeout: 300s

[4/5] Creating payment authorization...

[5/5] Submitting request with payment...

╔════════════════════════════════════════════════════════════╗
║              ✓ Payment Successful!                        ║
╚════════════════════════════════════════════════════════════╝

Response Data:
{
  "message": "Payment successful! Here is your premium data.",
  "data": {
    "secret": "This is valuable premium content!",
    ...
  },
  "payment": {
    "txHash": "0xabc123...",
    "network": "base-sepolia"
  }
}
```





---

Built with [x402](https://github.com/coinbase/x402) by Coinbase
