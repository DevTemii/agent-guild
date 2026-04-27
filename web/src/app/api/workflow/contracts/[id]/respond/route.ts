import { NextResponse } from "next/server";
import { respondToWorkflowContract } from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";
import { normalizeWallet } from "@/lib/workflowTypes";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let stage = "route_entered";
  try {
    stage = "body_parsed";
    const body = (await request.json()) as {
      status?: "approved" | "rejected";
      freelancerWallet?: string;
    };
    if (body.status !== "approved" && body.status !== "rejected") {
      return NextResponse.json(
        { success: false, stage, error: "A valid response status is required.", stack: null },
        { status: 400 }
      );
    }

    const wallet = await resolveWorkflowRequestWallet(request, normalizeWallet(body.freelancerWallet));
    if (!wallet) {
      return NextResponse.json(
        { success: false, stage, error: "Freelancer wallet is required.", stack: null },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const contract = await respondToWorkflowContract(id, wallet, body.status);
    return NextResponse.json({ success: true, stage: "response_sent", contract });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to respond to contract.";
    return NextResponse.json(
      { success: false, stage, error: message, stack: error instanceof Error ? error.stack ?? null : null },
      { status: 400 }
    );
  }
}
