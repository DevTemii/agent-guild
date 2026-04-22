import { NextResponse } from "next/server";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";
import { importLegacyWorkflowForWallet } from "@/lib/server/workflowBackend";
import { type ProductContract, type WorkflowNotification } from "@/lib/workflowTypes";

export async function POST(request: Request) {
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      contracts?: ProductContract[];
      notifications?: WorkflowNotification[];
    };

    const result = await importLegacyWorkflowForWallet(wallet, {
      contracts: body.contracts,
      notifications: body.notifications,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import local workflow.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
