import { NextResponse } from "next/server";
import {
  clearWorkflowSession,
  getWorkflowSessionWallet,
  setWorkflowSession,
  verifyWorkflowChallengeSignature,
} from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function GET() {
  const wallet = await getWorkflowSessionWallet();
  return NextResponse.json({ wallet });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      challengeToken?: string;
      signature?: string;
    };

    const wallet = normalizeWallet(body.wallet);
    if (!wallet || !body.challengeToken || !body.signature) {
      return NextResponse.json({ error: "Wallet, challenge token, and signature are required." }, { status: 400 });
    }

    const isValid = await verifyWorkflowChallengeSignature({
      wallet,
      token: body.challengeToken,
      signature: body.signature,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid workflow signature." }, { status: 401 });
    }

    await setWorkflowSession(wallet);
    return NextResponse.json({ wallet });
  } catch (error) {
    console.error("Failed to create workflow session", error);
    return NextResponse.json({ error: "Failed to create workflow session." }, { status: 500 });
  }
}

export async function DELETE() {
  await clearWorkflowSession();
  return new NextResponse(null, { status: 204 });
}
