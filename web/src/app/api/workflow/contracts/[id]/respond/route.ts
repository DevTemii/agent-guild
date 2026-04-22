import { NextResponse } from "next/server";
import { respondToWorkflowContract } from "@/lib/server/workflowBackend";
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
    const body = (await request.json()) as { status?: "approved" | "rejected" };
    if (body.status !== "approved" && body.status !== "rejected") {
      return NextResponse.json({ error: "A valid response status is required." }, { status: 400 });
    }

    const { id } = await context.params;
    const contract = await respondToWorkflowContract(id, wallet, body.status);
    return NextResponse.json(contract);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to respond to contract.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
