import { NextResponse } from "next/server";
import { sendWorkflowContract } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let stage:
    | "route_entered"
    | "body_parsed"
    | "payload_validated"
    | "contract_lookup_started"
    | "contract_marked_sent"
    | "response_sent" = "route_entered";
  let contractId = "";
  let payload: Record<string, unknown> | null = null;

  try {
    const { id } = await context.params;
    contractId = id;

    const rawBody = await request.text();
    let parsedBody: {
      clientWallet?: string;
      freelancerWallet?: string;
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
            payload: rawBody.slice(0, 500),
          },
          { status: 400 }
        );
      }
    }

    stage = "body_parsed";
    payload = parsedBody as Record<string, unknown>;
    const normalizedClientWallet = normalizeWallet(parsedBody.clientWallet);
    const normalizedFreelancerWallet = normalizeWallet(parsedBody.freelancerWallet);
    const wallet = await resolveWorkflowRequestWallet(request, normalizedClientWallet);

    stage = "payload_validated";
    if (!contractId) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Contract id is required.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 400 }
      );
    }

    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          stage,
          error: "Client wallet is required.",
          stack: null,
          contractId,
          status: null,
          payload,
        },
        { status: 401 }
      );
    }

    stage = "contract_lookup_started";
    const contract = await sendWorkflowContract(contractId, wallet, normalizedFreelancerWallet);

    stage = "contract_marked_sent";
    return NextResponse.json({
      success: true,
      stage: "response_sent",
      contractId,
      status: contract.status,
      contract,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        stage,
        error: error instanceof Error ? error.message : "Failed to send contract.",
        stack: error instanceof Error ? error.stack ?? null : null,
        contractId,
        status: null,
        payload,
      },
      { status: 400 }
    );
  }
}
