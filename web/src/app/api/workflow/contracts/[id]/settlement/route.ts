import { NextResponse } from "next/server";
import { updateWorkflowSettlementAmount } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let stage = "route_entered";
  try {
    stage = "body_parsed";
    const body = (await request.json()) as { settlementAmountCelo?: string; wallet?: string };
    if (typeof body.settlementAmountCelo !== "string") {
      return NextResponse.json({ success: false, stage, error: "Settlement amount is required.", stack: null }, { status: 400 });
    }

    const wallet = await resolveWorkflowRequestWallet(request, body.wallet);
    if (!wallet) {
      return NextResponse.json({ success: false, stage, error: "Wallet is required.", stack: null }, { status: 401 });
    }

    const { id } = await context.params;
    const contract = await updateWorkflowSettlementAmount(
      id,
      wallet,
      body.settlementAmountCelo
    );
    return NextResponse.json({ success: true, stage: "response_sent", contract });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update settlement amount.";
    return NextResponse.json({ success: false, stage, error: message, stack: error instanceof Error ? error.stack ?? null : null }, { status: 400 });
  }
}
