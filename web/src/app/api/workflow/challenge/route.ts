import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import {
  generateContractWithGroq,
  getGroqModel,
  type GroqGeneratedContract,
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
  chainId?: number | string;
};

type FailureBody = {
  success: false;
  stage: string;
  error: string;
  stack: string | null;
  provider: "groq";
  model: string;
  errorCode?: string;
  rawBodyPreview?: string;
  rawResponsePreview?: string;
  missingFields?: string[];
};

type SuccessBody = {
  success: true;
  stage: "response_sent";
  contract: GroqGeneratedContract;
  debug: {
    provider: "groq";
    model: string;
  };
};

function jsonFailure(
  body: Omit<FailureBody, "success" | "provider" | "model"> & {
    provider?: "groq";
    model?: string;
  },
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      stage: body.stage,
      error: body.error,
      stack: body.stack,
      provider: body.provider ?? "groq",
      model: body.model ?? getGroqModel(),
      errorCode: body.errorCode,
      rawBodyPreview: body.rawBodyPreview,
      rawResponsePreview: body.rawResponsePreview,
      missingFields: body.missingFields,
    } satisfies FailureBody,
    { status }
  );
}

function jsonSuccess(contract: GroqGeneratedContract, model: string) {
  return NextResponse.json({
    success: true,
    stage: "response_sent",
    contract,
    debug: {
      provider: "groq",
      model,
    },
  } satisfies SuccessBody);
}

function parsePayload(rawBody: string) {
  try {
    return {
      ok: true as const,
      payload: (rawBody ? JSON.parse(rawBody) : {}) as WorkflowChallengePayload,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Invalid JSON payload.",
      stack: error instanceof Error ? error.stack ?? null : null,
    };
  }
}

function validateAmount(amount: string) {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    return "Amount must use plain decimal format.";
  }

  const decimals = amount.split(".")[1]?.length ?? 0;
  if (decimals > 18) {
    return "Amount supports up to 18 decimal places.";
  }

  try {
    const amountWei = parseUnits(amount, 18).toString();
    if (amountWei === "0") {
      return "Amount must be greater than zero.";
    }
    return null;
  } catch {
    return "Amount could not be converted to wei.";
  }
}

export async function POST(request: Request) {
  let stage:
    | "route_entered"
    | "body_parse_started"
    | "body_parse_success"
    | "payload_validated"
    | "groq_env_checked"
    | "groq_request_started"
    | "groq_response_received"
    | "contract_parsed"
    | "response_sent"
    | "route_failed" = "route_entered";

  const provider = "groq" as const;
  const model = getGroqModel();

  try {
    console.log("workflow challenge route entered", { stage });

    stage = "body_parse_started";
    const rawBody = await request.text();
    const parsed = parsePayload(rawBody);

    if (!parsed.ok) {
      console.error("Agent Guild workflow challenge body parse failed", {
        stage: "body_parse_failed",
        error: parsed.error,
        stack: parsed.stack,
      });
      return jsonFailure(
        {
          stage: "body_parse_failed",
          error: parsed.error,
          stack: parsed.stack,
          errorCode: "INVALID_JSON_BODY",
          rawBodyPreview: rawBody.slice(0, 500),
        },
        400
      );
    }

    stage = "body_parse_success";
    const body = parsed.payload ?? {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const amountWei = typeof body.amountWei === "string" ? body.amountWei.trim() : "";
    const wallet = normalizeWallet(body.wallet);
    const chainId = normalizeChainId(body.chainId);

    stage = "payload_validated";
    const missingFields = [
      !title ? "title" : null,
      !description ? "description" : null,
      !amount ? "amount" : null,
      !amountWei ? "amountWei" : null,
      !wallet ? "wallet" : null,
      chainId === null ? "chainId" : null,
    ].filter((value): value is string => Boolean(value));

    if (missingFields.length > 0) {
      console.error("Agent Guild workflow challenge payload invalid", {
        stage,
        missingFields,
      });
      return jsonFailure(
        {
          stage,
          error: `Missing required fields: ${missingFields.join(", ")}`,
          stack: null,
          errorCode: "INVALID_PAYLOAD",
          missingFields,
          rawBodyPreview: rawBody.slice(0, 500),
        },
        400
      );
    }

    if (chainId !== 42220) {
      return jsonFailure(
        {
          stage,
          error: "MiniPay must be connected to Celo Mainnet (42220).",
          stack: null,
          errorCode: "INVALID_CHAIN_ID",
        },
        400
      );
    }

    const amountError = validateAmount(amount);
    if (amountError) {
      return jsonFailure(
        {
          stage,
          error: amountError,
          stack: null,
          errorCode: "INVALID_AMOUNT",
        },
        400
      );
    }

    let parsedAmountWei: string;
    try {
      parsedAmountWei = parseUnits(amount, 18).toString();
    } catch (error) {
      return jsonFailure(
        {
          stage,
          error: "Amount could not be converted to wei.",
          stack: error instanceof Error ? error.stack ?? null : null,
          errorCode: "INVALID_AMOUNT",
        },
        400
      );
    }

    if (parsedAmountWei !== amountWei) {
      return jsonFailure(
        {
          stage,
          error: "Amount and amountWei do not match.",
          stack: null,
          errorCode: "INVALID_AMOUNT_WEI",
        },
        400
      );
    }

    stage = "groq_env_checked";
    if (!process.env.GROQ_API_KEY?.trim()) {
      return jsonFailure(
        {
          stage,
          errorCode: "GROQ_API_KEY_MISSING",
          error: "GROQ_API_KEY is required.",
          stack: null,
        },
        500
      );
    }

    stage = "groq_request_started";
    let contract: GroqGeneratedContract;
    try {
      contract = await generateContractWithGroq({
        title,
        description,
        amount,
        amountWei,
        clientWallet: wallet,
        chainId,
      });
    } catch (error) {
      stage = "route_failed";
      if (error instanceof GroqContractGeneratorError) {
        console.error("Agent Guild workflow challenge Groq request failed", {
          stage,
          errorCode: error.code,
          error: error.message,
          stack: error.stack ?? null,
        });
        return jsonFailure(
          {
            stage,
            error: error.message,
            stack: error.stack ?? null,
            errorCode: error.code,
          },
          error.code === "MISSING_GROQ_API_KEY" ? 500 : 502
        );
      }

      console.error("Agent Guild workflow challenge unexpected Groq failure", {
        stage,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
      return jsonFailure(
        {
          stage,
          error:
            error instanceof Error ? error.message : "Groq request failed unexpectedly.",
          stack: error instanceof Error ? error.stack ?? null : null,
          errorCode: "GROQ_REQUEST_FAILED",
        },
        502
      );
    }

    stage = "groq_response_received";
    stage = "contract_parsed";
    stage = "response_sent";
    return jsonSuccess(contract, model);
  } catch (error) {
    stage = "route_failed";
    console.error("Agent Guild workflow challenge route failed", {
      stage,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      provider,
      model,
    });
    return jsonFailure(
      {
        stage,
        error: error instanceof Error ? error.message : "Unexpected server error.",
        stack: error instanceof Error ? error.stack ?? null : null,
        errorCode: "UNEXPECTED_SERVER_ERROR",
      },
      500
    );
  }
}
