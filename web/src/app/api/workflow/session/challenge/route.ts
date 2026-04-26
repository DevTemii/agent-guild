import { NextResponse } from "next/server";
import { createWorkflowChallenge } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
    };

    const wallet = normalizeWallet(body.wallet);
    if (!wallet) {
      return NextResponse.json({ error: "Wallet is required." }, { status: 400 });
    }

    const challenge = createWorkflowChallenge(wallet);
    return NextResponse.json({
      success: true,
      stage: "challenge_created",
      wallet,
      token: challenge.token,
      message: challenge.message,
    });
  } catch (error) {
    console.error("Failed to create workflow session challenge", error);
    return NextResponse.json(
      {
        success: false,
        stage: "challenge_failed",
        error: error instanceof Error ? error.message : "Failed to create workflow challenge.",
      },
      { status: 500 }
    );
  }
}
