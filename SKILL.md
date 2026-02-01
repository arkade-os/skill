---
name: arkade
description: Send and receive Bitcoin over Arkade (off-chain), on-chain (via onboard/offboard), and Lightning. Swap USDC/USDT stablecoins.
read_when:
  - user wants to send or receive Bitcoin
  - user mentions Arkade, Ark, or off-chain Bitcoin
  - user wants to use Lightning Network
  - user wants to swap BTC for stablecoins (USDC, USDT)
  - user wants to on-ramp or off-ramp Bitcoin
  - user wants to get paid on-chain or pay someone on-chain
  - user mentions boarding address or VTXOs
  - user wants instant Bitcoin payments
metadata:
  emoji: "₿"
  requires:
    - private key (64 hex characters)
    - LENDASWAP_API_KEY (for stablecoin swaps)
---

# Arkade Skill

Send and receive Bitcoin over Arkade (off-chain), on-chain (via onboard/offboard), and Lightning Network.
Swap between BTC and stablecoins (USDC/USDT) via LendaSwap.

**Payment methods:**
- **Off-chain (Arkade)**: Instant transactions between Arkade wallets
- **On-chain**: Get paid on-chain via boarding address (onboard), pay on-chain via offboard
- **Lightning**: Pay and receive via Boltz submarine swaps

**Default Server:** https://arkade.computer

## Installation

```bash
npm install @arkade-os/skill
# or
pnpm add @arkade-os/skill
```

## CLI Commands

### Wallet Management

```bash
# Initialize wallet with private key (default server: arkade.computer)
arkade init <private-key-hex>

# Initialize with custom server
arkade init <private-key-hex> https://custom-server.com

# Show Ark address (for receiving off-chain Bitcoin)
arkade address

# Show boarding address (for on-chain deposits)
arkade boarding-address

# Show balance breakdown
arkade balance
```

### Bitcoin Transactions

```bash
# Send sats to an Ark address
arkade send <ark-address> <amount-sats>

# Example: Send 50,000 sats
arkade send ark1qxyz... 50000

# View transaction history
arkade history
```

### On-chain Payments (Onboard/Offboard)

```bash
# Get paid on-chain: Receive BTC to your boarding address, then onboard to Arkade
# Step 1: Get your boarding address
arkade boarding-address

# Step 2: Have someone send BTC to your boarding address

# Step 3: Onboard the received BTC to make it available off-chain
arkade onboard

# Pay on-chain: Send off-chain BTC to any on-chain Bitcoin address
arkade offboard <btc-address>

# Example: Pay someone at bc1 address
arkade offboard bc1qxyz...
```

### Lightning Network

```bash
# Create a Lightning invoice to receive payment
arkade ln-invoice <amount-sats> [description]

# Example: Create invoice for 25,000 sats
arkade ln-invoice 25000 "Coffee payment"

# Pay a Lightning invoice
arkade ln-pay <bolt11-invoice>

# Show swap fees
arkade ln-fees

# Show swap limits
arkade ln-limits

# Show pending swaps
arkade ln-pending
```

### Stablecoin Swaps (LendaSwap)

Requires `LENDASWAP_API_KEY` environment variable.

```bash
# Get quote for BTC to stablecoin swap
arkade swap-quote <amount-sats> <from> <to>

# Example: Quote 100,000 sats to USDC on Polygon
arkade swap-quote 100000 btc_arkade usdc_pol

# Show available trading pairs
arkade swap-pairs
```

**Supported Tokens:**
- `btc_arkade` - Bitcoin on Arkade
- `usdc_pol` - USDC on Polygon
- `usdc_eth` - USDC on Ethereum
- `usdc_arb` - USDC on Arbitrum
- `usdt_pol` - USDT on Polygon
- `usdt_eth` - USDT on Ethereum
- `usdt_arb` - USDT on Arbitrum

## SDK Usage

```typescript
import { Wallet, SingleKey } from "@arkade-os/sdk";
import {
  ArkadeBitcoinSkill,
  ArkaLightningSkill,
  LendaSwapSkill,
} from "@arkade-os/skill";

// Create wallet (default server: arkade.computer)
const wallet = await Wallet.create({
  identity: SingleKey.fromHex(privateKeyHex),
  arkServerUrl: "https://arkade.computer",
});

// === Bitcoin Operations ===
const bitcoin = new ArkadeBitcoinSkill(wallet);

// Get addresses
const arkAddress = await bitcoin.getArkAddress();
const boardingAddress = await bitcoin.getBoardingAddress();

// Check balance
const balance = await bitcoin.getBalance();
console.log("Total:", balance.total, "sats");
console.log("Off-chain available:", balance.offchain.available, "sats");
console.log("On-chain pending:", balance.onchain.total, "sats");

// Send Bitcoin
const result = await bitcoin.send({
  address: recipientArkAddress,
  amount: 50000,
});
console.log("Sent! TX:", result.txid);

// === Lightning Operations ===
const lightning = new ArkaLightningSkill({
  wallet,
  network: "bitcoin",
});

// Create invoice
const invoice = await lightning.createInvoice({
  amount: 25000,
  description: "Coffee payment",
});
console.log("Invoice:", invoice.bolt11);

// Pay invoice
const payment = await lightning.payInvoice({
  bolt11: "lnbc...",
});
console.log("Paid! Preimage:", payment.preimage);

// === Stablecoin Swaps ===
const lendaswap = new LendaSwapSkill({
  wallet,
  apiKey: process.env.LENDASWAP_API_KEY,
});

// Get quote
const quote = await lendaswap.getQuoteBtcToStablecoin(100000, "usdc_pol");
console.log("You'll receive:", quote.targetAmount, "USDC");

// Execute swap
const swap = await lendaswap.swapBtcToStablecoin({
  targetAddress: "0x...", // EVM address
  targetToken: "usdc_pol",
  targetChain: "polygon",
  sourceAmount: 100000,
});
console.log("Swap ID:", swap.swapId);
```

## Configuration

**Data Storage:** `~/.arkade-wallet/config.json`

**Environment Variables:**
- `LENDASWAP_API_KEY` - Required for stablecoin swaps

## Skill Interfaces

### ArkadeBitcoinSkill

- `getArkAddress()` - Get Ark address for receiving off-chain payments
- `getBoardingAddress()` - Get boarding address for receiving on-chain payments
- `getBalance()` - Get balance breakdown
- `send(params)` - Send Bitcoin to Ark address (off-chain)
- `getTransactionHistory()` - Get transaction history
- `onboard(params)` - Get paid on-chain: convert on-chain BTC to off-chain
- `offboard(params)` - Pay on-chain: send off-chain BTC to any on-chain address
- `waitForIncomingFunds(timeout?)` - Wait for incoming funds

### ArkaLightningSkill

- `createInvoice(params)` - Create Lightning invoice
- `payInvoice(params)` - Pay Lightning invoice
- `getFees()` - Get swap fees
- `getLimits()` - Get swap limits
- `getPendingSwaps()` - Get pending swaps
- `getSwapHistory()` - Get swap history
- `isAvailable()` - Check if Lightning is available

### LendaSwapSkill

- `getQuoteBtcToStablecoin(amount, token)` - Quote BTC to stablecoin
- `getQuoteStablecoinToBtc(amount, token)` - Quote stablecoin to BTC
- `swapBtcToStablecoin(params)` - Swap BTC to stablecoin
- `swapStablecoinToBtc(params)` - Swap stablecoin to BTC
- `getSwapStatus(swapId)` - Get swap status
- `getPendingSwaps()` - Get pending swaps
- `getSwapHistory()` - Get swap history
- `getAvailablePairs()` - Get available trading pairs
- `claimSwap(swapId)` - Claim completed swap
- `refundSwap(swapId)` - Refund expired swap

## Networks

Arkade supports multiple networks:
- `bitcoin` - Bitcoin mainnet
- `testnet` - Bitcoin testnet
- `signet` - Bitcoin signet
- `regtest` - Local regtest
- `mutinynet` - Mutiny signet

## Support

- GitHub: https://github.com/arkade-os/skill
- Documentation: https://docs.arkade.computer
