import { NextResponse } from "next/server";
import { listWorkflowProjectsForWallet } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";

export async function GET() {
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const projects = await listWorkflowProjectsForWallet(wallet);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Failed to load workflow projects", error);
    return NextResponse.json({ error: "Failed to load workflow projects." }, { status: 500 });
  }
}
