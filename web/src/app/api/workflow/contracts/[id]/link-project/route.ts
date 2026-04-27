import { NextResponse } from "next/server";
import { linkWorkflowContractToProject } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let stage = "route_entered";
  try {
    stage = "body_parsed";
    const body = (await request.json()) as { projectId?: number; wallet?: string };
    if (typeof body.projectId !== "number") {
      return NextResponse.json({ success: false, stage, error: "Project ID is required.", stack: null }, { status: 400 });
    }

    const wallet = await resolveWorkflowRequestWallet(request, body.wallet);
    if (!wallet) {
      return NextResponse.json({ success: false, stage, error: "Wallet is required.", stack: null }, { status: 401 });
    }

    const { id } = await context.params;
    const contract = await linkWorkflowContractToProject(id, wallet, body.projectId);
    return NextResponse.json({ success: true, stage: "response_sent", contract });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to link project.";
    return NextResponse.json({ success: false, stage, error: message, stack: error instanceof Error ? error.stack ?? null : null }, { status: 400 });
  }
}
