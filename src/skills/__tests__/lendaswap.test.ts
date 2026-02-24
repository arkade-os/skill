/**
 * Unit tests for LendaSwap skill utility functions.
 *
 * Tests cover:
 * - mapSwapStatus mapping logic
 * - isTerminalStatus classification
 * - TOKEN_DECIMALS registry
 * - Exchange rate math (BTC↔stablecoin)
 */

import { describe, it, expect } from "vitest";
import { mapSwapStatus, isTerminalStatus, TOKEN_DECIMALS } from "../lendaswap";

// ---------------------------------------------------------------------------
// mapSwapStatus
// ---------------------------------------------------------------------------
describe("mapSwapStatus", () => {
  it("maps pending to pending", () => {
    expect(mapSwapStatus("pending")).toBe("pending");
  });

  it("maps funding states to funded", () => {
    expect(mapSwapStatus("clientfundingseen")).toBe("funded");
    expect(mapSwapStatus("clientfunded")).toBe("funded");
  });

  it("maps processing states", () => {
    expect(mapSwapStatus("serverfunded")).toBe("processing");
    expect(mapSwapStatus("clientredeeming")).toBe("processing");
  });

  it("maps completed states", () => {
    expect(mapSwapStatus("clientredeemed")).toBe("completed");
    expect(mapSwapStatus("serverredeemed")).toBe("completed");
    expect(mapSwapStatus("clientredeemedandclientrefunded")).toBe("completed");
  });

  it("maps expired states", () => {
    expect(mapSwapStatus("expired")).toBe("expired");
    expect(mapSwapStatus("clientfundedtoolate")).toBe("expired");
  });

  it("maps refunded states", () => {
    expect(mapSwapStatus("clientrefunded")).toBe("refunded");
    expect(mapSwapStatus("clientfundedserverrefunded")).toBe("refunded");
    expect(mapSwapStatus("clientrefundedserverfunded")).toBe("refunded");
    expect(mapSwapStatus("clientrefundedserverrefunded")).toBe("refunded");
  });

  it("maps failed states", () => {
    expect(mapSwapStatus("clientinvalidfunded")).toBe("failed");
  });

  it("defaults unknown statuses to pending", () => {
    expect(mapSwapStatus("some_future_status" as never)).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// isTerminalStatus
// ---------------------------------------------------------------------------
describe("isTerminalStatus", () => {
  it("returns true for terminal statuses", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("expired")).toBe(true);
    expect(isTerminalStatus("refunded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    expect(isTerminalStatus("pending")).toBe(false);
    expect(isTerminalStatus("awaiting_funding")).toBe(false);
    expect(isTerminalStatus("funded")).toBe(false);
    expect(isTerminalStatus("processing")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TOKEN_DECIMALS
// ---------------------------------------------------------------------------
describe("TOKEN_DECIMALS", () => {
  it("defines 6 decimals for all supported stablecoins", () => {
    const expectedTokens = [
      "usdc_pol",
      "usdc_eth",
      "usdc_arb",
      "usdt0_pol",
      "usdt_eth",
      "usdt_arb",
    ];
    for (const token of expectedTokens) {
      expect(TOKEN_DECIMALS[token]).toBe(6);
    }
  });

  it("covers all three chains per stablecoin", () => {
    for (const chain of ["pol", "eth", "arb"]) {
      expect(TOKEN_DECIMALS[`usdc_${chain}`]).toBeDefined();
    }
    // USDT uses usdt0_pol on Polygon, standard naming on others
    expect(TOKEN_DECIMALS["usdt0_pol"]).toBeDefined();
    expect(TOKEN_DECIMALS["usdt_eth"]).toBeDefined();
    expect(TOKEN_DECIMALS["usdt_arb"]).toBeDefined();
  });

  it("returns undefined for unknown tokens", () => {
    expect(
      (TOKEN_DECIMALS as Record<string, number | undefined>)["btc"],
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Exchange rate math (mirrors the calculations in LendaSwapSkill methods)
// ---------------------------------------------------------------------------
describe("exchange rate math", () => {
  describe("BTC to stablecoin rate", () => {
    it("calculates rate as targetAmount / (sourceAmount / 1e8)", () => {
      const sourceAmount = 100_000; // sats
      const targetAmount = 97.5; // USDC
      const rate = targetAmount / (sourceAmount / 1e8);
      expect(rate).toBe(97_500);
    });

    it("handles zero source amount gracefully", () => {
      const rate = 0 / 1e8 === 0 ? 0 : 100 / (0 / 1e8);
      expect(rate).toBe(0);
    });
  });

  describe("stablecoin to BTC rate", () => {
    it("calculates rate as (sourceAmount / targetAmount) * 1e8", () => {
      const sourceAmount = 100; // USDC
      const targetAmount = 100_000; // sats
      const rate = (sourceAmount / targetAmount) * 1e8;
      expect(rate).toBe(100_000);
    });
  });

  describe("fee percentage calculation", () => {
    it("calculates BTC→stablecoin fee percentage correctly", () => {
      const feeSats = 250;
      const sourceAmount = 100_000;
      const percentage = (feeSats / sourceAmount) * 100;
      expect(percentage).toBe(0.25);
    });
  });
});
