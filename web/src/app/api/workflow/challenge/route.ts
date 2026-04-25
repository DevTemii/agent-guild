import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { createWorkflowChallenge } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      title?: string;
      description?: string;
      amount?: string;
      chainId?: number | string;
    };
    const wallet = normalizeWallet(body.wallet);
    const rawAmount = typeof body.amount === "string" ? body.amount.trim() : "";
    const parsedChainId =
      typeof body.chainId === "number"
        ? body.chainId
        : typeof body.chainId === "string" && body.chainId.trim()
          ? Number.parseInt(body.chainId, 10)
          : null;
    let parsedAmount: string | null = null;

    if (!wallet) {
      return NextResponse.json({ error: "Wallet is required." }, { status: 400 });
    }

    if (parsedChainId !== 42220) {
      return NextResponse.json({ error: "MiniPay must be connected to Celo Mainnet (42220)." }, { status: 400 });
    }

    if (!rawAmount) {
      return NextResponse.json({ error: "Amount is required." }, { status: 400 });
    }

    if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
      return NextResponse.json({ error: "Amount must use plain decimal format." }, { status: 400 });
    }

    try {
      parsedAmount = parseUnits(rawAmount, 18).toString();
      if (parsedAmount === "0") {
        return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
      }
    } catch (error) {
      console.error("Agent Guild workflow challenge amount parse failed", {
        incomingPayload: body,
        amountRawValue: rawAmount,
        walletAddress: wallet,
        chainId: parsedChainId,
        serverError: error instanceof Error ? error.message : error,
        stackTrace: error instanceof Error ? error.stack : null,
      });
      return NextResponse.json({ error: "Amount is not a valid decimal value." }, { status: 400 });
    }

    console.log("Agent Guild workflow challenge request", {
      incomingPayload: body,
      title: body.title ?? null,
      description: body.description ?? null,
      amountRawValue: rawAmount,
      parsedAmount,
      walletAddress: wallet,
      chainId: parsedChainId,
    });

    const challenge = createWorkflowChallenge(wallet);

    console.log("Agent Guild workflow challenge response", {
      walletAddress: wallet,
      chainId: parsedChainId,
      parsedAmount,
      challengeResponse: {
        tokenPresent: Boolean(challenge.token),
        message: challenge.message,
      },
    });

    return NextResponse.json({
      ...challenge,
      wallet,
      chainId: parsedChainId,
      amountRawValue: rawAmount,
      parsedAmount,
    });
  } catch (error) {
    console.error("Failed to create workflow challenge", {
      serverError: error instanceof Error ? error.message : error,
      stackTrace: error instanceof Error ? error.stack : null,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create workflow challenge.",
      },
      { status: 500 }
    );
  }
}
