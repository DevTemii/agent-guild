import { parseUnits } from "viem";

export type DisplayBudget = {
  amount: number;
  currency: "USD";
  label: string;
};

export function formatUsdAmount(amount: number) {
  const hasDecimals = !Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function buildDisplayBudget(amount: number): DisplayBudget {
  return {
    amount,
    currency: "USD",
    label: formatUsdAmount(amount),
  };
}

export function formatDisplayBudget(displayBudget: DisplayBudget) {
  return displayBudget.label || formatUsdAmount(displayBudget.amount);
}

export function formatSettlementAmountCelo(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? `${normalized} CELO` : "Not set";
}

export function validateSettlementAmountCelo(value: string) {
  const normalized = value.trim();

  if (!normalized) return "Enter a settlement amount in CELO.";
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return "Settlement amount must use plain decimal format.";
  }

  const fraction = normalized.split(".")[1];
  if (fraction && fraction.length > 18) {
    return "Settlement amount supports up to 18 decimal places.";
  }

  try {
    if (parseUnits(normalized, 18) <= 0n) {
      return "Settlement amount must be greater than zero.";
    }
  } catch {
    return "Settlement amount is not a valid CELO value.";
  }

  return null;
}

export function parseSettlementAmountCeloToWei(value: string) {
  return parseUnits(value.trim(), 18);
}
