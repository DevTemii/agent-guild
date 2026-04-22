import { NextResponse } from "next/server";
import { linkWorkflowContractToProject } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { projectId?: number };
    if (typeof body.projectId !== "number") {
      return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    }

    const { id } = await context.params;
    const contract = await linkWorkflowContractToProject(id, wallet, body.projectId);
    return NextResponse.json(contract);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to link project.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
