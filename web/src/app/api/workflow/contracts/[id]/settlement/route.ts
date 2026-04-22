import { NextResponse } from "next/server";
import { updateWorkflowSettlementAmount } from "@/lib/server/workflowBackend";
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
    const body = (await request.json()) as { settlementAmountCelo?: string };
    if (typeof body.settlementAmountCelo !== "string") {
      return NextResponse.json({ error: "Settlement amount is required." }, { status: 400 });
    }

    const { id } = await context.params;
    const contract = await updateWorkflowSettlementAmount(
      id,
      wallet,
      body.settlementAmountCelo
    );
    return NextResponse.json(contract);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update settlement amount.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
