import { NextResponse } from "next/server";
import { createWorkflowDraft } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";
import { type ProductContract } from "@/lib/workflowTypes";

export async function POST(request: Request) {
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const input = (await request.json()) as Omit<
      ProductContract,
      "id" | "status" | "createdAt" | "updatedAt"
    >;
    const contract = await createWorkflowDraft(wallet, input);
    return NextResponse.json(contract);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
