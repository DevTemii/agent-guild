import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import {
  generateContractWithGroq,
  getGroqModel,
  GroqContractGeneratorError,
} from "@/lib/server/groqContractGenerator";
import { normalizeChainId } from "@/lib/chainId";
import { normalizeWallet } from "@/lib/workflowTypes";

export const runtime = "nodejs";

type WorkflowChallengePayload = {
  title?: string;
  description?: string;
  amount?: string;
  amountWei?: string;
  wallet?: string;
  freelancerWallet?: string;
  chainId?: number | string;
};

function createErrorResponse(
  stage: string,
  errorCode: string,
  error: string,
  status: number,
  debug?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      stage,
      errorCode,
      error,
      debug: debug ?? null,
    },
    { status }
  );
}

export async function POST(request: Request) {
  let stage = "route_entered";
  let rawBody = "";
  console.log("workflow challenge route entered");

  try {
    stage = "body_parse_started";
    rawBody = await request.text();
    console.log("Agent Guild workflow challenge raw body", {
      stage,
      typeofBody: typeof rawBody,
      rawBodyPreview: rawBody.slice(0, 500),
    });

    let body: WorkflowChallengePayload;
    try {
      body = (rawBody ? JSON.parse(rawBody) : {}) as WorkflowChallengePayload;
      stage = "body_parse_success";
      console.log("Agent Guild workflow challenge parsed body", {
        stage,
        parsedJson: body,
      });
    } catch (error) {
      stage = "body_parse_failed";
      return createErrorResponse(
        stage,
        "INVALID_JSON_BODY",
        error instanceof Error ? error.message : "Failed to parse request body.",
        400,
        {
          rawBodyPreview: rawBody.slice(0, 500),
          stack: error instanceof Error ? error.stack : null,
        }
      );
    }

    stage = "payload_validated";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const amountWei = typeof body.amountWei === "string" ? body.amountWei.trim() : "";
    const wallet = normalizeWallet(body.wallet);
    const freelancerWallet = normalizeWallet(body.freelancerWallet);
    const chainId = normalizeChainId(body.chainId);

    const missingFields = [
      !title ? "title" : null,
      !description ? "description" : null,
      !amount ? "amount" : null,
      !amountWei ? "amountWei" : null,
      !wallet ? "wallet" : null,
      chainId === null ? "chainId" : null,
    ].filter((value): value is string => Boolean(value));

    console.log("Agent Guild workflow challenge payload", {
      stage,
      incomingWorkflowPayload: body,
      walletAddress: wallet,
      chainId,
      missingFields,
      hasGroqApiKey: Boolean(process.env.GROQ_API_KEY),
      groqModel: getGroqModel(),
    });

    if (missingFields.length > 0) {
      return createErrorResponse(
        stage,
        "INVALID_PAYLOAD",
        `Missing required fields: ${missingFields.join(", ")}`,
        400,
        {
          rawBodyPreview: rawBody.slice(0, 500),
          missingFields,
        }
      );
    }

    if (chainId !== 42220) {
      return createErrorResponse(
        stage,
        "INVALID_CHAIN_ID",
        "MiniPay must be connected to Celo Mainnet (42220).",
        400,
        {
          providedChainId: body.chainId ?? null,
          normalizedChainId: chainId,
        }
      );
    }

    if (!/^\d+(\.\d+)?$/.test(amount)) {
      return createErrorResponse(
        stage,
        "INVALID_AMOUNT",
        "Amount must be a positive decimal string.",
        400
      );
    }

    const decimals = amount.split(".")[1]?.length ?? 0;
    if (decimals > 18) {
      return createErrorResponse(
        stage,
        "INVALID_AMOUNT_PRECISION",
        "Amount supports up to 18 decimal places.",
        400
      );
    }

    let parsedAmountWei: string;
    try {
      parsedAmountWei = parseUnits(amount, 18).toString();
    } catch (error) {
      return createErrorResponse(
        stage,
        "INVALID_AMOUNT",
        "Amount could not be converted to wei.",
        400,
        {
          stack: error instanceof Error ? error.stack : null,
        }
      );
    }

    if (parsedAmountWei === "0") {
      return createErrorResponse(
        stage,
        "INVALID_AMOUNT",
        "Amount must be greater than zero.",
        400
      );
    }

    if (parsedAmountWei !== amountWei) {
      return createErrorResponse(
        stage,
        "AMOUNT_WEI_MISMATCH",
        "Amount and amountWei do not match.",
        400,
        {
          amount,
          parsedAmountWei,
          amountWei,
        }
      );
    }

    stage = "ai_generation_started";
    const contract = await generateContractWithGroq({
      title,
      description,
      amount,
      amountWei,
      clientWallet: wallet!,
      freelancerWallet: freelancerWallet ?? undefined,
      chainId,
    });

    stage = "response_sent";
    return NextResponse.json({
      success: true,
      stage,
      contract,
      debug: {
        provider: "groq",
        model: getGroqModel(),
      },
    });
  } catch (error) {
    if (error instanceof GroqContractGeneratorError) {
      return createErrorResponse(
        stage,
        error.code,
        error.message,
        error.code === "MISSING_GROQ_API_KEY" ? 500 : 502
      );
    }

    return createErrorResponse(
      stage,
      "UNEXPECTED_SERVER_ERROR",
      error instanceof Error ? error.message : "Unexpected server error.",
      500,
      {
        stack: error instanceof Error ? error.stack : null,
      }
    );
  }
}
