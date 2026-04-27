import { NextResponse } from "next/server";
import { createWorkflowDraft } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";
import { type ProductContract } from "@/lib/workflowTypes";

export async function POST(request: Request) {
  let stage = "route_entered";

  const rawBody = await request.text();
  let input: (Omit<
    ProductContract,
    "id" | "status" | "createdAt" | "updatedAt"
  > & { wallet?: string }) | null = null;

  try {
    input = rawBody
      ? (JSON.parse(rawBody) as Omit<
          ProductContract,
          "id" | "status" | "createdAt" | "updatedAt"
        > & { wallet?: string })
      : null;
  } catch (error) {
    return NextResponse.json(
      { success: false, stage: "body_parse_failed", error: "Invalid JSON payload.", stack: error instanceof Error ? error.stack ?? null : null },
      { status: 400 }
    );
  }

  const wallet = await resolveWorkflowRequestWallet(request, input?.wallet);
  if (!wallet) {
    return NextResponse.json({ success: false, stage, error: "Wallet is required.", stack: null }, { status: 401 });
  }

  try {
    stage = "draft_created";
    const contract = await createWorkflowDraft(wallet, input as Omit<
      ProductContract,
      "id" | "status" | "createdAt" | "updatedAt"
    >);
    return NextResponse.json({ success: true, stage: "response_sent", contract });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft.";
    return NextResponse.json({ success: false, stage, error: message, stack: error instanceof Error ? error.stack ?? null : null }, { status: 400 });
  }
}
