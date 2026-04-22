import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type ContractStatus,
  type ProjectSubmission,
  type ProductContract,
  type WorkflowNotification,
  normalizeContract,
  normalizeLinkedProjectId,
  normalizeNotification,
  normalizeProjectSubmission,
  normalizeSettlementAmountCelo,
  normalizeWallet,
  nowIso,
} from "@/lib/workflowTypes";

type WorkflowDatabase = {
  contracts: ProductContract[];
  notifications: WorkflowNotification[];
  submissions: ProjectSubmission[];
};

type WorkflowDraftInput = Omit<
  ProductContract,
  "id" | "status" | "createdAt" | "updatedAt"
>;

const WORKFLOW_DB_PATH = path.join(process.cwd(), ".data", "workflow-store.json");
const MAX_NOTIFICATIONS_PER_WALLET = 12;

let writeQueue = Promise.resolve();

async function ensureWorkflowDbDir() {
  await mkdir(path.dirname(WORKFLOW_DB_PATH), { recursive: true });
}

async function readWorkflowDatabase(): Promise<WorkflowDatabase> {
  try {
    const raw = await readFile(WORKFLOW_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkflowDatabase>;

    return {
      contracts: (parsed.contracts ?? []).map(normalizeContract),
      notifications: (parsed.notifications ?? [])
        .map((entry) => normalizeNotification(entry))
        .filter((entry): entry is WorkflowNotification => entry !== null),
      submissions: (parsed.submissions ?? [])
        .map((entry) => normalizeProjectSubmission(entry))
        .filter((entry): entry is ProjectSubmission => entry !== null),
    };
  } catch {
    return {
      contracts: [],
      notifications: [],
      submissions: [],
    };
  }
}

async function writeWorkflowDatabase(database: WorkflowDatabase) {
  await ensureWorkflowDbDir();
  const tempPath = `${WORKFLOW_DB_PATH}.tmp`;
  await writeFile(tempPath, JSON.stringify(database, null, 2), "utf8");
  await rename(tempPath, WORKFLOW_DB_PATH);
}

async function mutateWorkflowDatabase<T>(
  mutate: (database: WorkflowDatabase) => T | Promise<T>
) {
  const nextOperation = writeQueue.then(async () => {
    const database = await readWorkflowDatabase();
    const result = await mutate(database);
    await writeWorkflowDatabase(database);
    return result;
  });

  writeQueue = nextOperation.then(
    () => undefined,
    () => undefined
  );

  return nextOperation;
}

function createNotification(wallet: string, message: string): WorkflowNotification {
  return {
    id: crypto.randomUUID(),
    wallet: normalizeWallet(wallet),
    message,
    createdAt: nowIso(),
  };
}

function appendNotifications(
  database: WorkflowDatabase,
  entries: Array<{ wallet: string; message: string }>
) {
  const normalizedEntries = entries
    .map(({ wallet, message }) => createNotification(wallet, message))
    .filter((entry) => entry.wallet);

  database.notifications = [...normalizedEntries, ...database.notifications];

  const nextNotifications: WorkflowNotification[] = [];
  const counts = new Map<string, number>();

  for (const notification of database.notifications) {
    const currentCount = counts.get(notification.wallet) ?? 0;
    if (currentCount >= MAX_NOTIFICATIONS_PER_WALLET) {
      continue;
    }

    counts.set(notification.wallet, currentCount + 1);
    nextNotifications.push(notification);
  }

  database.notifications = nextNotifications;
}

function requireContractParticipant(contract: ProductContract, wallet: string) {
  const normalizedWallet = normalizeWallet(wallet);
  return (
    contract.clientWallet === normalizedWallet ||
    contract.freelancerWallet === normalizedWallet
  );
}

function requireWalletMatch(actualWallet: string, expectedWallet: string, errorMessage: string) {
  if (normalizeWallet(actualWallet) !== normalizeWallet(expectedWallet)) {
    throw new Error(errorMessage);
  }
}

function requireProjectParticipant(submission: ProjectSubmission, wallet: string) {
  const normalizedWallet = normalizeWallet(wallet);
  if (
    submission.clientWallet !== normalizedWallet &&
    submission.freelancerWallet !== normalizedWallet
  ) {
    throw new Error("Only project participants can access this submission.");
  }
}

function getContractOrThrow(database: WorkflowDatabase, contractId: string) {
  const contract = database.contracts.find((entry) => entry.id === contractId) ?? null;
  if (!contract) {
    throw new Error("Contract not found.");
  }
  return contract;
}

function touchContract(contract: ProductContract) {
  contract.updatedAt = nowIso();
}

export async function listWorkflowStateForWallet(wallet: string) {
  const normalizedWallet = normalizeWallet(wallet);
  const database = await readWorkflowDatabase();

  return {
    contracts: database.contracts
      .filter((contract) => requireContractParticipant(contract, normalizedWallet))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    notifications: database.notifications
      .filter((notification) => notification.wallet === normalizedWallet)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  };
}

export async function createWorkflowDraft(wallet: string, input: WorkflowDraftInput) {
  const normalizedWallet = normalizeWallet(wallet);

  return mutateWorkflowDatabase((database) => {
    requireWalletMatch(normalizedWallet, input.clientWallet, "Only the client wallet can create this draft.");

    const contract = normalizeContract({
      ...input,
      id: crypto.randomUUID(),
      status: "draft",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    database.contracts = [contract, ...database.contracts];
    appendNotifications(database, [
      {
        wallet: contract.clientWallet,
        message: `Contract draft created for ${contract.freelancerName}.`,
      },
    ]);

    return contract;
  });
}

export async function sendWorkflowContract(contractId: string, wallet: string) {
  return mutateWorkflowDatabase((database) => {
    const contract = getContractOrThrow(database, contractId);
    requireWalletMatch(wallet, contract.clientWallet, "Only the client wallet can send this contract.");

    if (contract.status !== "draft") {
      throw new Error("Only draft contracts can be sent.");
    }

    contract.status = "sent";
    touchContract(contract);

    appendNotifications(database, [
      {
        wallet: contract.clientWallet,
        message: `Contract sent to ${contract.freelancerName} for approval.`,
      },
      {
        wallet: contract.freelancerWallet,
        message: `New contract received from ${contract.clientName}. Review and approve before escrow begins.`,
      },
    ]);

    return contract;
  });
}

export async function respondToWorkflowContract(
  contractId: string,
  wallet: string,
  status: Extract<ContractStatus, "approved" | "rejected">
) {
  return mutateWorkflowDatabase((database) => {
    const contract = getContractOrThrow(database, contractId);
    requireWalletMatch(wallet, contract.freelancerWallet, "Only the freelancer wallet can respond to this contract.");

    if (contract.status !== "sent") {
      throw new Error("Only sent contracts can be approved or rejected.");
    }

    contract.status = status;
    touchContract(contract);

    appendNotifications(database, [
      {
        wallet: contract.freelancerWallet,
        message:
          status === "approved"
            ? `You approved ${contract.clientName}'s contract and unlocked escrow setup.`
            : `You rejected ${contract.clientName}'s contract.`,
      },
      {
        wallet: contract.clientWallet,
        message:
          status === "approved"
            ? `${contract.freelancerName} approved your contract. Escrow can now be created.`
            : `${contract.freelancerName} rejected your contract.`,
      },
    ]);

    return contract;
  });
}

export async function updateWorkflowSettlementAmount(
  contractId: string,
  wallet: string,
  settlementAmountCelo: string
) {
  return mutateWorkflowDatabase((database) => {
    const contract = getContractOrThrow(database, contractId);
    requireWalletMatch(wallet, contract.clientWallet, "Only the client wallet can set the settlement amount.");

    if (contract.status !== "approved") {
      throw new Error("Settlement amount can only be updated after contract approval.");
    }

    if (normalizeLinkedProjectId(contract.linkedProjectId)) {
      throw new Error("Settlement amount cannot change after the project is linked.");
    }

    contract.settlementAmountCelo = normalizeSettlementAmountCelo(settlementAmountCelo);
    touchContract(contract);
    return contract;
  });
}

export async function linkWorkflowContractToProject(
  contractId: string,
  wallet: string,
  projectId: number
) {
  return mutateWorkflowDatabase((database) => {
    const contract = getContractOrThrow(database, contractId);
    requireWalletMatch(wallet, contract.clientWallet, "Only the client wallet can link this contract to a project.");

    if (contract.status !== "approved") {
      throw new Error("Only approved contracts can be linked to escrow.");
    }

    const normalizedProjectId = normalizeLinkedProjectId(projectId);
    if (!normalizedProjectId) {
      throw new Error("Project ID must be a valid non-zero integer.");
    }

    if (normalizeLinkedProjectId(contract.linkedProjectId)) {
      throw new Error("This contract is already linked to a project.");
    }

    const existingProjectLink = database.contracts.find(
      (entry) => normalizeLinkedProjectId(entry.linkedProjectId) === normalizedProjectId
    );
    if (existingProjectLink) {
      throw new Error("This project is already linked to another contract.");
    }

    contract.linkedProjectId = normalizedProjectId;
    touchContract(contract);

    appendNotifications(database, [
      {
        wallet: contract.clientWallet,
        message: `Escrow created for Project #${normalizedProjectId}.`,
      },
      {
        wallet: contract.freelancerWallet,
        message: `${contract.clientName} created escrow for Project #${normalizedProjectId}.`,
      },
    ]);

    return contract;
  });
}

export async function importLegacyWorkflowForWallet(
  wallet: string,
  input: {
    contracts?: ProductContract[];
    notifications?: WorkflowNotification[];
  }
) {
  const normalizedWallet = normalizeWallet(wallet);

  return mutateWorkflowDatabase((database) => {
    const contracts = (input.contracts ?? [])
      .map(normalizeContract)
      .filter((contract) => requireContractParticipant(contract, normalizedWallet));

    for (const contract of contracts) {
      const existingIndex = database.contracts.findIndex((entry) => entry.id === contract.id);
      if (existingIndex >= 0) {
        continue;
      }

      database.contracts.unshift(contract);
    }

    const notifications = (input.notifications ?? [])
      .map((entry) => normalizeNotification(entry))
      .filter(
        (entry): entry is WorkflowNotification =>
          entry !== null && entry.wallet === normalizedWallet
      );

    if (notifications.length > 0) {
      appendNotifications(
        database,
        notifications.map((notification) => ({
          wallet: notification.wallet,
          message: notification.message,
        }))
      );
    }

    return {
      contracts: database.contracts.filter((contract) =>
        requireContractParticipant(contract, normalizedWallet)
      ),
      notifications: database.notifications.filter(
        (notification) => notification.wallet === normalizedWallet
      ),
    };
  });
}

export async function getWorkflowSubmission(projectId: number, wallet: string) {
  const normalizedProjectId = normalizeLinkedProjectId(projectId);
  if (!normalizedProjectId) {
    throw new Error("Project ID must be a valid non-zero integer.");
  }

  const database = await readWorkflowDatabase();
  const submission =
    database.submissions.find((entry) => entry.projectId === normalizedProjectId) ?? null;

  if (!submission) {
    return null;
  }

  requireProjectParticipant(submission, wallet);
  return submission;
}

export async function upsertWorkflowSubmission(input: {
  wallet: string;
  projectId: number;
  deliveryUrl: string;
  clientWallet: string;
  freelancerWallet: string;
  txHash?: string | null;
}) {
  return mutateWorkflowDatabase((database) => {
    const projectId = normalizeLinkedProjectId(input.projectId);
    if (!projectId) {
      throw new Error("Project ID must be a valid non-zero integer.");
    }

    const deliveryUrl = input.deliveryUrl.trim();
    if (!deliveryUrl) {
      throw new Error("Delivery URL is required.");
    }

    requireWalletMatch(
      input.wallet,
      input.freelancerWallet,
      "Only the freelancer wallet can save delivery metadata."
    );

    const clientWallet = normalizeWallet(input.clientWallet);
    const freelancerWallet = normalizeWallet(input.freelancerWallet);
    if (!clientWallet || !freelancerWallet) {
      throw new Error("Client and freelancer wallets are required.");
    }

    const linkedContract = database.contracts.find(
      (contract) => normalizeLinkedProjectId(contract.linkedProjectId) === projectId
    );
    if (!linkedContract) {
      throw new Error("No linked contract was found for this project.");
    }

    requireWalletMatch(
      linkedContract.freelancerWallet,
      freelancerWallet,
      "Delivery metadata can only be saved for the linked freelancer."
    );
    requireWalletMatch(
      linkedContract.clientWallet,
      clientWallet,
      "Delivery metadata can only be saved for the linked client."
    );

    const timestamp = nowIso();
    const nextSubmission: ProjectSubmission = {
      projectId,
      clientWallet,
      freelancerWallet,
      deliveryUrl,
      submittedAt:
        database.submissions.find((entry) => entry.projectId === projectId)?.submittedAt ??
        timestamp,
      updatedAt: timestamp,
      txHash: input.txHash?.trim() || null,
    };

    database.submissions = [
      nextSubmission,
      ...database.submissions.filter((entry) => entry.projectId !== projectId),
    ];

    appendNotifications(database, [
      {
        wallet: clientWallet,
        message: `Delivery submitted for Project #${projectId}. Review the work and release when ready.`,
      },
      {
        wallet: freelancerWallet,
        message: `Delivery synced for Project #${projectId}. The client can now review your submission.`,
      },
    ]);

    return nextSubmission;
  });
}
