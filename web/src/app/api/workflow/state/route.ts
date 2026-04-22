import { NextResponse } from "next/server";
import { listWorkflowStateForWallet } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";

export async function GET() {
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const state = await listWorkflowStateForWallet(wallet);
    return NextResponse.json(state);
  } catch (error) {
    console.error("Failed to load workflow state", error);
    return NextResponse.json({ error: "Failed to load workflow state." }, { status: 500 });
  }
}
