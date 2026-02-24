/**
 * LendaSwapSkill - Swap USDC/USDT from/to Arkade via LendaSwap.
 *
 * Uses the @lendasat/lendaswap-sdk-pure SDK for non-custodial
 * BTC/stablecoin atomic swaps via HTLCs.
 *
 * @module skills/lendaswap
 */

import type { Wallet } from "@arkade-os/sdk";
import {
  Client,
  InMemoryWalletStorage,
  InMemorySwapStorage,
  type WalletStorage,
  type SwapStorage as LendaSwapStorage,
  type SwapStatus as LendaSwapStatus,
  type TokenInfo,
  type Chain,
  BTC_ARKADE_INFO,
} from "@lendasat/lendaswap-sdk-pure";
import type {
  StablecoinSwapSkill,
  StablecoinToken,
  BtcToStablecoinParams,
  StablecoinToBtcParams,
  StablecoinSwapResult,
  StablecoinSwapInfo,
  StablecoinSwapStatus,
  StablecoinQuote,
  StablecoinPair,
  EvmFundingCallData,
  EvmRefundCallData,
  ClaimSwapResult,
  RefundSwapResult,
  EvmChain,
} from "./types";

/**
 * Token decimals for stablecoins.
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  usdc_pol: 6,
  usdc_eth: 6,
  usdc_arb: 6,
  usdt0_pol: 6,
  usdt_eth: 6,
  usdt_arb: 6,
};

/**
 * Map our EvmChain names to SDK numeric chain IDs.
 */
const EVM_CHAIN_IDS: Record<EvmChain, number> = {
  polygon: 137,
  ethereum: 1,
  arbitrum: 42161,
};

/**
 * Map our EvmChain names to SDK Chain values.
 */
const EVM_CHAIN_MAP: Record<EvmChain, Chain> = {
  polygon: "137",
  ethereum: "1",
  arbitrum: "42161",
};

/**
 * Map SDK swap status to our simplified status.
 */
export function mapSwapStatus(
  sdkStatus: LendaSwapStatus,
): StablecoinSwapStatus {
  switch (sdkStatus) {
    case "pending":
      return "pending";
    case "clientfundingseen":
    case "clientfunded":
      return "funded";
    case "serverfunded":
    case "clientredeeming":
      return "processing";
    case "clientredeemed":
    case "serverredeemed":
    case "clientredeemedandclientrefunded":
      return "completed";
    case "expired":
    case "clientfundedtoolate":
      return "expired";
    case "clientrefunded":
    case "clientfundedserverrefunded":
    case "clientrefundedserverfunded":
    case "clientrefundedserverrefunded":
      return "refunded";
    case "clientinvalidfunded":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * Check if a status is terminal (no longer active).
 */
export function isTerminalStatus(status: StablecoinSwapStatus): boolean {
  return (
    status === "completed" ||
    status === "expired" ||
    status === "refunded" ||
    status === "failed"
  );
}

/**
 * Extract a display-friendly token string from a TokenInfo object.
 */
function tokenInfoToString(token: TokenInfo): string {
  const chainNames: Record<string, string> = {
    "137": "pol",
    "1": "eth",
    "42161": "arb",
    Arkade: "arkade",
    Lightning: "lightning",
    Bitcoin: "btc",
  };
  const chain = chainNames[token.chain] ?? token.chain;
  if (token.token_id === "btc") return `btc_${chain}`;
  return `${token.symbol.toLowerCase()}_${chain}`;
}

/**
 * Configuration for the LendaSwapSkill.
 */
export interface LendaSwapSkillConfig {
  /** The Arkade wallet to use */
  wallet: Wallet;
  /** Optional API key */
  apiKey?: string;
  /** Optional custom API base URL */
  apiUrl?: string;
  /** Optional Esplora URL for Bitcoin queries */
  esploraUrl?: string;
  /** Optional Arkade server URL */
  arkadeServerUrl?: string;
  /** Optional mnemonic for LendaSwap HD wallet (for persistence across sessions) */
  mnemonic?: string;
  /** Optional referral code for fee discounts */
  referralCode?: string;
  /** Optional custom wallet storage (default: InMemoryWalletStorage) */
  walletStorage?: WalletStorage;
  /** Optional custom swap storage (default: InMemorySwapStorage) */
  swapStorage?: LendaSwapStorage;
}

/**
 * LendaSwapSkill provides stablecoin swap capabilities for Arkade wallets
 * using the LendaSwap SDK for non-custodial atomic swaps.
 *
 * @example
 * ```typescript
 * const lendaswap = new LendaSwapSkill({ wallet });
 *
 * // Get a quote
 * const quote = await lendaswap.getQuoteBtcToStablecoin(100000, "usdc_pol");
 *
 * // Create a swap (BTC → USDC)
 * const result = await lendaswap.swapBtcToStablecoin({
 *   targetAddress: "0x...",
 *   targetToken: "usdc_pol",
 *   targetChain: "polygon",
 *   sourceAmount: 100000,
 * });
 *
 * // Fund the VHTLC address from your Arkade wallet, then claim
 * const claim = await lendaswap.claimSwap(result.swapId);
 * ```
 */
export class LendaSwapSkill implements StablecoinSwapSkill {
  readonly name = "lendaswap";
  readonly description =
    "Swap USDC/USDT from/to Arkade via LendaSwap non-custodial exchange";
  readonly version = "2.0.0";

  private readonly wallet: Wallet;
  private readonly referralCode?: string;
  private readonly config: LendaSwapSkillConfig;
  private client: Client | null = null;
  private tokenCache: Map<string, TokenInfo> | null = null;

  constructor(config: LendaSwapSkillConfig) {
    this.wallet = config.wallet;
    this.referralCode = config.referralCode;
    this.config = config;
  }

  /**
   * Get or create the LendaSwap SDK client (lazy initialization).
   */
  private async getClient(): Promise<Client> {
    if (this.client) return this.client;

    const builder = Client.builder()
      .withSignerStorage(
        this.config.walletStorage || new InMemoryWalletStorage(),
      )
      .withSwapStorage(this.config.swapStorage || new InMemorySwapStorage());

    if (this.config.apiUrl) {
      builder.withBaseUrl(this.config.apiUrl);
    }
    if (this.config.apiKey) {
      builder.withApiKey(this.config.apiKey);
    }
    if (this.config.esploraUrl) {
      builder.withEsploraUrl(this.config.esploraUrl);
    }
    if (this.config.arkadeServerUrl) {
      builder.withArkadeServerUrl(this.config.arkadeServerUrl);
    }
    if (this.config.mnemonic) {
      builder.withMnemonic(this.config.mnemonic);
    }

    this.client = await builder.build();
    return this.client;
  }

  /**
   * Resolve an EVM token by looking up available tokens from the API.
   * Caches the result for subsequent calls.
   */
  private async resolveEvmToken(
    token: StablecoinToken,
    chain: EvmChain,
  ): Promise<TokenInfo> {
    if (!this.tokenCache) {
      const client = await this.getClient();
      const tokens = await client.getTokens();
      this.tokenCache = new Map();
      for (const t of [...tokens.btc_tokens, ...tokens.evm_tokens]) {
        const key = tokenInfoToString(t);
        this.tokenCache.set(key, t);
      }
    }

    // Build the lookup key matching our StablecoinToken naming convention
    const info = this.tokenCache.get(token);
    if (info) return info;

    // Fallback: search by symbol and chain
    const sdkChain = EVM_CHAIN_MAP[chain];
    const symbol = token.replace(/_(?:pol|eth|arb)$/, "").toUpperCase();
    for (const t of this.tokenCache.values()) {
      if (t.chain === sdkChain && t.symbol.toUpperCase() === symbol) {
        return t;
      }
    }

    throw new Error(`Token ${token} on ${chain} not found in available tokens`);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.healthCheck();
      return result === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Get the LendaSwap mnemonic for persistence across sessions.
   */
  async getMnemonic(): Promise<string> {
    const client = await this.getClient();
    return client.getMnemonic();
  }

  /**
   * Get the API version info.
   */
  async getVersion(): Promise<{ tag: string; commit_hash: string }> {
    const client = await this.getClient();
    return client.getVersion();
  }

  async getQuoteBtcToStablecoin(
    sourceAmount: number,
    targetToken: StablecoinToken,
  ): Promise<StablecoinQuote> {
    const client = await this.getClient();
    const chain = this.chainFromToken(targetToken);
    const evmToken = await this.resolveEvmToken(targetToken, chain);

    const quote = await client.getQuote({
      sourceChain: "Arkade",
      sourceToken: "btc",
      targetChain: EVM_CHAIN_MAP[chain],
      targetToken: evmToken.token_id,
      sourceAmount,
    });

    const rate = parseFloat(quote.exchange_rate);
    const netSats = sourceAmount - quote.protocol_fee - quote.network_fee;
    const targetAmount = (netSats / 1e8) * rate;

    return {
      sourceToken: "btc_arkade",
      targetToken,
      sourceAmount,
      targetAmount,
      exchangeRate: rate,
      fee: {
        amount: quote.protocol_fee + quote.network_fee,
        percentage: quote.protocol_fee_rate * 100,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
  }

  async getQuoteStablecoinToBtc(
    sourceAmount: number,
    sourceToken: StablecoinToken,
  ): Promise<StablecoinQuote> {
    const client = await this.getClient();
    const chain = this.chainFromToken(sourceToken);
    const evmToken = await this.resolveEvmToken(sourceToken, chain);

    const quote = await client.getQuote({
      sourceChain: EVM_CHAIN_MAP[chain],
      sourceToken: evmToken.token_id,
      targetChain: "Arkade",
      targetToken: "btc",
      sourceAmount,
    });

    const rate = parseFloat(quote.exchange_rate);
    const grossSats = (sourceAmount / rate) * 1e8;
    const targetAmount = grossSats - quote.protocol_fee - quote.network_fee;

    return {
      sourceToken,
      targetToken: "btc_arkade",
      sourceAmount,
      targetAmount: Math.max(0, Math.floor(targetAmount)),
      exchangeRate: rate,
      fee: {
        amount: quote.protocol_fee + quote.network_fee,
        percentage: quote.protocol_fee_rate * 100,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
  }

  async swapBtcToStablecoin(
    params: BtcToStablecoinParams,
  ): Promise<StablecoinSwapResult> {
    const client = await this.getClient();
    const evmToken = await this.resolveEvmToken(
      params.targetToken,
      params.targetChain,
    );

    const result = await client.createArkadeToEvmSwapGeneric({
      targetAddress: params.targetAddress,
      tokenAddress: evmToken.token_id,
      evmChainId: EVM_CHAIN_IDS[params.targetChain],
      sourceAmount:
        params.sourceAmount != null ? BigInt(params.sourceAmount) : undefined,
      targetAmount:
        params.targetAmount != null ? BigInt(params.targetAmount) : undefined,
      referralCode: params.referralCode || this.referralCode,
    });

    const resp = result.response;

    // Auto-fund the VHTLC by sending BTC from the Arkade wallet
    const fundingTxid = await this.wallet.sendBitcoin({
      address: resp.btc_vhtlc_address,
      amount: resp.source_amount,
    });

    const exchangeRate =
      resp.source_amount > 0 && resp.target_amount > 0
        ? resp.target_amount / (resp.source_amount / 1e8)
        : 0;

    return {
      swapId: resp.id,
      status: "funded",
      sourceAmount: resp.source_amount,
      targetAmount: resp.target_amount,
      exchangeRate,
      fee: {
        amount: resp.fee_sats,
        percentage:
          resp.source_amount > 0
            ? (resp.fee_sats / resp.source_amount) * 100
            : 0,
      },
      expiresAt: new Date(resp.vhtlc_refund_locktime * 1000),
      paymentDetails: { address: resp.btc_vhtlc_address },
      htlcAddressEvm: resp.evm_htlc_address,
      fundingTxid,
    };
  }

  async swapStablecoinToBtc(
    params: StablecoinToBtcParams,
  ): Promise<StablecoinSwapResult> {
    const client = await this.getClient();
    const arkAddress = params.targetAddress || (await this.wallet.getAddress());
    const evmToken = await this.resolveEvmToken(
      params.sourceToken,
      params.sourceChain,
    );

    const result = await client.createEvmToArkadeSwapGeneric({
      tokenAddress: evmToken.token_id,
      evmChainId: EVM_CHAIN_IDS[params.sourceChain],
      sourceAmount:
        params.sourceAmount != null ? BigInt(params.sourceAmount) : undefined,
      targetAddress: arkAddress,
      userAddress:
        params.userAddress || "0x0000000000000000000000000000000000000000",
      referralCode: params.referralCode || this.referralCode,
    });

    const resp = result.response;

    const exchangeRate =
      resp.source_amount > 0 && resp.target_amount > 0
        ? (resp.source_amount / resp.target_amount) * 1e8
        : 0;

    return {
      swapId: resp.id,
      status: mapSwapStatus(resp.status),
      sourceAmount: resp.source_amount,
      targetAmount: resp.target_amount,
      exchangeRate,
      fee: {
        amount: resp.fee_sats,
        percentage:
          resp.source_amount > 0
            ? (resp.fee_sats / resp.target_amount) * 100
            : 0,
      },
      expiresAt: new Date(resp.evm_refund_locktime * 1000),
      paymentDetails: {
        address: resp.evm_htlc_address,
        callData: resp.source_token.token_id,
      },
      htlcAddressEvm: resp.evm_htlc_address,
    };
  }

  async getSwapStatus(swapId: string): Promise<StablecoinSwapInfo> {
    const client = await this.getClient();
    const data = await client.getSwap(swapId, { updateStorage: true });

    const direction =
      data.direction === "evm_to_arkade" || data.direction === "evm_to_bitcoin"
        ? ("stablecoin_to_btc" as const)
        : ("btc_to_stablecoin" as const);

    const status = mapSwapStatus(data.status);

    const exchangeRate =
      data.source_amount > 0 && data.target_amount > 0
        ? direction === "btc_to_stablecoin"
          ? data.target_amount / (data.source_amount / 1e8)
          : (data.source_amount / data.target_amount) * 1e8
        : 0;

    return {
      id: swapId,
      direction,
      status,
      sourceToken: tokenInfoToString(data.source_token),
      targetToken: tokenInfoToString(data.target_token),
      sourceAmount: data.source_amount,
      targetAmount: data.target_amount,
      exchangeRate,
      createdAt: new Date(data.created_at),
      completedAt: status === "completed" ? new Date() : undefined,
      txid:
        ("evm_claim_txid" in data ? data.evm_claim_txid : undefined) ??
        undefined,
    };
  }

  async getPendingSwaps(): Promise<StablecoinSwapInfo[]> {
    const client = await this.getClient();
    const allSwaps = await client.listAllSwaps();

    const pending: StablecoinSwapInfo[] = [];
    for (const stored of allSwaps) {
      const status = mapSwapStatus(stored.response.status);
      if (!isTerminalStatus(status)) {
        try {
          const info = await this.getSwapStatus(stored.swapId);
          pending.push(info);
        } catch {
          pending.push(this.storedSwapToInfo(stored));
        }
      }
    }
    return pending;
  }

  async getSwapHistory(): Promise<StablecoinSwapInfo[]> {
    const client = await this.getClient();
    const allSwaps = await client.listAllSwaps();

    return allSwaps
      .map((stored) => this.storedSwapToInfo(stored))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAvailablePairs(): Promise<StablecoinPair[]> {
    const client = await this.getClient();
    const tokens = await client.getTokens();

    // Build pairs: each BTC token can be paired with each EVM token
    const pairs: StablecoinPair[] = [];
    for (const btc of tokens.btc_tokens) {
      for (const evm of tokens.evm_tokens) {
        pairs.push({
          from: tokenInfoToString(btc),
          to: tokenInfoToString(evm),
          minAmount: 0,
          maxAmount: 0,
          feePercentage: 0,
        });
        pairs.push({
          from: tokenInfoToString(evm),
          to: tokenInfoToString(btc),
          minAmount: 0,
          maxAmount: 0,
          feePercentage: 0,
        });
      }
    }
    return pairs;
  }

  async claimSwap(swapId: string): Promise<ClaimSwapResult> {
    const client = await this.getClient();
    const result = await client.claim(swapId);

    return {
      success: result.success,
      message: result.message,
      txHash: result.txHash,
      chain: result.chain,
    };
  }

  async refundSwap(
    swapId: string,
    options?: { destinationAddress?: string },
  ): Promise<RefundSwapResult> {
    const client = await this.getClient();
    const data = await client.getSwap(swapId, { updateStorage: true });

    // For EVM→Arkade swaps, the refund happens on the EVM side
    if (
      data.direction === "evm_to_arkade" ||
      data.direction === "evm_to_bitcoin"
    ) {
      return {
        success: false,
        message:
          "This is an EVM→BTC swap. Use getEvmRefundCallData() to get the EVM refund transaction data.",
      };
    }

    // Auto-derive destination address if not provided
    let destinationAddress = options?.destinationAddress;
    if (!destinationAddress) {
      if (
        data.source_token.token_id === "btc" &&
        data.source_token.chain === "Arkade"
      ) {
        destinationAddress = await this.wallet.getAddress();
      } else {
        destinationAddress = await this.wallet.getBoardingAddress();
      }
    }

    const result = await client.refundSwap(swapId, {
      destinationAddress: destinationAddress!,
    });

    return {
      success: result.success,
      message: result.message,
      txId: result.txId,
      refundAmount: result.refundAmount
        ? Number(result.refundAmount)
        : undefined,
    };
  }

  async getEvmFundingCallData(
    swapId: string,
    _tokenDecimals: number,
  ): Promise<EvmFundingCallData> {
    const client = await this.getClient();
    const data = await client.getCoordinatorFundingCallData(swapId);
    return {
      approve: { to: data.approve.to, data: data.approve.data },
      createSwap: {
        to: data.executeAndCreate.to,
        data: data.executeAndCreate.data,
      },
    };
  }

  async getEvmRefundCallData(swapId: string): Promise<EvmRefundCallData> {
    const client = await this.getClient();
    const result = await client.refundSwap(swapId);

    if (!result.evmRefundData) {
      throw new Error(
        "No EVM refund data available for this swap. " +
          "The swap may not be an EVM-funded swap or the timelock has not expired.",
      );
    }

    return {
      to: result.evmRefundData.to,
      data: result.evmRefundData.data,
      timelockExpired: result.evmRefundData.timelockExpired,
      timelockExpiry: result.evmRefundData.timelockExpiry,
    };
  }

  /**
   * Get the underlying wallet instance.
   */
  getWallet(): Wallet {
    return this.wallet;
  }

  /**
   * Get token decimals for a stablecoin.
   */
  getTokenDecimals(token: StablecoinToken): number {
    return TOKEN_DECIMALS[token] || 6;
  }

  /**
   * Derive EvmChain from a StablecoinToken name.
   */
  private chainFromToken(token: StablecoinToken): EvmChain {
    if (token.endsWith("_pol")) return "polygon";
    if (token.endsWith("_eth")) return "ethereum";
    if (token.endsWith("_arb")) return "arbitrum";
    return "polygon";
  }

  /**
   * Convert a StoredSwap to StablecoinSwapInfo.
   */
  private storedSwapToInfo(stored: {
    swapId: string;
    response: {
      status: LendaSwapStatus;
      source_token: TokenInfo;
      target_token: TokenInfo;
      source_amount: number;
      target_amount: number;
      created_at: string;
      direction: string;
    };
  }): StablecoinSwapInfo {
    const resp = stored.response;
    const direction =
      resp.direction === "evm_to_arkade" || resp.direction === "evm_to_bitcoin"
        ? ("stablecoin_to_btc" as const)
        : ("btc_to_stablecoin" as const);

    const status = mapSwapStatus(resp.status);
    const exchangeRate =
      resp.source_amount > 0 && resp.target_amount > 0
        ? direction === "btc_to_stablecoin"
          ? resp.target_amount / (resp.source_amount / 1e8)
          : (resp.source_amount / resp.target_amount) * 1e8
        : 0;

    return {
      id: stored.swapId,
      direction,
      status,
      sourceToken: tokenInfoToString(resp.source_token),
      targetToken: tokenInfoToString(resp.target_token),
      sourceAmount: resp.source_amount,
      targetAmount: resp.target_amount,
      exchangeRate,
      createdAt: new Date(resp.created_at),
      completedAt: status === "completed" ? new Date() : undefined,
    };
  }
}

/**
 * Create a LendaSwapSkill from a wallet.
 */
export function createLendaSwapSkill(
  wallet: Wallet,
  options?: Partial<Omit<LendaSwapSkillConfig, "wallet">>,
): LendaSwapSkill {
  return new LendaSwapSkill({
    wallet,
    ...options,
  });
}
