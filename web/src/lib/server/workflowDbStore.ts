import postgres, { type Sql } from "postgres";
import type {
  ProductContract,
  ProjectSubmission,
  WorkflowNotification,
  WorkflowProjectIndexEntry,
} from "@/lib/workflowTypes";
import {
  normalizeContract,
  normalizeNotification,
  normalizeProjectSubmission,
  normalizeWorkflowProjectIndexEntry,
} from "@/lib/workflowTypes";
import {
  readWorkflowMemoryDatabase,
  writeWorkflowMemoryDatabase,
  type WorkflowDatabase,
} from "@/lib/server/workflowMemoryStore";

export type WorkflowStoreType = "postgres" | "memory";

type ContractRow = {
  id: string;
  status: ProductContract["status"];
  client_wallet: string;
  freelancer_wallet: string;
  client_name: string;
  freelancer_name: string;
  project_brief: string;
  amount: string;
  amount_wei: string;
  create_tx_hash: string | null;
  display_budget: ProductContract["displayBudget"];
  settlement_amount_celo: string | null;
  summary: string;
  milestones: ProductContract["milestones"];
  linked_project_id: number | null;
  created_at: string;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  wallet: string;
  contract_id: string | null;
  type: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
};

type SubmissionRow = {
  project_id: number;
  client_wallet: string;
  freelancer_wallet: string;
  delivery_url: string;
  submitted_at: string;
  updated_at: string;
  tx_hash: string | null;
};

type ProjectRow = {
  project_id: number;
  contract_id: string | null;
  client_wallet: string;
  freelancer_wallet: string;
  created_at: string;
  updated_at: string;
};

let sqlClient: Sql | null = null;
let schemaInitPromise: Promise<void> | null = null;
let storeInitLogged = false;
const WORKFLOW_HEALTH_TIMEOUT_MS = 3000;
const WORKFLOW_SCHEMA_TIMEOUT_MS = 5000;
const WORKFLOW_DB_WRITE_TIMEOUT_MS = 12_000;

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
}

export function getWorkflowStoreType(): WorkflowStoreType {
  return getDatabaseUrl() ? "postgres" : "memory";
}

export function isWorkflowDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

function createPostgresClient(databaseUrl: string, connectTimeoutSeconds: number) {
  return postgres(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: connectTimeoutSeconds,
  });
}

function createTimeoutError(code: string, message: string) {
  const error = new Error(message);
  error.name = code;
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeout = setTimeout(() => reject(error), timeoutMs);
      promise.finally(() => clearTimeout(timeout)).catch(() => undefined);
    }),
  ]);
}

function requireWorkflowDatabaseUrl() {
  const databaseUrl = getDatabaseUrl();
  if (databaseUrl) {
    return databaseUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required for production workflow persistence.");
  }

  return "";
}

function logWorkflowStoreInitialization(message: string, extra?: Record<string, unknown>) {
  if (storeInitLogged) {
    return;
  }

  storeInitLogged = true;
  console.log("Agent Guild workflow store initialized", {
    message,
    ...extra,
  });
}

function getSqlClient() {
  const databaseUrl = requireWorkflowDatabaseUrl();
  if (!databaseUrl) {
    logWorkflowStoreInitialization("using memory fallback in development only", {
      storeType: "memory",
      databaseConfigured: false,
    });
    return null;
  }

  if (!sqlClient) {
    logWorkflowStoreInitialization("using postgres", {
      storeType: "postgres",
      databaseConfigured: true,
    });
    sqlClient = createPostgresClient(databaseUrl, 5);
  }

  return sqlClient;
}

async function ensureWorkflowSchema(sql: Sql) {
  if (schemaInitPromise) {
    return withTimeout(
      schemaInitPromise,
      WORKFLOW_SCHEMA_TIMEOUT_MS,
      createTimeoutError(
        "WORKFLOW_SCHEMA_TIMEOUT",
        "Workflow schema initialization timed out after 5 seconds."
      )
    );
  }

  schemaInitPromise = (async () => {
    await sql`
      create table if not exists workflow_contracts (
        id text primary key,
        status text not null,
        client_wallet text not null,
        freelancer_wallet text not null,
        client_name text not null,
        freelancer_name text not null,
        project_brief text not null,
        amount text not null,
        amount_wei text not null,
        create_tx_hash text null,
        display_budget jsonb not null,
        settlement_amount_celo text null,
        summary text not null,
        milestones jsonb not null,
        linked_project_id integer null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      )
    `;
    await sql`
      alter table workflow_contracts
      add column if not exists create_tx_hash text null
    `;

    await sql`
      create table if not exists workflow_notifications (
        id text primary key,
        wallet text not null,
        contract_id text null,
        type text null,
        message text not null,
        created_at timestamptz not null,
        read_at timestamptz null
      )
    `;

    await sql`
      create table if not exists workflow_projects (
        project_id integer primary key,
        contract_id text null,
        client_wallet text not null,
        freelancer_wallet text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      )
    `;

    await sql`
      create table if not exists workflow_submissions (
        project_id integer primary key,
        client_wallet text not null,
        freelancer_wallet text not null,
        delivery_url text not null,
        submitted_at timestamptz not null,
        updated_at timestamptz not null,
        tx_hash text null
      )
    `;
  })();

  return withTimeout(
    schemaInitPromise,
    WORKFLOW_SCHEMA_TIMEOUT_MS,
    createTimeoutError(
      "WORKFLOW_SCHEMA_TIMEOUT",
      "Workflow schema initialization timed out after 5 seconds."
    )
  );
}

function contractToRow(contract: ProductContract): ContractRow {
  return {
    id: contract.id,
    status: contract.status,
    client_wallet: contract.clientWallet,
    freelancer_wallet: contract.freelancerWallet,
    client_name: contract.clientName,
    freelancer_name: contract.freelancerName,
    project_brief: contract.projectBrief,
    amount: contract.amount,
    amount_wei: contract.amountWei,
    create_tx_hash: contract.createTxHash?.trim() || null,
    display_budget: contract.displayBudget,
    settlement_amount_celo: contract.settlementAmountCelo,
    summary: contract.summary,
    milestones: contract.milestones,
    linked_project_id: contract.linkedProjectId ?? null,
    created_at: contract.createdAt,
    updated_at: contract.updatedAt,
  };
}

function rowToContract(row: ContractRow) {
  return normalizeContract({
    id: row.id,
    status: row.status,
    clientWallet: row.client_wallet,
    freelancerWallet: row.freelancer_wallet,
    clientName: row.client_name,
    freelancerName: row.freelancer_name,
    projectBrief: row.project_brief,
    amount: row.amount,
    amountWei: row.amount_wei,
    createTxHash: row.create_tx_hash,
    displayBudget: row.display_budget,
    settlementAmountCelo: row.settlement_amount_celo,
    summary: row.summary,
    milestones: row.milestones,
    linkedProjectId: row.linked_project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToNotification(row: NotificationRow) {
  return normalizeNotification({
    id: row.id,
    wallet: row.wallet,
    message: row.message,
    createdAt: row.created_at,
  });
}

function rowToProject(row: ProjectRow) {
  return normalizeWorkflowProjectIndexEntry({
    projectId: row.project_id,
    contractId: row.contract_id,
    clientWallet: row.client_wallet,
    freelancerWallet: row.freelancer_wallet,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToSubmission(row: SubmissionRow) {
  return normalizeProjectSubmission({
    projectId: row.project_id,
    clientWallet: row.client_wallet,
    freelancerWallet: row.freelancer_wallet,
    deliveryUrl: row.delivery_url,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    txHash: row.tx_hash,
  });
}

export async function readWorkflowDatabaseFromStore(): Promise<{
  storeType: WorkflowStoreType;
  database: WorkflowDatabase;
}> {
  const sql = getSqlClient();
  if (!sql) {
    return {
      storeType: "memory",
      database: readWorkflowMemoryDatabase(),
    };
  }

  await ensureWorkflowSchema(sql);

  const [contractRows, notificationRows, projectRows, submissionRows] = await Promise.all([
    sql<ContractRow[]>`select * from workflow_contracts order by updated_at desc`,
    sql<NotificationRow[]>`select * from workflow_notifications order by created_at desc`,
    sql<ProjectRow[]>`select * from workflow_projects order by updated_at desc`,
    sql<SubmissionRow[]>`select * from workflow_submissions order by updated_at desc`,
  ]);

  return {
    storeType: "postgres",
    database: {
      contracts: contractRows.map(rowToContract),
      notifications: notificationRows
        .map(rowToNotification)
        .filter((entry): entry is WorkflowNotification => entry !== null),
      projects: projectRows
        .map(rowToProject)
        .filter((entry): entry is WorkflowProjectIndexEntry => entry !== null),
      submissions: submissionRows
        .map(rowToSubmission)
        .filter((entry): entry is ProjectSubmission => entry !== null),
    },
  };
}

export async function writeWorkflowDatabaseToStore(database: WorkflowDatabase) {
  const sql = getSqlClient();
  if (!sql) {
    writeWorkflowMemoryDatabase(database);
    return "memory" as const;
  }

  await ensureWorkflowSchema(sql);

  await withTimeout(
    sql.begin(async (tx) => {
      for (const contract of database.contracts) {
        const row = contractToRow(contract);
        await tx`
          insert into workflow_contracts (
            id, status, client_wallet, freelancer_wallet, client_name, freelancer_name,
            project_brief, amount, amount_wei, create_tx_hash, display_budget, settlement_amount_celo,
            summary, milestones, linked_project_id, created_at, updated_at
          ) values (
            ${row.id}, ${row.status}, ${row.client_wallet}, ${row.freelancer_wallet},
            ${row.client_name}, ${row.freelancer_name}, ${row.project_brief}, ${row.amount},
            ${row.amount_wei}, ${row.create_tx_hash}, ${tx.json(row.display_budget)}, ${row.settlement_amount_celo},
            ${row.summary}, ${tx.json(row.milestones)}, ${row.linked_project_id},
            ${row.created_at}, ${row.updated_at}
          )
          on conflict (id) do update set
            status = excluded.status,
            client_wallet = excluded.client_wallet,
            freelancer_wallet = excluded.freelancer_wallet,
            client_name = excluded.client_name,
            freelancer_name = excluded.freelancer_name,
            project_brief = excluded.project_brief,
            amount = excluded.amount,
            amount_wei = excluded.amount_wei,
            create_tx_hash = excluded.create_tx_hash,
            display_budget = excluded.display_budget,
            settlement_amount_celo = excluded.settlement_amount_celo,
            summary = excluded.summary,
            milestones = excluded.milestones,
            linked_project_id = excluded.linked_project_id,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `;
      }

      for (const notification of database.notifications) {
        await tx`
          insert into workflow_notifications (
            id, wallet, contract_id, type, message, created_at, read_at
          ) values (
            ${notification.id},
            ${notification.wallet},
            ${null},
            ${"workflow"},
            ${notification.message},
            ${notification.createdAt},
            ${null}
          )
          on conflict (id) do update set
            wallet = excluded.wallet,
            message = excluded.message,
            created_at = excluded.created_at
        `;
      }

      for (const project of database.projects) {
        await tx`
          insert into workflow_projects (
            project_id, contract_id, client_wallet, freelancer_wallet, created_at, updated_at
          ) values (
            ${project.projectId},
            ${project.contractId},
            ${project.clientWallet},
            ${project.freelancerWallet},
            ${project.createdAt},
            ${project.updatedAt}
          )
          on conflict (project_id) do update set
            contract_id = excluded.contract_id,
            client_wallet = excluded.client_wallet,
            freelancer_wallet = excluded.freelancer_wallet,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `;
      }

      for (const submission of database.submissions) {
        await tx`
          insert into workflow_submissions (
            project_id, client_wallet, freelancer_wallet, delivery_url,
            submitted_at, updated_at, tx_hash
          ) values (
            ${submission.projectId},
            ${submission.clientWallet},
            ${submission.freelancerWallet},
            ${submission.deliveryUrl},
            ${submission.submittedAt},
            ${submission.updatedAt},
            ${submission.txHash}
          )
          on conflict (project_id) do update set
            client_wallet = excluded.client_wallet,
            freelancer_wallet = excluded.freelancer_wallet,
            delivery_url = excluded.delivery_url,
            submitted_at = excluded.submitted_at,
            updated_at = excluded.updated_at,
            tx_hash = excluded.tx_hash
        `;
      }
    }),
    WORKFLOW_DB_WRITE_TIMEOUT_MS,
      createTimeoutError(
        "WORKFLOW_DB_WRITE_TIMEOUT",
        "Workflow database write timed out after 12 seconds."
      )
  );

  return "postgres" as const;
}

export async function getWorkflowStoreHealth() {
  const databaseConfigured = isWorkflowDatabaseConfigured();

  if (!databaseConfigured) {
    if (process.env.NODE_ENV === "production") {
      return {
        storeType: "memory" as const,
        databaseConfigured: false,
        tablesReady: false,
      };
    }

    return {
      storeType: "memory" as const,
      databaseConfigured: false,
      tablesReady: true,
    };
  }

  const databaseUrl = getDatabaseUrl();

  try {
    const sql = createPostgresClient(databaseUrl, 3);

    try {
      await Promise.race([
        sql`select 1 as ok`,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("DB_HEALTH_TIMEOUT_OR_FAILED"));
          }, WORKFLOW_HEALTH_TIMEOUT_MS);
        }),
      ]);
    } finally {
      await sql.end({ timeout: 1 });
    }

    return {
      storeType: "postgres" as const,
      databaseConfigured: true,
      tablesReady: true,
    };
  } catch (error) {
    console.error("Agent Guild workflow store health failed", error);
    return {
      storeType: "postgres" as const,
      databaseConfigured: true,
      tablesReady: false,
      error: "DB_HEALTH_TIMEOUT_OR_FAILED" as const,
    };
  }
}
