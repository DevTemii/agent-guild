import { parseUnits } from "viem";
import { buildDisplayBudget, type DisplayBudget } from "./budget";

export type ContractStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "funded"
  | "submitted"
  | "completed";

export type ContractMilestone = {
  title: string;
  amount: number;
};

export type ProductContract = {
  id: string;
  amount: string;
  amountWei: string;
  clientWallet: string;
  clientName: string;
  freelancerWallet: string;
  freelancerName: string;
  linkedProjectId?: number | null;
  projectBrief: string;
  displayBudget: DisplayBudget;
  settlementAmountCelo: string | null;
  summary: string;
  milestones: ContractMilestone[];
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
};

export type LegacyProductContract = Omit<
  ProductContract,
  "displayBudget" | "settlementAmountCelo"
> & {
  budget?: number;
  amount?: string;
  amountWei?: string;
  displayBudget?: DisplayBudget;
  settlementAmountCelo?: string | null;
};

export type WorkflowNotification = {
  id: string;
  wallet: string;
  message: string;
  createdAt: string;
};

export type ProjectSubmission = {
  projectId: number;
  clientWallet: string;
  freelancerWallet: string;
  deliveryUrl: string;
  submittedAt: string;
  updatedAt: string;
  txHash: string | null;
};

export type WorkflowProjectIndexEntry = {
  projectId: number;
  contractId: string | null;
  clientWallet: string;
  freelancerWallet: string;
  createdAt: string;
  updatedAt: string;
};

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeWallet(wallet?: string | null) {
  return wallet?.trim().toLowerCase() ?? "";
}

export function normalizeLinkedProjectId(projectId?: number | null) {
  if (typeof projectId !== "number" || !Number.isInteger(projectId) || projectId < 1) {
    return null;
  }

  return projectId;
}

export function normalizeSettlementAmountCelo(settlementAmountCelo?: string | null) {
  const normalized = settlementAmountCelo?.trim();
  return normalized ? normalized : null;
}

export function normalizeDisplayBudget(contract: LegacyProductContract) {
  if (contract.displayBudget) {
    return {
      amount: contract.displayBudget.amount,
      currency: "USD" as const,
      label:
        contract.displayBudget.label ||
        buildDisplayBudget(contract.displayBudget.amount).label,
    };
  }

  return buildDisplayBudget(contract.budget ?? 0);
}

export function normalizeContract(contract: LegacyProductContract): ProductContract {
  const normalizedAmount = contract.amount?.trim() || "0";
  const normalizedAmountWei =
    contract.amountWei?.trim() ||
    (() => {
      try {
        return parseUnits(normalizedAmount, 18).toString();
      } catch {
        return "0";
      }
    })();

  return {
    ...contract,
    amount: normalizedAmount,
    amountWei: normalizedAmountWei,
    clientWallet: normalizeWallet(contract.clientWallet),
    freelancerWallet: normalizeWallet(contract.freelancerWallet),
    linkedProjectId: normalizeLinkedProjectId(contract.linkedProjectId),
    displayBudget: normalizeDisplayBudget(contract),
    settlementAmountCelo: normalizeSettlementAmountCelo(
      contract.settlementAmountCelo
    ),
  };
}

export function normalizeNotification(
  notification: Omit<WorkflowNotification, "wallet"> & {
    wallet?: string | null;
  }
): WorkflowNotification | null {
  const wallet = normalizeWallet(notification.wallet);
  if (!wallet) {
    return null;
  }

  return {
    ...notification,
    wallet,
  };
}

export function normalizeProjectSubmission(
  submission: Omit<ProjectSubmission, "projectId" | "clientWallet" | "freelancerWallet"> & {
    projectId?: number | null;
    clientWallet?: string | null;
    freelancerWallet?: string | null;
    deliveryUrl?: string | null;
    txHash?: string | null;
  }
): ProjectSubmission | null {
  const projectId = normalizeLinkedProjectId(submission.projectId);
  const clientWallet = normalizeWallet(submission.clientWallet);
  const freelancerWallet = normalizeWallet(submission.freelancerWallet);
  const deliveryUrl = submission.deliveryUrl?.trim() ?? "";

  if (!projectId || !clientWallet || !freelancerWallet || !deliveryUrl) {
    return null;
  }

  return {
    projectId,
    clientWallet,
    freelancerWallet,
    deliveryUrl,
    submittedAt: submission.submittedAt || nowIso(),
    updatedAt: submission.updatedAt || nowIso(),
    txHash: submission.txHash?.trim() || null,
  };
}

export function normalizeWorkflowProjectIndexEntry(
  entry: Partial<WorkflowProjectIndexEntry> & {
    projectId?: number | null;
    contractId?: string | null;
    clientWallet?: string | null;
    freelancerWallet?: string | null;
  }
): WorkflowProjectIndexEntry | null {
  const projectId = normalizeLinkedProjectId(entry.projectId);
  const clientWallet = normalizeWallet(entry.clientWallet);
  const freelancerWallet = normalizeWallet(entry.freelancerWallet);

  if (!projectId || !clientWallet || !freelancerWallet) {
    return null;
  }

  return {
    projectId,
    contractId: entry.contractId?.trim() || null,
    clientWallet,
    freelancerWallet,
    createdAt: entry.createdAt || nowIso(),
    updatedAt: entry.updatedAt || nowIso(),
  };
}
