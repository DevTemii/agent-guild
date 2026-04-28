import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import {
  buildDisplayBudgetFromInput,
  validateUsdAmountInput,
  validateWorkflowChallengeAmountInput,
} from "@/lib/budget";
import {
  generateContractWithGroq,
  getGroqModel,
  GroqContractGeneratorError,
} from "@/lib/server/groqContractGenerator";
import { createWorkflowDraft, getWorkflowStoreType } from "@/lib/server/workflowBackend";
import { isWorkflowDatabaseConfigured } from "@/lib/server/workflowDbStore";
import { normalizeChainId } from "@/lib/chainId";
import { normalizeWallet } from "@/lib/workflowTypes";

export const runtime = "nodejs";
const CREATE_DEAL_DB_TIMEOUT_MS = 5000;

type CreateContractPayload = {
  title?: string;
  description?: string;
  amount?: string;
  amountWei?: string;
  clientWallet?: string;
  clientName?: string;
  freelancerWallet?: string;
  freelancerName?: string;
  projectBrief?: string;
  displayBudgetAmountUsd?: string;
  chainId?: number | string;
};

function createErrorResponse(
  stage: string,
  error: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      stage,
      error,
      stack: extra?.stack ?? null,
      ...extra,
    },
    { status }
  );
}

function buildMilestones(amountWei: string, milestoneTitles: string[]) {
  const totalWei = BigInt(amountWei);
  const quarter = totalWei / 4n;
  const amounts = [quarter, quarter, quarter, totalWei - quarter * 3n];

  return milestoneTitles.map((title, index) => ({
    title,
    amount: Number(amounts[index] ?? 0n) / 10 ** 18,
  }));
}

export async function POST(request: Request) {
  let stage:
    | "route_entered"
    | "payload_validated"
    | "groq_started"
    | "groq_finished"
    | "db_write_started"
    | "db_write_finished"
    | "response_sent"
    | "failed" = "route_entered";

  const provider = "groq";
  const model = getGroqModel();

  try {
    console.log("workflow contract create route entered", { stage });
    const rawBody = await request.text();
    let body: CreateContractPayload = {};

    try {
      body = rawBody ? (JSON.parse(rawBody) as CreateContractPayload) : {};
    } catch (error) {
      return createErrorResponse("body_parse_failed", "Invalid JSON payload.", 400, {
        stack: error instanceof Error ? error.stack : null,
        rawBodyPreview: rawBody.slice(0, 500),
      });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const amountWei = typeof body.amountWei === "string" ? body.amountWei.trim() : "";
    const clientWallet = normalizeWallet(body.clientWallet);
    const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
    const freelancerWallet = normalizeWallet(body.freelancerWallet);
    const freelancerName =
      typeof body.freelancerName === "string" ? body.freelancerName.trim() : "";
    const projectBrief =
      typeof body.projectBrief === "string" ? body.projectBrief.trim() : "";
    const displayBudgetAmountUsd =
      typeof body.displayBudgetAmountUsd === "string"
        ? body.displayBudgetAmountUsd.trim()
        : "";
    const chainId = normalizeChainId(body.chainId);

    stage = "payload_validated";
    const missingFields = [
      !title ? "title" : null,
      !description ? "description" : null,
      !amount ? "amount" : null,
      !amountWei ? "amountWei" : null,
      !clientWallet ? "clientWallet" : null,
      !clientName ? "clientName" : null,
      !freelancerWallet ? "freelancerWallet" : null,
      !freelancerName ? "freelancerName" : null,
      !projectBrief ? "projectBrief" : null,
      !displayBudgetAmountUsd ? "displayBudgetAmountUsd" : null,
      chainId === null ? "chainId" : null,
    ].filter((value): value is string => Boolean(value));

    if (missingFields.length > 0) {
      return createErrorResponse(
        stage,
        `Missing required fields: ${missingFields.join(", ")}`,
        400,
        {
          missingFields,
        }
      );
    }

    if (chainId !== 42220) {
      return createErrorResponse(stage, "MiniPay must be connected to Celo Mainnet (42220).", 400, {
        errorCode: "INVALID_CHAIN_ID",
      });
    }

    const workflowAmountError = validateWorkflowChallengeAmountInput(amount);
    if (workflowAmountError) {
      return createErrorResponse(stage, workflowAmountError, 400, {
        errorCode: "INVALID_AMOUNT",
      });
    }

    const displayBudgetError = validateUsdAmountInput(displayBudgetAmountUsd);
    if (displayBudgetError) {
      return createErrorResponse(stage, displayBudgetError, 400, {
        errorCode: "INVALID_DISPLAY_BUDGET",
      });
    }

    let parsedAmountWei: string;
    try {
      parsedAmountWei = parseUnits(amount, 18).toString();
    } catch (error) {
      return createErrorResponse(stage, "Amount could not be converted to wei.", 400, {
        errorCode: "INVALID_AMOUNT",
        stack: error instanceof Error ? error.stack : null,
      });
    }

    if (parsedAmountWei !== amountWei) {
      return createErrorResponse(stage, "Amount and amountWei do not match.", 400, {
        errorCode: "INVALID_AMOUNT_WEI",
      });
    }

    if (!process.env.GROQ_API_KEY?.trim()) {
      return createErrorResponse("failed", "GROQ_API_KEY is required.", 500, {
        errorCode: "GROQ_API_KEY_MISSING",
        provider,
        model,
      });
    }

    console.log("workflow contract create stage", { stage });

    if (process.env.NODE_ENV === "production" && !isWorkflowDatabaseConfigured()) {
      return createErrorResponse("failed", "DATABASE_URL missing or invalid", 500, {
        errorCode: "DATABASE_URL_MISSING_OR_INVALID",
        provider,
        model,
      });
    }

    stage = "groq_started";
    console.log("workflow contract create stage", { stage, provider, model });
    const generatedContract = await generateContractWithGroq({
      title,
      description,
      amount,
      amountWei,
      clientWallet,
      freelancerWallet,
      chainId,
    });

    stage = "groq_finished";
    console.log("workflow contract create stage", { stage, provider, model });
    const summary = `Client agrees to pay Freelancer ${generatedContract.amount} CELO after successful delivery of ${generatedContract.deliverable}.`;
    stage = "db_write_started";
    console.log("workflow contract create stage", { stage, provider, model });
    const contract = await Promise.race([
      createWorkflowDraft(clientWallet, {
        amount: generatedContract.amount,
        amountWei: generatedContract.amountWei,
        clientWallet,
        clientName,
        freelancerWallet,
        freelancerName,
        projectBrief,
        displayBudget: buildDisplayBudgetFromInput(displayBudgetAmountUsd),
        settlementAmountCelo: null,
        summary,
        milestones: buildMilestones(generatedContract.amountWei, generatedContract.milestones),
        linkedProjectId: null,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Workflow database write timed out after 5 seconds."));
        }, CREATE_DEAL_DB_TIMEOUT_MS);
      }),
    ]);

    stage = "db_write_finished";
    console.log("workflow contract create stage", { stage, provider, model, contractId: contract.id });
    stage = "response_sent";
    console.log("workflow contract create stage", {
      stage,
      provider,
      model,
      contractId: contract.id,
    });
    return NextResponse.json({
      success: true,
      stage: "response_sent",
      contract,
      debug: {
        provider,
        model,
        storeType: getWorkflowStoreType(),
      },
      storeType: getWorkflowStoreType(),
    });
  } catch (error) {
    if (error instanceof GroqContractGeneratorError) {
      console.error("Agent Guild workflow contract create Groq failure", {
        stage,
        provider,
        model,
        errorCode: error.code,
        error: error.message,
        stack: error.stack ?? null,
      });
      return createErrorResponse(stage, error.message, error.code === "MISSING_GROQ_API_KEY" ? 500 : 502, {
        errorCode: error.code,
        provider,
        model,
      });
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    const errorCode =
      message.includes("DATABASE_URL")
        ? "DATABASE_URL_MISSING_OR_INVALID"
        : message.includes("database write timed out")
          ? "DATABASE_WRITE_TIMEOUT"
          : message.includes("Workflow schema initialization timed out")
            ? "DATABASE_SCHEMA_TIMEOUT"
            : stage === "db_write_started" || stage === "db_write_finished"
              ? "DATABASE_URL_MISSING_OR_INVALID"
            : "UNEXPECTED_SERVER_ERROR";
    stage = "failed";
    console.error("Agent Guild workflow contract create route failed", {
      stage,
      provider,
      model,
      error: message,
      stack: error instanceof Error ? error.stack : null,
    });
    return createErrorResponse(
      stage,
      message,
      errorCode === "UNEXPECTED_SERVER_ERROR" ? 500 : 503,
      {
        stack: error instanceof Error ? error.stack : null,
        errorCode,
        provider,
        model,
      }
    );
  }
}
