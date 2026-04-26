import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { buildDisplayBudgetFromInput, validateUsdAmountInput, validateWorkflowChallengeAmountInput } from "@/lib/budget";
import {
  generateContractWithGroq,
  getGroqModel,
  GroqContractGeneratorError,
} from "@/lib/server/groqContractGenerator";
import { createWorkflowDraft } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";
import { normalizeChainId } from "@/lib/chainId";
import { normalizeWallet } from "@/lib/workflowTypes";

export const runtime = "nodejs";

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
  let stage = "route_entered";

  try {
    const wallet = await getWorkflowSessionWallet();
    if (!wallet) {
      return createErrorResponse(stage, "Workflow session required.", 401);
    }

    const rawBody = await request.text();
    let body: CreateContractPayload = {};

    try {
      body = rawBody ? (JSON.parse(rawBody) as CreateContractPayload) : {};
    } catch (error) {
      return createErrorResponse("body_parse_failed", "Invalid JSON payload.", 400, {
        stack: error instanceof Error ? error.stack : null,
      });
    }

    stage = "payload_validated";
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
      return createErrorResponse(stage, `Missing required fields: ${missingFields.join(", ")}`, 400);
    }

    if (wallet !== clientWallet) {
      return createErrorResponse(stage, "Only the connected client wallet can create this contract.", 403);
    }

    if (chainId !== 42220) {
      return createErrorResponse(stage, "MiniPay must be connected to Celo Mainnet (42220).", 400);
    }

    const workflowAmountError = validateWorkflowChallengeAmountInput(amount);
    if (workflowAmountError) {
      return createErrorResponse(stage, workflowAmountError, 400);
    }

    const displayBudgetError = validateUsdAmountInput(displayBudgetAmountUsd);
    if (displayBudgetError) {
      return createErrorResponse(stage, displayBudgetError, 400);
    }

    const parsedAmountWei = parseUnits(amount, 18).toString();
    if (parsedAmountWei !== amountWei) {
      return createErrorResponse(stage, "Amount and amountWei do not match.", 400);
    }

    stage = "ai_generation_started";
    const generatedContract = await generateContractWithGroq({
      title,
      description,
      amount,
      amountWei,
      clientWallet,
      freelancerWallet,
      chainId,
    });

    stage = "contract_persisted";
    const summary = `Client agrees to pay Freelancer ${generatedContract.amount} CELO after successful delivery of ${generatedContract.deliverable}.`;
    const contract = await createWorkflowDraft(wallet, {
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
    });

    return NextResponse.json({
      success: true,
      stage: "response_sent",
      contract,
      debug: {
        provider: "groq",
        model: getGroqModel(),
      },
    });
  } catch (error) {
    if (error instanceof GroqContractGeneratorError) {
      return createErrorResponse(stage, error.message, error.code === "MISSING_GROQ_API_KEY" ? 500 : 502, {
        errorCode: error.code,
      });
    }

    return createErrorResponse(stage, error instanceof Error ? error.message : "Unexpected server error.", 500, {
      stack: error instanceof Error ? error.stack : null,
    });
  }
}
