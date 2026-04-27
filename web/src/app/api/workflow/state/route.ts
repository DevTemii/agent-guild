import { NextResponse } from "next/server";
import { listWorkflowStateForWallet } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";

export async function GET(request: Request) {
  const wallet = await resolveWorkflowRequestWallet(request);
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
