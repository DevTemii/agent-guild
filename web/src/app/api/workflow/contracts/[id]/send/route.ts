import { NextResponse } from "next/server";
import { sendWorkflowContract } from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let stage = "route_entered";
  let contractId = "";

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
        },
        { status: 400 }
      );
    }

    stage = "contract_sent";
    const contract = await sendWorkflowContract(contractId, wallet);
    return NextResponse.json({
      success: true,
      stage: "response_sent",
      contractId,
      status: contract.status,
      contract,
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
      },
      { status: 400 }
    );
  }
}
