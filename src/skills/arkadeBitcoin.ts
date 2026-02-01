/**
 * ArkadeBitcoinSkill - Send and receive Bitcoin over Arkade protocol.
 *
 * This skill provides a unified interface for Bitcoin operations
 * designed for agent integration (CLI-friendly for agents like MoltBot).
 *
 * @module skills/arkadeBitcoin
 */

import {
  Wallet,
  Ramps,
  ArkTransaction,
  ExtendedCoin,
  ExtendedVirtualCoin,
  type IncomingFunds,
} from "@arkade-os/sdk";
import type {
  BitcoinSkill,
  RampSkill,
  BitcoinAddress,
  SendParams,
  SendResult,
  BalanceInfo,
  IncomingFundsEvent,
  OnboardParams,
  OffboardParams,
  RampResult,
} from "./types";

/**
 * ArkadeBitcoinSkill provides a unified interface for sending and receiving
 * Bitcoin over the Arkade protocol.
 *
 * This skill wraps the core wallet functionality and provides:
 * - Off-chain Bitcoin transactions via Ark
 * - Get paid on-chain via boarding address + onboard
 * - Pay on-chain via offboard to any Bitcoin address
 * - Balance management
 * - Transaction history
 *
 * @example
 * ```typescript
 * import { Wallet, SingleKey } from "@arkade-os/sdk";
 * import { ArkadeBitcoinSkill } from "@arkade-os/skill";
 *
 * // Create a wallet
 * const wallet = await Wallet.create({
 *   identity: SingleKey.fromHex(privateKeyHex),
 *   arkServerUrl: "https://arkade.computer",
 * });
 *
 * // Create the skill
 * const bitcoinSkill = new ArkadeBitcoinSkill(wallet);
 *
 * // Get addresses for receiving
 * const addresses = await bitcoinSkill.getReceiveAddresses();
 * console.log("Ark Address:", addresses[0].address);
 *
 * // Check balance
 * const balance = await bitcoinSkill.getBalance();
 * console.log("Available:", balance.offchain.available, "sats");
 *
 * // Send Bitcoin off-chain
 * const result = await bitcoinSkill.send({
 *   address: recipientArkAddress,
 *   amount: 10000, // 10,000 sats
 * });
 * console.log("Sent! Txid:", result.txid);
 * ```
 */
export class ArkadeBitcoinSkill implements BitcoinSkill, RampSkill {
  readonly name = "arkade-bitcoin";
  readonly description =
    "Send and receive Bitcoin over Arkade off-chain, get paid on-chain (onboard), pay on-chain (offboard)";
  readonly version = "1.0.0";

  private readonly ramps: Ramps;

  /**
   * Creates a new ArkadeBitcoinSkill instance.
   *
   * @param wallet - The Arkade wallet to use for operations.
   *                 Must be a full wallet (not readonly) for send/settle operations.
   */
  constructor(private readonly wallet: Wallet) {
    this.ramps = new Ramps(wallet);
  }

  /**
   * Get all available addresses for receiving Bitcoin.
   *
   * Returns both the Ark address (for off-chain receipts) and the
   * boarding address (for on-chain deposits that can be onboarded).
   *
   * @returns Array of addresses with their types and descriptions
   */
  async getReceiveAddresses(): Promise<BitcoinAddress[]> {
    const [arkAddress, boardingAddress] = await Promise.all([
      this.wallet.getAddress(),
      this.wallet.getBoardingAddress(),
    ]);

    return [
      {
        address: arkAddress,
        type: "ark",
        description: "Ark address for receiving off-chain Bitcoin instantly",
      },
      {
        address: boardingAddress,
        type: "boarding",
        description:
          "Boarding address for receiving on-chain Bitcoin (requires onboarding)",
      },
    ];
  }

  /**
   * Get the Ark address for receiving off-chain Bitcoin.
   *
   * This is the primary address for receiving Bitcoin via Arkade.
   * Funds sent to this address are immediately available off-chain.
   *
   * @returns The bech32m-encoded Ark address
   */
  async getArkAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  /**
   * Get the boarding address for receiving on-chain Bitcoin.
   *
   * Funds sent to this address appear as boarding UTXOs and must be
   * onboarded to become off-chain VTXOs before they can be spent.
   *
   * @returns The Bitcoin boarding address
   */
  async getBoardingAddress(): Promise<string> {
    return this.wallet.getBoardingAddress();
  }

  /**
   * Get the current balance with detailed breakdown.
   *
   * @returns Balance information including off-chain and on-chain amounts
   */
  async getBalance(): Promise<BalanceInfo> {
    const walletBalance = await this.wallet.getBalance();

    return {
      total: walletBalance.total,
      offchain: {
        settled: walletBalance.settled,
        preconfirmed: walletBalance.preconfirmed,
        available: walletBalance.available,
        recoverable: walletBalance.recoverable,
      },
      onchain: {
        confirmed: walletBalance.boarding.confirmed,
        unconfirmed: walletBalance.boarding.unconfirmed,
        total: walletBalance.boarding.total,
      },
    };
  }

  /**
   * Send Bitcoin to an address.
   *
   * For Ark addresses, this creates an off-chain transaction that is
   * instantly confirmed. The recipient must also be using an Ark-compatible
   * wallet connected to the same Ark server.
   *
   * @param params - Send parameters including address and amount
   * @returns Result containing the transaction ID and details
   * @throws Error if the address is invalid or insufficient balance
   */
  async send(params: SendParams): Promise<SendResult> {
    const txid = await this.wallet.sendBitcoin({
      address: params.address,
      amount: params.amount,
      feeRate: params.feeRate,
      memo: params.memo,
    });

    return {
      txid,
      type: "ark",
      amount: params.amount,
    };
  }

  /**
   * Get the transaction history.
   *
   * @returns Array of transactions with type, amount, and status
   */
  async getTransactionHistory(): Promise<ArkTransaction[]> {
    return this.wallet.getTransactionHistory();
  }

  /**
   * Wait for incoming funds.
   *
   * This method blocks until either:
   * - New VTXOs are received (off-chain)
   * - New UTXOs are received at the boarding address (on-chain)
   * - The timeout expires
   *
   * @param timeoutMs - Optional timeout in milliseconds (default: no timeout)
   * @returns Information about the received funds
   * @throws Error if timeout expires without receiving funds
   */
  async waitForIncomingFunds(timeoutMs?: number): Promise<IncomingFundsEvent> {
    let stopSubscription: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const fundsPromise = new Promise<IncomingFunds>((resolve, reject) => {
      this.wallet
        .notifyIncomingFunds((funds) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(funds);
        })
        .then((stop) => {
          stopSubscription = stop;
          if (settled) {
            stop();
          }
        })
        .catch((error) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        });

      if (timeoutMs !== undefined) {
        timeoutId = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          reject(new Error("Timeout waiting for incoming funds"));
        }, timeoutMs);
      }
    });

    let result: IncomingFunds;
    try {
      result = await fundsPromise;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (stopSubscription) {
        stopSubscription();
      }
    }

    if (result.type === "utxo") {
      return {
        type: "utxo",
        amount: result.coins.reduce((sum, coin) => sum + coin.value, 0),
        ids: result.coins.map((coin) => `${coin.txid}:${coin.vout}`),
      };
    } else {
      return {
        type: "vtxo",
        amount: result.newVtxos.reduce((sum, vtxo) => sum + vtxo.value, 0),
        ids: result.newVtxos.map((vtxo) => `${vtxo.txid}:${vtxo.vout}`),
      };
    }
  }

  /**
   * Get paid on-chain: Convert received on-chain BTC to off-chain.
   *
   * Use this after receiving on-chain Bitcoin to your boarding address.
   * This converts boarding UTXOs into VTXOs through a cooperative
   * settlement with the Ark server. After onboarding, funds are
   * available for instant off-chain transactions.
   *
   * Flow: Someone pays you on-chain → funds arrive at boarding address → onboard → funds available off-chain
   *
   * @param params - Onboard parameters
   * @returns Result containing the commitment transaction ID
   * @throws Error if no boarding UTXOs are available or fees exceed value
   *
   * @example
   * ```typescript
   * // Step 1: Give your boarding address to receive on-chain payment
   * const boardingAddress = await bitcoinSkill.getBoardingAddress();
   *
   * // Step 2: After receiving payment, onboard the funds
   * const arkInfo = await arkProvider.getInfo();
   * const result = await bitcoinSkill.onboard({
   *   feeInfo: arkInfo.feeInfo,
   *   eventCallback: (event) => console.log("Settlement event:", event.type),
   * });
   * console.log("Onboarded! Commitment:", result.commitmentTxid);
   * ```
   */
  async onboard(params: OnboardParams): Promise<RampResult> {
    const boardingUtxos = await this.wallet.getBoardingUtxos();
    const totalBefore = boardingUtxos.reduce(
      (sum, utxo) => sum + BigInt(utxo.value),
      0n,
    );

    const commitmentTxid = await this.ramps.onboard(
      params.feeInfo,
      undefined,
      params.amount,
      params.eventCallback,
    );

    const amount = params.amount ?? totalBefore;

    return {
      commitmentTxid,
      amount,
    };
  }

  /**
   * Pay on-chain: Send off-chain BTC to any on-chain Bitcoin address.
   *
   * Use this to pay someone who needs on-chain Bitcoin. This performs a
   * collaborative exit, converting your VTXOs back to regular on-chain
   * Bitcoin UTXOs at the recipient's destination address.
   *
   * Flow: You have off-chain funds → offboard to recipient's on-chain address → they receive on-chain BTC
   *
   * @param params - Offboard parameters including destination address
   * @returns Result containing the commitment transaction ID
   * @throws Error if no VTXOs are available or fees exceed value
   *
   * @example
   * ```typescript
   * // Pay someone at an on-chain Bitcoin address
   * const arkInfo = await arkProvider.getInfo();
   * const result = await bitcoinSkill.offboard({
   *   destinationAddress: "bc1q...", // recipient's on-chain address
   *   feeInfo: arkInfo.feeInfo,
   *   eventCallback: (event) => console.log("Settlement event:", event.type),
   * });
   * console.log("Paid on-chain! Commitment:", result.commitmentTxid);
   * ```
   */
  async offboard(params: OffboardParams): Promise<RampResult> {
    const vtxos = await this.wallet.getVtxos({ withRecoverable: true });
    const totalBefore = vtxos.reduce(
      (sum, vtxo) => sum + BigInt(vtxo.value),
      0n,
    );

    const commitmentTxid = await this.ramps.offboard(
      params.destinationAddress,
      params.feeInfo,
      params.amount,
      params.eventCallback,
    );

    const amount = params.amount ?? totalBefore;

    return {
      commitmentTxid,
      amount,
    };
  }

  /**
   * Get the underlying wallet instance.
   *
   * Use this for advanced operations not covered by the skill interface.
   *
   * @returns The wallet instance
   */
  getWallet(): Wallet {
    return this.wallet;
  }

  /**
   * Get detailed information about available VTXOs.
   *
   * @param filter - Optional filter for VTXO types to include
   * @returns Array of extended virtual coins with full details
   */
  async getVtxos(filter?: {
    withRecoverable?: boolean;
    withUnrolled?: boolean;
  }): Promise<ExtendedVirtualCoin[]> {
    return this.wallet.getVtxos(filter);
  }

  /**
   * Get detailed information about boarding UTXOs.
   *
   * @returns Array of extended coins with full details
   */
  async getBoardingUtxos(): Promise<ExtendedCoin[]> {
    return this.wallet.getBoardingUtxos();
  }
}

/**
 * Create an ArkadeBitcoinSkill from a wallet.
 *
 * This is a convenience function for creating the skill.
 *
 * @param wallet - The Arkade wallet to use
 * @returns A new ArkadeBitcoinSkill instance
 */
export function createArkadeBitcoinSkill(wallet: Wallet): ArkadeBitcoinSkill {
  return new ArkadeBitcoinSkill(wallet);
}
