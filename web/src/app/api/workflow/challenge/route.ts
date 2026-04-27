import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import {
  generateContractWithGroq,
  getGroqModel,
  type GroqGeneratedContract,
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

type ChallengeJsonFailure = {
  success: false;
  stage: string;
  error: string;
  stack: string | null;
  provider: string;
  model: string;
  errorCode?: string;
  debug?: Record<string, unknown> | null;
};

type ChallengeJsonSuccess = {
  success: true;
  stage: "response_sent";
  contract: GroqGeneratedContract;
  provider: string;
  model: string;
  debug?: Record<string, unknown> | null;
};

function createFallbackContract(input: {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
}): GroqGeneratedContract {
  return {
    title: input.title,
    description: input.description,
    amount: input.amount,
    amountWei: input.amountWei,
    currency: "CELO",
    deliverable: input.description,
    payoutTerms: "Client releases funds after submitted work is reviewed.",
    deliveryWindow: "1 day",
    milestones: [
      "Freelancer accepts the deal",
      "Client secures payment",
      "Freelancer submits work",
      "Client confirms payout",
    ],
  };
}

function jsonFailure(
  input: Omit<ChallengeJsonFailure, "success" | "provider" | "model"> & {
    provider?: string;
    model?: string;
  },
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      stage: input.stage,
      error: input.error,
      stack: input.stack,
      provider: input.provider ?? "groq",
      model: input.model ?? getGroqModel(),
      errorCode: input.errorCode,
      debug: input.debug ?? null,
    } satisfies ChallengeJsonFailure,
    { status }
  );
}

function jsonSuccess(
  contract: GroqGeneratedContract,
  input?: {
    provider?: string;
    model?: string;
    debug?: Record<string, unknown>;
  }
) {
  return NextResponse.json({
    success: true,
    stage: "response_sent",
    contract,
    provider: input?.provider ?? "groq",
    model: input?.model ?? getGroqModel(),
    debug: input?.debug ?? null,
  } satisfies ChallengeJsonSuccess);
}

function safeJsonParse(rawBody: string) {
  try {
    return {
      ok: true as const,
      value: (rawBody ? JSON.parse(rawBody) : {}) as WorkflowChallengePayload,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to parse request body.",
      stack: error instanceof Error ? error.stack ?? null : null,
    };
  }
}

export async function POST(request: Request) {
  let stage:
    | "route_entered"
    | "payload_validated"
    | "groq_client_initialized"
    | "ai_request_started"
    | "ai_response_received"
    | "contract_parsed"
    | "response_sent"
    | "route_failed" = "route_entered";

  const provider = "groq";
  const model = getGroqModel();
  console.log("workflow challenge route entered");

  try {
    const hasGroqApiKey = Boolean(process.env.GROQ_API_KEY?.trim());
    const hasWorkflowSessionSecret = Boolean(process.env.WORKFLOW_SESSION_SECRET?.trim());
    const rawBody = await request.text().catch((error) => {
      throw new Error(
        error instanceof Error ? error.message : "Failed to read request body."
      );
    });

    const parsedBodyResult = safeJsonParse(rawBody);
    if (!parsedBodyResult.ok) {
      stage = "route_failed";
      console.error("Agent Guild workflow challenge body parse failed", {
        stage,
        error: parsedBodyResult.error,
        stack: parsedBodyResult.stack,
      });
      return jsonFailure(
        {
          stage,
          error: parsedBodyResult.error,
          stack: parsedBodyResult.stack,
          provider,
          model,
          errorCode: "INVALID_JSON_BODY",
          debug: {
            rawBodyPreview: rawBody.slice(0, 500),
            hasGroqApiKey,
            hasWorkflowSessionSecret,
          },
        },
        400
      );
    }

    const body = parsedBodyResult.value;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const amountWei = typeof body.amountWei === "string" ? body.amountWei.trim() : "";
    const wallet = normalizeWallet(body.wallet);
    const freelancerWallet = normalizeWallet(body.freelancerWallet);
    const chainId = normalizeChainId(body.chainId);

    stage = "payload_validated";
    const missingFields = [
      !title ? "title" : null,
      !description ? "description" : null,
      !amount ? "amount" : null,
      !wallet ? "wallet" : null,
    ].filter((value): value is string => Boolean(value));

    if (missingFields.length > 0) {
      console.error("Agent Guild workflow challenge payload invalid", {
        stage,
        missingFields,
        body,
      });
      return jsonFailure(
        {
          stage,
          error: `Missing required fields: ${missingFields.join(", ")}`,
          stack: null,
          provider,
          model,
          errorCode: "INVALID_PAYLOAD",
          debug: {
            rawBodyPreview: rawBody.slice(0, 500),
            missingFields,
          },
        },
        400
      );
    }

    if (!/^\d+(\.\d+)?$/.test(amount)) {
      return jsonFailure(
        {
          stage,
          error: "Amount must use plain decimal format.",
          stack: null,
          provider,
          model,
          errorCode: "INVALID_AMOUNT",
        },
        400
      );
    }

    const decimals = amount.split(".")[1]?.length ?? 0;
    if (decimals > 18) {
      return jsonFailure(
        {
          stage,
          error: "Amount supports up to 18 decimal places.",
          stack: null,
          provider,
          model,
          errorCode: "INVALID_AMOUNT_PRECISION",
        },
        400
      );
    }

    let parsedAmountWei = amountWei;
    try {
      parsedAmountWei = amountWei || parseUnits(amount, 18).toString();
    } catch (error) {
      return jsonFailure(
        {
          stage,
          error: "Amount could not be converted to wei.",
          stack: error instanceof Error ? error.stack ?? null : null,
          provider,
          model,
          errorCode: "INVALID_AMOUNT",
        },
        400
      );
    }

    if (parsedAmountWei === "0") {
      return jsonFailure(
        {
          stage,
          error: "Amount must be greater than zero.",
          stack: null,
          provider,
          model,
          errorCode: "INVALID_AMOUNT",
        },
        400
      );
    }

    stage = "groq_client_initialized";
    if (!hasGroqApiKey || !hasWorkflowSessionSecret) {
      const fallback = createFallbackContract({
        title,
        description,
        amount,
        amountWei: parsedAmountWei,
      });
      console.error("Agent Guild workflow challenge using fallback due to missing env", {
        stage,
        hasGroqApiKey,
        hasWorkflowSessionSecret,
      });
      stage = "response_sent";
      return jsonSuccess(fallback, {
        provider,
        model,
        debug: {
          fallbackUsed: true,
          fallbackReason: !hasGroqApiKey
            ? "Missing GROQ_API_KEY"
            : "Missing WORKFLOW_SESSION_SECRET",
          hasGroqApiKey,
          hasWorkflowSessionSecret,
          wallet,
          freelancerWallet,
          chainId,
        },
      });
    }

    let contract = createFallbackContract({
      title,
      description,
      amount,
      amountWei: parsedAmountWei,
    });

    try {
      stage = "ai_request_started";
      const generated = await generateContractWithGroq({
        title,
        description,
        amount,
        amountWei: parsedAmountWei,
        clientWallet: wallet,
        freelancerWallet: freelancerWallet || undefined,
        chainId: chainId ?? 42220,
      });
      stage = "ai_response_received";
      contract = generated;
      stage = "contract_parsed";
    } catch (error) {
      console.error("Agent Guild workflow challenge Groq generation failed", {
        stage,
        provider,
        model,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }

    stage = "response_sent";
    return jsonSuccess(contract, {
      provider,
      model,
      debug: {
        fallbackUsed: contract.deliverable === description,
        hasGroqApiKey,
        hasWorkflowSessionSecret,
        wallet,
        freelancerWallet,
        chainId,
      },
    });
  } catch (error) {
    stage = "route_failed";
    console.error("Agent Guild workflow challenge route failed", {
      stage,
      provider,
      model,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
    return jsonFailure(
      {
        stage,
        error: error instanceof Error ? error.message : "Unexpected server error.",
        stack: error instanceof Error ? error.stack ?? null : null,
        provider,
        model,
        errorCode: "UNEXPECTED_SERVER_ERROR",
      },
      500
    );
  }
}
