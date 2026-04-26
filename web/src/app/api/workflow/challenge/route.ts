import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { normalizeChainId } from "@/lib/chainId";
import { createWorkflowChallenge } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stage = "route_entered";
  console.log("workflow challenge route entered");
  let rawRequestText = "";

  try {
    stage = "body_parse_started";
    rawRequestText = await request.text();
    console.log("Agent Guild workflow challenge request body", {
      stage,
      typeofBody: typeof rawRequestText,
      rawRequestText,
    });

    let body: {
      wallet?: string;
      title?: string;
      description?: string;
      amount?: string;
      amountWei?: string;
      chainId?: number | string;
      role?: string;
      timestamp?: string;
    } = {};

    try {
      body = (rawRequestText ? JSON.parse(rawRequestText) : {}) as typeof body;
      stage = "body_parse_success";
      console.log("Agent Guild workflow challenge parsed JSON", {
        stage,
        parsedJson: body,
      });
    } catch (error) {
      stage = "body_parse_failed";
      console.error("Agent Guild workflow challenge body parse failed", {
        stage,
        rawRequestText,
        serverError: error instanceof Error ? error.message : error,
        stackTrace: error instanceof Error ? error.stack : null,
      });
      return NextResponse.json(
        {
          success: false,
          stage,
          error: error instanceof Error && error.message.trim() ? error.message : "Failed to parse JSON body.",
          rawBodyPreview: rawRequestText.slice(0, 500),
          stack: error instanceof Error ? error.stack ?? null : null,
        },
        { status: 400 }
      );
    }

    stage = "payload_validated";
    const wallet = normalizeWallet(body.wallet);
    const rawAmount = typeof body.amount === "string" ? body.amount.trim() : "";
    const amountWei = typeof body.amountWei === "string" ? body.amountWei.trim() : "";
    const parsedChainId = normalizeChainId(body.chainId);
    let parsedAmount: string | null = null;
    const missingFields = [
      !body.title ? "title" : null,
      !body.description ? "description" : null,
      !rawAmount ? "amount" : null,
      !amountWei ? "amountWei" : null,
      !wallet ? "wallet" : null,
      parsedChainId === null ? "chainId" : null,
    ].filter((value): value is string => Boolean(value));

    console.log("Agent Guild workflow challenge env availability", {
      stage,
      hasWorkflowSessionSecret: Boolean(process.env.WORKFLOW_SESSION_SECRET),
      hasGroqApiKey: Boolean(process.env.GROQ_API_KEY),
      hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    });

    console.log("Agent Guild workflow challenge parsed payload", {
      stage,
      parsedJson: body,
      missingFields,
      walletAddress: wallet,
      amountWei,
      rawChainResponse: body.chainId ?? null,
      normalizedChainValue: parsedChainId,
    });

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: `Invalid payload. Missing: ${missingFields.join(", ")}`,
          rawBodyPreview: rawRequestText.slice(0, 500),
          stack: null,
        },
        { status: 400 }
      );
    }

    if (parsedChainId !== 42220) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "MiniPay must be connected to Celo Mainnet (42220).",
          rawBodyPreview: rawRequestText.slice(0, 500),
          stack: null,
        },
        { status: 400 }
      );
    }

    if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Amount must use plain decimal format.",
          rawBodyPreview: rawRequestText.slice(0, 500),
          stack: null,
        },
        { status: 400 }
      );
    }

    try {
      parsedAmount = parseUnits(rawAmount, 18).toString();
      if (parsedAmount === "0") {
        return NextResponse.json(
          {
            success: false,
            stage,
            error: "Amount must be greater than zero.",
            rawBodyPreview: rawRequestText.slice(0, 500),
            stack: null,
          },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("Agent Guild workflow challenge amount parse failed", {
        stage,
        incomingPayload: body,
        amountRawValue: rawAmount,
        walletAddress: wallet,
        chainId: parsedChainId,
        serverError: error instanceof Error ? error.message : error,
        stackTrace: error instanceof Error ? error.stack : null,
      });
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Amount is not a valid decimal value.",
          rawBodyPreview: rawRequestText.slice(0, 500),
          stack: error instanceof Error ? error.stack ?? null : null,
        },
        { status: 400 }
      );
    }

    if (parsedAmount !== amountWei) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Amount and amountWei do not match.",
          rawBodyPreview: rawRequestText.slice(0, 500),
          stack: null,
        },
        { status: 400 }
      );
    }

    console.log("Agent Guild workflow challenge request", {
      stage,
      incomingPayload: body,
      title: body.title ?? null,
      description: body.description ?? null,
      amountRawValue: rawAmount,
      amountWei,
      parsedAmount,
      walletAddress: wallet,
      rawChainResponse: body.chainId ?? null,
      normalizedChainValue: parsedChainId,
      validationResult: parsedChainId === 42220,
    });

    stage = "session_checked";
    const hasWorkflowSessionSecret =
      Boolean(process.env.WORKFLOW_SESSION_SECRET) || process.env.NODE_ENV !== "production";
    if (!hasWorkflowSessionSecret) {
      stage = "fallback_generated";
      return NextResponse.json({
        success: false,
        stage,
        error: "Missing workflow secret",
        fallback: {
          sessionMode: "fallback",
          reason: "missing workflow secret",
        },
        debug: {
          wallet,
          chainId: parsedChainId,
          amount: rawAmount,
          amountWei,
          hasWorkflowSessionSecret,
        },
      });
    }

    const challenge = createWorkflowChallenge(wallet);
    stage = "challenge_created";

    console.log("Agent Guild workflow challenge response", {
      stage,
      walletAddress: wallet,
      chainId: parsedChainId,
      parsedAmount,
      challengeResponse: {
        tokenPresent: Boolean(challenge.token),
        message: challenge.message,
      },
    });

    stage = "response_sent";
    return NextResponse.json({
      success: true,
      stage,
      ...challenge,
      wallet,
      chainId: parsedChainId,
      amountRawValue: rawAmount,
      amountWei,
      parsedAmount,
    });
  } catch (error) {
    console.error("Failed to create workflow challenge", {
      stage,
      serverError: error instanceof Error ? error.message : error,
      stackTrace: error instanceof Error ? error.stack : null,
    });
    return NextResponse.json(
      {
        success: false,
        stage,
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create workflow challenge.",
        rawBodyPreview: rawRequestText.slice(0, 500),
        stack: error instanceof Error ? error.stack ?? null : null,
      } as const,
      { status: 500 }
    );
  }
}
