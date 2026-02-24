/**
 * @arkade-os/skill - Arkade SDK Skills for Agent Integration
 *
 * This package provides skill classes for working with the Arkade
 * protocol programmatically, designed for AI agent integration.
 *
 * ## Available Skills
 *
 * - **ArkadeBitcoinSkill**: Send/receive Bitcoin via Arkade with on/off ramp support
 * - **ArkaLightningSkill**: Lightning Network payments via Boltz submarine swaps
 * - **LendaSwapSkill**: USDC/USDT stablecoin swaps via LendaSwap
 *
 * ## Quick Start
 *
 * ```typescript
 * import { Wallet, SingleKey } from "@arkade-os/sdk";
 * import {
 *   ArkadeBitcoinSkill,
 *   ArkaLightningSkill,
 *   LendaSwapSkill,
 * } from "@arkade-os/skill";
 *
 * const wallet = await Wallet.create({
 *   identity: SingleKey.fromHex(privateKeyHex),
 *   arkServerUrl: "https://arkade.computer",
 * });
 *
 * // Bitcoin operations
 * const bitcoin = new ArkadeBitcoinSkill(wallet);
 * const balance = await bitcoin.getBalance();
 *
 * // Lightning operations
 * const lightning = new ArkaLightningSkill({ wallet, network: "bitcoin" });
 * const invoice = await lightning.createInvoice({ amount: 50000 });
 *
 * // Stablecoin swaps
 * const lendaswap = new LendaSwapSkill({ wallet });
 * const quote = await lendaswap.getQuoteBtcToStablecoin(100000, "usdc_pol");
 * ```
 *
 * @packageDocumentation
 */

// Re-export all skills and types
export * from "./skills";

// Re-export commonly used types from @arkade-os/sdk
export type {
  Wallet,
  ArkTransaction,
  WalletBalance,
  ExtendedCoin,
  ExtendedVirtualCoin,
  FeeInfo,
  SettlementEvent,
  NetworkName,
} from "@arkade-os/sdk";
