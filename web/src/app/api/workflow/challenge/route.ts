import { NextResponse } from "next/server";
import { createWorkflowChallenge } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { wallet?: string };
    const wallet = normalizeWallet(body.wallet);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet is required." }, { status: 400 });
    }

    const challenge = createWorkflowChallenge(wallet);
    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Failed to create workflow challenge", error);
    return NextResponse.json({ error: "Failed to create workflow challenge." }, { status: 500 });
  }
}
