import { NextResponse } from "next/server";
import { listWorkflowInboxForWallet } from "@/lib/server/workflowBackend";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function GET(
  _request: Request,
  context: { params: Promise<{ wallet: string }> }
) {
  let stage = "route_entered";

  try {
    const { wallet } = await context.params;
    const normalizedWallet = normalizeWallet(wallet);
    if (!normalizedWallet) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Wallet is required.",
          stack: null,
        },
        { status: 400 }
      );
    }

    stage = "wallet_normalized";
    const inbox = await listWorkflowInboxForWallet(normalizedWallet);

    return NextResponse.json({
      success: true,
      stage: "response_sent",
      wallet: normalizedWallet,
      contracts: inbox.contracts,
      notifications: inbox.notifications,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        stage,
        error: error instanceof Error ? error.message : "Failed to load workflow inbox.",
        stack: error instanceof Error ? error.stack ?? null : null,
      },
      { status: 500 }
    );
  }
}
