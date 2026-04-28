import { NextResponse } from "next/server";
import { getWorkflowStoreType, listWorkflowProjectsForWallet } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";

export async function GET(request: Request) {
  const wallet = await resolveWorkflowRequestWallet(request);
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const projects = await listWorkflowProjectsForWallet(wallet);
    return NextResponse.json({ projects, storeType: getWorkflowStoreType() });
  } catch (error) {
    console.error("Failed to load workflow projects", error);
    return NextResponse.json({ error: "Failed to load workflow projects." }, { status: 500 });
  }
}
