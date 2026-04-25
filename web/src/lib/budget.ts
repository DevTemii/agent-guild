import { parseUnits } from "viem";

export type DisplayBudget = {
  amount: number;
  currency: "USD";
  label: string;
};

type ParsedUsdAmount = {
  normalized: string;
  amount: number;
  cents: bigint;
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

export function validateUsdAmountInput(value: string) {
  const normalized = value.trim();

  if (!normalized) return "Enter a contract value in USD.";
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return "Contract value must use plain decimal format.";
  }

  const fraction = normalized.split(".")[1];
  if (fraction && fraction.length > 2) {
    return "Contract value supports up to 2 decimal places.";
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const cents = BigInt(wholePart) * 100n + BigInt((fractionalPart + "00").slice(0, 2));

  if (cents <= 0n) {
    return "Contract value must be greater than zero.";
  }

  return null;
}

export function parseUsdAmountInput(value: string): ParsedUsdAmount {
  const normalized = value.trim();
  const validationError = validateUsdAmountInput(normalized);

  if (validationError) {
    throw new Error(validationError);
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const normalizedFraction = (fractionalPart + "00").slice(0, 2);
  const cents = BigInt(wholePart) * 100n + BigInt(normalizedFraction);

  return {
    normalized:
      normalizedFraction === "00"
        ? wholePart
        : `${wholePart}.${normalizedFraction}`,
    amount: Number(cents) / 100,
    cents,
  };
}

export function buildDisplayBudgetFromInput(value: string): DisplayBudget {
  return buildDisplayBudget(parseUsdAmountInput(value).amount);
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

export function validateWorkflowChallengeAmountInput(value: string) {
  const normalized = value.trim();

  if (!normalized) return "Enter an amount before creating the deal.";
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return "Amount must use plain decimal format.";
  }

  const fraction = normalized.split(".")[1];
  if (fraction && fraction.length > 18) {
    return "Amount supports up to 18 decimal places.";
  }

  try {
    if (parseUnits(normalized, 18) <= 0n) {
      return "Amount must be greater than zero.";
    }
  } catch {
    return "Amount is not a valid decimal value.";
  }

  return null;
}

export function parseWorkflowChallengeAmountToWei(value: string) {
  return parseUnits(value.trim(), 18);
}
