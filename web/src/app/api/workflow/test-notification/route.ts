import { NextResponse } from "next/server";
import {
  createWorkflowTestNotification,
  getWorkflowStoreType,
  listWorkflowInboxForWallet,
} from "@/lib/server/workflowBackend";
import { normalizeWallet } from "@/lib/workflowTypes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stage = "route_entered";

  try {
    const body = (await request.json()) as {
      wallet?: string;
      contractId?: string | null;
      message?: string | null;
    };
    const wallet = normalizeWallet(body.wallet);

    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Wallet is required.",
        },
        { status: 400 }
      );
    }

    stage = "notification_insert_started";
    const notification = await createWorkflowTestNotification({
      wallet,
      contractId: body.contractId,
      message: body.message,
    });

    stage = "inbox_verify_started";
    const inbox = await listWorkflowInboxForWallet(wallet);
    const found = inbox.notifications.some((entry) => entry.id === notification.id);

    return NextResponse.json({
      success: found,
      stage: "response_sent",
      wallet,
      notification,
      inboxResultsCount: inbox.notifications.length,
      inboxContractsCount: inbox.contracts.length,
      storeType: getWorkflowStoreType(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        stage,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create test notification.",
        stack: error instanceof Error ? error.stack ?? null : null,
      },
      { status: 500 }
    );
  }
}
