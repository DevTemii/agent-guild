import { NextResponse } from "next/server";
import {
  sendWorkflowContract,
  sendWorkflowContractFromPayload,
} from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";
import { normalizeContract, normalizeWallet } from "@/lib/workflowTypes";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let stage = "route_entered";
  let contractId = "";
  let payload: Record<string, unknown> | null = null;

  try {
    const { id } = await context.params;
    contractId = id;

    stage = "session_checked";
    const wallet = await getWorkflowSessionWallet();
    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Workflow session required.",
          stack: null,
          contractId,
          status: null,
        },
        { status: 401 }
      );
    }

    stage = "body_parse_started";
    const rawBody = await request.text();
    let parsedBody: {
      contractId?: string;
      clientWallet?: string;
      freelancerWallet?: string;
      selectedContract?: {
        id?: string;
        status?: string;
        clientWallet?: string;
        freelancerWallet?: string;
        clientName?: string;
        freelancerName?: string;
        projectBrief?: string;
        displayBudget?: unknown;
        settlementAmountCelo?: string | null;
        summary?: string;
        milestones?: unknown;
        linkedProjectId?: number | null;
        createdAt?: string;
        updatedAt?: string;
      };
    } = {};

    if (rawBody.trim()) {
      try {
        parsedBody = JSON.parse(rawBody) as typeof parsedBody;
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            stage: "body_parse_failed",
            error: error instanceof Error ? error.message : "Invalid JSON payload.",
            stack: error instanceof Error ? error.stack ?? null : null,
            contractId,
            status: null,
          },
          { status: 400 }
        );
      }
    }

    stage = "body_parsed";
    payload = parsedBody as Record<string, unknown>;
    stage = "payload_validated";
    const normalizedClientWallet = normalizeWallet(parsedBody.clientWallet);
    const normalizedFreelancerWallet = normalizeWallet(parsedBody.freelancerWallet);
    const normalizedSelectedClientWallet = normalizeWallet(
      parsedBody.selectedContract?.clientWallet
    );
    const normalizedSelectedFreelancerWallet = normalizeWallet(
      parsedBody.selectedContract?.freelancerWallet
    );

    if (
      !parsedBody.contractId ||
      !normalizedClientWallet ||
      !normalizedFreelancerWallet ||
      !parsedBody.selectedContract
    ) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error:
            "Missing required send deal fields: contractId, clientWallet, freelancerWallet, selectedContract.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 400 }
      );
    }

    if (parsedBody.contractId !== contractId) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Contract id mismatch in send deal payload.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 400 }
      );
    }

    if (
      parsedBody.selectedContract.id !== contractId ||
      normalizedSelectedClientWallet !== normalizedClientWallet ||
      normalizedSelectedFreelancerWallet !== normalizedFreelancerWallet
    ) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Selected contract details do not match the send deal payload.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 400 }
      );
    }

    stage = "contract_loaded";
    const rawDisplayBudget = parsedBody.selectedContract.displayBudget;
    const rawMilestones = parsedBody.selectedContract.milestones;
    const normalizedDisplayBudget =
      rawDisplayBudget &&
      typeof rawDisplayBudget === "object" &&
      typeof (rawDisplayBudget as { amount?: unknown }).amount === "number"
        ? {
            amount: (rawDisplayBudget as { amount: number }).amount,
            currency: "USD" as const,
            label:
              typeof (rawDisplayBudget as { label?: unknown }).label === "string"
                ? (rawDisplayBudget as { label: string }).label
                : "",
          }
        : null;
    const normalizedMilestones = Array.isArray(rawMilestones)
      ? rawMilestones
          .filter(
            (entry): entry is { title: string; amount: number } =>
              Boolean(entry) &&
              typeof entry === "object" &&
              typeof (entry as { title?: unknown }).title === "string" &&
              typeof (entry as { amount?: unknown }).amount === "number"
          )
          .map((entry) => ({
            title: entry.title,
            amount: entry.amount,
          }))
      : [];

    if (
      !parsedBody.selectedContract.clientName?.trim() ||
      !parsedBody.selectedContract.freelancerName?.trim() ||
      !parsedBody.selectedContract.projectBrief?.trim() ||
      !parsedBody.selectedContract.summary?.trim() ||
      !normalizedDisplayBudget ||
      normalizedMilestones.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Selected contract payload is missing required draft fields.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 400 }
      );
    }

    const selectedContractStatus =
      parsedBody.selectedContract?.status === "draft" ||
      parsedBody.selectedContract?.status === "sent" ||
      parsedBody.selectedContract?.status === "approved" ||
      parsedBody.selectedContract?.status === "rejected"
        ? parsedBody.selectedContract.status
        : "draft";
    const selectedContract = normalizeContract({
      ...(parsedBody.selectedContract ?? {}),
      id: contractId,
      clientWallet: normalizedClientWallet,
      freelancerWallet: normalizedFreelancerWallet,
      clientName: parsedBody.selectedContract.clientName.trim(),
      freelancerName: parsedBody.selectedContract.freelancerName.trim(),
      projectBrief: parsedBody.selectedContract.projectBrief.trim(),
      displayBudget: normalizedDisplayBudget,
      settlementAmountCelo:
        typeof parsedBody.selectedContract.settlementAmountCelo === "string"
          ? parsedBody.selectedContract.settlementAmountCelo
          : null,
      summary: parsedBody.selectedContract.summary.trim(),
      milestones: normalizedMilestones,
      status: selectedContractStatus,
      linkedProjectId:
        typeof parsedBody.selectedContract.linkedProjectId === "number"
          ? parsedBody.selectedContract.linkedProjectId
          : null,
      createdAt: parsedBody.selectedContract.createdAt ?? new Date().toISOString(),
      updatedAt: parsedBody.selectedContract.updatedAt ?? new Date().toISOString(),
    });

    if (!selectedContract) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Selected contract payload is invalid.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 400 }
      );
    }

    stage = "status_checked";
    if (selectedContract.status !== "draft") {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: `Only draft deals can be sent. Current status: ${selectedContract.status}.`,
          stack: null,
          contractId,
          status: selectedContract.status,
          payload,
        },
        { status: 400 }
      );
    }

    stage = "contract_marked_sent";
    const contract = contractId.startsWith("local-")
      ? await sendWorkflowContractFromPayload(contractId, wallet, selectedContract)
      : await sendWorkflowContract(contractId, wallet);
    stage = "notification_created";
    return NextResponse.json({
      success: true,
      stage: "response_sent",
      contractId,
      status: contract.status,
      contract,
      payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send contract.";
    return NextResponse.json(
      {
        success: false,
        stage,
        error: message,
        stack: error instanceof Error ? error.stack ?? null : null,
        contractId,
        status: null,
        payload,
      },
      { status: 400 }
    );
  }
}
