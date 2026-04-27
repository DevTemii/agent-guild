import type {
  ProductContract,
  ProjectSubmission,
  WorkflowNotification,
  WorkflowProjectIndexEntry,
} from "@/lib/workflowTypes";

export type WorkflowDatabase = {
  contracts: ProductContract[];
  notifications: WorkflowNotification[];
  submissions: ProjectSubmission[];
  projects: WorkflowProjectIndexEntry[];
};

type WorkflowSessionValue = unknown;

type WorkflowMemoryScope = typeof globalThis & {
  __agentGuildContracts?: Map<string, ProductContract>;
  __agentGuildNotifications?: Map<string, WorkflowNotification>;
  __agentGuildSubmissions?: Map<number, ProjectSubmission>;
  __agentGuildProjects?: Map<number, WorkflowProjectIndexEntry>;
  __agentGuildSessions?: Map<string, WorkflowSessionValue>;
};

function getWorkflowScope() {
  const scope = globalThis as WorkflowMemoryScope;
  scope.__agentGuildContracts ||= new Map<string, ProductContract>();
  scope.__agentGuildNotifications ||= new Map<string, WorkflowNotification>();
  scope.__agentGuildSubmissions ||= new Map<number, ProjectSubmission>();
  scope.__agentGuildProjects ||= new Map<number, WorkflowProjectIndexEntry>();
  scope.__agentGuildSessions ||= new Map<string, WorkflowSessionValue>();
  return scope;
}

export function readWorkflowMemoryDatabase(): WorkflowDatabase {
  const scope = getWorkflowScope();
  return {
    contracts: Array.from(scope.__agentGuildContracts!.values()),
    notifications: Array.from(scope.__agentGuildNotifications!.values()),
    submissions: Array.from(scope.__agentGuildSubmissions!.values()),
    projects: Array.from(scope.__agentGuildProjects!.values()),
  };
}

export function writeWorkflowMemoryDatabase(database: WorkflowDatabase) {
  const scope = getWorkflowScope();
  scope.__agentGuildContracts = new Map(
    database.contracts.map((contract) => [contract.id, contract] as const)
  );
  scope.__agentGuildNotifications = new Map(
    database.notifications.map((notification) => [notification.id, notification] as const)
  );
  scope.__agentGuildSubmissions = new Map(
    database.submissions.map((submission) => [submission.projectId, submission] as const)
  );
  scope.__agentGuildProjects = new Map(
    database.projects.map((project) => [project.projectId, project] as const)
  );
}

export function getWorkflowSessionMemoryStore() {
  return getWorkflowScope().__agentGuildSessions!;
}
