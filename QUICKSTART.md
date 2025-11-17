# Quick Start Guide

Get started with x402 in 5 minutes!

## Step 1: Generate a Test Wallet

```bash
npm run generate-wallet
```

Copy the **Address** and **Private Key** shown.

## Step 2: Get Testnet USDC

1. Go to https://faucet.circle.com/
2. Select **Base Sepolia** network
3. Paste your wallet address
4. Click "Get Test Tokens"
5. Wait ~30 seconds for tokens to arrive

## Step 3: Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and add your private key:
```
PRIVATE_KEY=0x1234...your_key_here
```

## Step 4: Start the Server

```bash
npm run dev:server
```

Keep this terminal open!

## Step 5: Make a Payment (New Terminal)

### Option A: Test free endpoint first
```bash
npm run dev:client test-public
```

### Option B: Make a paid request

Replace `YOUR_KEY` with your private key:

```bash
npm run dev:client request --endpoint /api-call --key YOUR_KEY
```

Or for the premium endpoint (costs more):

```bash
npm run dev:client request --endpoint /premium-data --key YOUR_KEY
```

## What You'll See

The client will:
1. Request the endpoint
2. Receive "402 Payment Required"
3. Create and sign a payment
4. Submit payment with request
5. Receive the protected data

## Endpoints

- `/public` - FREE
- `/api-call` - 0.1 USDC
- `/premium-data` - 1.0 USDC

## Need Help?

See the full [README.md](./README.md) for detailed documentation.

## Common Issues

**"Cannot find module"**: Run `npm install`

**"Payment verification failed"**: Make sure you got testnet USDC from the faucet

**"Server not running"**: Start the server with `npm run dev:server`
