import { agentGuildChainId } from "./networkConfig";
import { normalizeWallet } from "./workflowTypes";

function normalizeCacheSuffix(value: string | number) {
  return String(value).trim();
}

export function getWalletCacheKey(
  prefix: string,
  wallet?: string | null
) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) {
    return null;
  }

  return `${prefix}:${agentGuildChainId}:${normalizedWallet}`;
}

export function getContractCacheKey(
  prefix: string,
  input: {
    wallet?: string | null;
    contractId?: string | null;
  }
) {
  const walletKey = getWalletCacheKey(prefix, input.wallet);
  const contractId = input.contractId?.trim();

  if (!walletKey || !contractId) {
    return null;
  }

  return `${walletKey}:${normalizeCacheSuffix(contractId)}`;
}

export function getProjectCacheKey(
  prefix: string,
  input: {
    wallet?: string | null;
    projectId?: number | null;
  }
) {
  const walletKey = getWalletCacheKey(prefix, input.wallet);

  if (
    !walletKey ||
    typeof input.projectId !== "number" ||
    !Number.isInteger(input.projectId) ||
    input.projectId < 1
  ) {
    return null;
  }

  return `${walletKey}:${normalizeCacheSuffix(input.projectId)}`;
}
