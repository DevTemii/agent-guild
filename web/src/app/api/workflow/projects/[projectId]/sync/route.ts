import { NextResponse } from "next/server";
import { syncWorkflowProjectDeal } from "@/lib/server/workflowBackend";
import { normalizeLinkedProjectId } from "@/lib/workflowTypes";
import type { ProductContract } from "@/lib/workflowTypes";

export const runtime = "nodejs";

type SyncDealPayload = {
  txHash?: string | null;
  clientWallet?: string | null;
  clientName?: string | null;
  freelancerWallet?: string | null;
  freelancerName?: string | null;
  projectBrief?: string | null;
  amount?: string | null;
  amountWei?: string | null;
  displayBudget?: ProductContract["displayBudget"] | null;
  settlementAmountCelo?: string | null;
  summary?: string | null;
  milestones?: ProductContract["milestones"] | null;
};

function requiredString(value: string | null | undefined, field: string) {
  const normalized = value?.trim() || "";
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  return normalized;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let stage = "route_entered";

  try {
    const { projectId: rawProjectId } = await context.params;
    const projectId = normalizeLinkedProjectId(Number(rawProjectId));
    if (!projectId) {
      return NextResponse.json(
        { success: false, stage, error: "Project ID must be a valid non-zero integer." },
        { status: 400 }
      );
    }

    stage = "body_parsed";
    const body = (await request.json()) as SyncDealPayload;
    if (!body.displayBudget) {
      throw new Error("displayBudget is required.");
    }
    if (!Array.isArray(body.milestones)) {
      throw new Error("milestones is required.");
    }

    stage = "sync_started";
    const result = await syncWorkflowProjectDeal({
      projectId,
      txHash: requiredString(body.txHash, "txHash"),
      clientWallet: requiredString(body.clientWallet, "clientWallet"),
      clientName: requiredString(body.clientName, "clientName"),
      freelancerWallet: requiredString(body.freelancerWallet, "freelancerWallet"),
      freelancerName: requiredString(body.freelancerName, "freelancerName"),
      projectBrief: requiredString(body.projectBrief, "projectBrief"),
      amount: requiredString(body.amount, "amount"),
      amountWei: requiredString(body.amountWei, "amountWei"),
      displayBudget: body.displayBudget,
      settlementAmountCelo: body.settlementAmountCelo?.trim() || null,
      summary: requiredString(body.summary, "summary"),
      milestones: body.milestones,
    });

    return NextResponse.json({
      success: true,
      stage: "response_sent",
      contract: result.contract,
      notification: result.notification,
      storeType: result.storeType,
    });
  } catch (error) {
    console.error("workflow_project_sync_failed", {
      stage,
      error: error instanceof Error ? error.message : "Failed to sync workflow project.",
      stack: error instanceof Error ? error.stack ?? null : null,
    });

    return NextResponse.json(
      {
        success: false,
        stage,
        error: error instanceof Error ? error.message : "Failed to sync workflow project.",
      },
      { status: 500 }
    );
  }
}
