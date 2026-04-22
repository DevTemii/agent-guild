import { NextResponse } from "next/server";
import { sendWorkflowContract } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const contract = await sendWorkflowContract(id, wallet);
    return NextResponse.json(contract);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send contract.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
