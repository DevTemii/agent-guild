import { NextResponse } from "next/server";
import {
  clearWorkflowSession,
  getWorkflowSession,
  setWorkflowSession,
  verifyWorkflowChallengeSignature,
} from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function GET() {
  const session = await getWorkflowSession();
  return NextResponse.json({
    wallet: session?.wallet ?? null,
    sessionId: session?.sessionId ?? null,
    expiresAt: session?.expiresAt ?? null,
  });
}

export async function POST(request: Request) {
  let stage = "route_entered";
  try {
    stage = "body_parsed";
    const body = (await request.json()) as {
      wallet?: string;
      challengeToken?: string;
      signature?: string;
    };

    const wallet = normalizeWallet(body.wallet);
    if (!wallet || !body.challengeToken || !body.signature) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Wallet, challenge token, and signature are required.",
          stack: null,
        },
        { status: 400 }
      );
    }

    stage = "signature_verified";
    const isValid = await verifyWorkflowChallengeSignature({
      wallet,
      token: body.challengeToken,
      signature: body.signature,
    });

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Invalid workflow signature.",
          stack: null,
        },
        { status: 401 }
      );
    }

    stage = "session_initialized";
    const session = await setWorkflowSession(wallet);
    return NextResponse.json({
      success: true,
      stage,
      wallet: session?.wallet ?? wallet,
      sessionId: session?.sessionId ?? null,
      expiresAt: session?.expiresAt ?? null,
    });
  } catch (error) {
    console.error("Failed to create workflow session", error);
    return NextResponse.json(
      {
        success: false,
        stage,
        error: error instanceof Error ? error.message : "Failed to create workflow session.",
        stack: error instanceof Error ? error.stack ?? null : null,
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  await clearWorkflowSession();
  return new NextResponse(null, { status: 204 });
}
