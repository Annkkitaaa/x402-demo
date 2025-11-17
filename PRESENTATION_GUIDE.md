# x402 Demo - Client Presentation Guide

Perfect for demonstrating the x402 payment protocol in meetings! This interactive web demo shows how micropayments work in real-time.

## Quick Start for Your Meeting

### Option 1: Simulated Payments (Recommended for Demo)

**Best for**: Quick demos, no setup required, instant results

```bash
# 1. Start the server
npm run build
npm run dev:server

# 2. Open in browser
http://localhost:3402
```

Everything works instantly - no testnet tokens needed!

---

### Option 2: Real On-Chain Payments

**Best for**: Technical audiences, showing actual blockchain transactions

```bash
# 1. Get testnet USDC (5 minutes)
# Visit: https://faucet.circle.com/
# Select: Base Sepolia
# Enter your wallet address
# Get 10 free testnet USDC

# 2. Start the REAL payments server
npm run build
npm run start:real

# 3. Open in browser
http://localhost:3402
```

---

## Demo Flow for Client Meeting

### Part 1: Introduction (2 minutes)

**What to say:**
> "Today I'll show you x402 - a new protocol that enables micropayments for APIs and content on the web. It uses HTTP 402 'Payment Required' to make payments as simple as clicking a button."

**What to show:**
- Open http://localhost:3402 in your browser
- Point out the clean interface
- Explain the three content cards with different pricing

### Part 2: Wallet Connection (1 minute)

**What to do:**
1. Click in the private key field
2. Paste your test private key
3. Click "Connect Wallet"

**What to say:**
> "In production, users would connect with MetaMask or another wallet. For this demo, we're using a test wallet on Base Sepolia testnet."

**Tip:** Have your private key ready in a text file before the meeting!

### Part 3: Free Content (1 minute)

**What to do:**
1. Click "Access Now" on the FREE Public Endpoint card
2. Show the instant response

**What to say:**
> "First, let's access free content - no payment needed. This works just like any regular API call."

### Part 4: Paid Content - The Magic! (3-4 minutes)

**What to do:**
1. Click "Pay & Access" on the 0.1 USDC API Call card
2. Watch the payment flow animation

**What to say while it's processing:**
> "Watch what happens:
> 1. Our app requests the resource
> 2. Server responds with '402 Payment Required'
> 3. The client automatically creates a signed payment
> 4. Payment is verified and settled
> 5. Content is delivered - all in about 2 seconds!"

**Point out:**
- The 5-step flow visualization
- The payment amount (0.1 USDC = 10 cents)
- The instant settlement
- The returned content (JSON data)

### Part 5: Premium Content (Optional, 2 minutes)

**What to do:**
1. Click "Pay & Access" on the 1.0 USDC Premium Data card
2. Show the market data response

**What to say:**
> "Here's a higher-priced endpoint - 1 USDC for premium market data. Same seamless flow, just a different price point. This shows how flexible x402 is for different use cases."

### Part 6: The Technical Wow Factor (2 minutes)

**If using REAL payments:**

**What to show:**
1. Scroll to "Latest Transaction" section
2. Show the transaction hash
3. Click the "View on Block Explorer" link
4. Show the actual USDC transfer on Base Sepolia

**What to say:**
> "This is the beauty of x402 - that payment we just made is a real on-chain transaction. Here's the proof on the Base Sepolia blockchain. In production, this would be real money on mainnet."

**If using SIMULATED payments:**

**What to say:**
> "In production, these payments would be settled on-chain. For this demo, we're simulating the settlement, but the entire protocol flow is identical to what you'd use in production."

---

## Key Talking Points

### Benefits of x402

1. **No Subscriptions Required**
   - Pay only for what you use
   - No monthly fees or commitments
   - Perfect for occasional users

2. **Instant Micropayments**
   - Payments as low as $0.001
   - Settled in 2-5 seconds
   - No transaction fees

3. **Developer-Friendly**
   - Built on standard HTTP
   - Works with any programming language
   - Simple integration (just a few lines of code)

4. **No Account Setup**
   - No API keys to manage
   - No user registration
   - Just pay and access

### Use Cases to Mention

- **AI APIs**: Pay per request instead of monthly subscriptions
- **Data APIs**: Buy only the data you need
- **Content Paywalls**: Micropayments for articles, reports
- **IoT Services**: Machine-to-machine payments
- **Gaming**: In-game micropurchases without payment processors

---

## Handling Questions

### "How is this different from Stripe?"

> "Stripe is great for traditional payments, but has minimums and fees that make micropayments impractical. x402 enables payments as low as a tenth of a cent with near-zero fees, making it perfect for pay-per-use APIs."

### "What about gas fees?"

> "x402 uses EIP-3009, which enables gasless transfers. The facilitator handles gas fees, so end users just pay the content price."

### "Which blockchains does it support?"

> "Currently Base, Solana, Polygon, Avalanche, and others. It's chain-agnostic by design, so new chains can be added easily."

### "Is this production-ready?"

> "Yes! It's developed by Coinbase and backed by the x402 Foundation (co-founded with Cloudflare). Several companies are already integrating it."

### "How long to integrate?"

> "For a basic integration, about 30 minutes. We have SDKs for Node.js, Python, Java, and Go that make it very simple."

---

## Demo Troubleshooting

### Issue: "Wallet won't connect"

**Solution:**
- Check that private key starts with `0x`
- Make sure you're using a testnet wallet
- Try generating a new wallet: `npm run generate-wallet`

### Issue: "Payment verification failed"

**Solution:**
- If using real payments: Check you have testnet USDC
- Try the simulated server instead: `npm run dev:server`
- Reload the page and reconnect wallet

### Issue: "Page won't load"

**Solution:**
- Check server is running: `npm run dev:server`
- Verify port 3402 is not in use
- Clear browser cache

### Issue: "Browser console shows CORS error"

**Solution:**
- Make sure you're accessing via `localhost`, not `127.0.0.1`
- Restart the server

---

## Pre-Meeting Checklist

Two Hours Before:
- [ ] Test the demo start to finish
- [ ] Have private key ready in a text file
- [ ] Check testnet USDC balance (if using real payments)
- [ ] Open demo in browser tab
- [ ] Test all three endpoints
- [ ] Prepare laptop screen sharing

30 Minutes Before:
- [ ] Start the server
- [ ] Load http://localhost:3402
- [ ] Do a quick test run
- [ ] Connect wallet
- [ ] Make one test payment

During Meeting:
- [ ] Share screen before connecting wallet
- [ ] Hide private key after connecting
- [ ] Keep browser console open (optional - shows technical details)
- [ ] Have Block Explorer tab ready (if showing real tx)

---

## Post-Demo Next Steps

After showing the demo, provide:

1. **GitHub Repository**: Your x402 PoC code
2. **Documentation**: Link to https://docs.cdp.coinbase.com/x402
3. **Integration Estimate**: Based on their use case
4. **Follow-up Meeting**: Technical deep-dive with their team

---

## Screen Sharing Tips

1. **Use Presentation Mode**: Zoom browser window to 100-110%
2. **Hide Bookmarks Bar**: Clean screen = professional look
3. **Close Other Tabs**: Reduce distractions
4. **Use Full Screen**: F11 for immersive demo
5. **Have Terminal Visible**: (Optional) Shows the server logs

---

## Two-Device Demo (Advanced)

For extra impact with technical audiences:

**Device 1 (Main screen)**: Web browser with demo
**Device 2 (Secondary)**: Terminal showing server logs in real-time

As you click "Pay & Access", the audience sees:
- Browser: Payment flow animation
- Terminal: Real-time log messages
- Shows both client and server perspectives

---

## Demo Customization Ideas

Want to tailor the demo to your client?

### Use Their Brand Colors

Edit `public/styles.css`:
```css
:root {
    --primary-color: #THEIR_COLOR;
}
```

### Add Their Use Case

Edit `public/index.html` - change card descriptions:
```html
<p class="card-desc">Your client's specific use case here</p>
```

### Custom Pricing

Edit `src/server.ts`:
```typescript
sendPaymentRequired(res, '/api-call', '500000'); // 0.5 USDC
```

---

## Video Recording Tips

Recording the demo for later viewing?

**Tools:**
- OBS Studio (free, professional)
- Loom (simple, shareable links)
- Zoom recording (convenient)

**Settings:**
- 1080p minimum resolution
- Capture full screen
- Enable webcam (optional - adds personal touch)
- Record audio narration

**Script:**
Follow the demo flow above, speaking clearly and pausing between sections.

---

## Success Metrics

After your demo, gauge interest by asking:

1. "Can you see this working for [their use case]?"
2. "What pricing model would make sense for your API?"
3. "Should we set up a technical integration call?"

---

**Ready to present?**

1. Start server: `npm run dev:server`
2. Open browser: `http://localhost:3402`
3. Connect wallet
4. Show the magic! ✨

Good luck with your presentation!
