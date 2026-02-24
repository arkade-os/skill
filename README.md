# @arkade-os/skill

Arkade SDK skill for AI agents — develop with the `@arkade-os/sdk` TypeScript SDK for Bitcoin wallets, Lightning, smart contracts, and stablecoin swaps.

## Features

- **Bitcoin on Arkade**: Instant offchain Bitcoin transactions via VTXOs
- **Onchain Ramps**: Onboard (onchain to offchain) and offboard (offchain to onchain)
- **Lightning Network**: Pay and receive via Boltz submarine swaps
- **Stablecoin Swaps**: Trade BTC for USDC/USDT on Polygon, Ethereum, Arbitrum
- **SDK Development Guide**: SKILL.md teaches AI agents how to build with Arkade

**Default Server:** https://arkade.computer

## Installation

### As an Agent Skill

Install directly into your coding agent using the [Vercel Skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add arkade-os/skill
```

This discovers the `arkade` skill and installs it into supported agents (Claude Code, Cursor, etc.).

You can also target a specific agent or install globally:

```bash
# Install to a specific agent
npx skills add arkade-os/skill --agent claude-code

# Install globally (user-level)
npx skills add arkade-os/skill -g
```

### As an npm Package

```bash
npm install @arkade-os/skill
# or
pnpm add @arkade-os/skill
```

## Quick Start

```typescript
import { Wallet, SingleKey } from "@arkade-os/sdk";
import {
  ArkadeBitcoinSkill,
  ArkaLightningSkill,
  LendaSwapSkill,
} from "@arkade-os/skill";

// Create wallet
const wallet = await Wallet.create({
  identity: SingleKey.fromHex(privateKeyHex),
  arkServerUrl: "https://arkade.computer",
});

// Bitcoin operations
const bitcoin = new ArkadeBitcoinSkill(wallet);
const balance = await bitcoin.getBalance();
await bitcoin.send({ address: "ark1...", amount: 50000 });

// Lightning operations
const lightning = new ArkaLightningSkill({ wallet, network: "bitcoin" });
const invoice = await lightning.createInvoice({ amount: 25000 });

// Stablecoin swaps
const lendaswap = new LendaSwapSkill({ wallet });
const quote = await lendaswap.getQuoteBtcToStablecoin(100000, "usdc_pol");
```

## Available Skills

| Skill | Description |
|-------|-------------|
| `ArkadeBitcoinSkill` | Send/receive BTC via Arkade offchain, onboard/offboard ramps |
| `ArkaLightningSkill` | Lightning payments via Boltz swaps |
| `LendaSwapSkill` | USDC/USDT swaps via LendaSwap |

## Documentation

- [SKILL.md](./SKILL.md) — SDK development guide for AI agents
- [Arkade Docs](https://docs.arkadeos.com) — full documentation
- [Wallet SDK v0.3](https://docs.arkadeos.com/wallets/v0.3/setup) — SDK reference
- [Smart Contracts](https://docs.arkadeos.com/contracts/overview) — contract development

## License

MIT
