import { NextResponse } from "next/server";
import {
  getWorkflowSubmission,
  upsertWorkflowSubmission,
} from "@/lib/server/workflowBackend";
import { resolveWorkflowRequestWallet } from "@/lib/server/workflowAuth";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const wallet = await resolveWorkflowRequestWallet(request);
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const { projectId } = await context.params;
    const submission = await getWorkflowSubmission(Number(projectId), wallet);
    return NextResponse.json({ submission });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load project submission.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let stage = "route_entered";
  try {
    stage = "body_parsed";
    const body = (await request.json()) as {
      deliveryUrl?: string;
      clientWallet?: string;
      freelancerWallet?: string;
      txHash?: string | null;
      wallet?: string;
    };

    if (!body.deliveryUrl?.trim()) {
      return NextResponse.json({ success: false, stage, error: "Delivery URL is required.", stack: null }, { status: 400 });
    }

    const wallet = await resolveWorkflowRequestWallet(request, body.wallet);
    if (!wallet) {
      return NextResponse.json({ success: false, stage, error: "Wallet is required.", stack: null }, { status: 401 });
    }

    const { projectId } = await context.params;
    const submission = await upsertWorkflowSubmission({
      wallet,
      projectId: Number(projectId),
      deliveryUrl: body.deliveryUrl,
      clientWallet: body.clientWallet ?? "",
      freelancerWallet: body.freelancerWallet ?? "",
      txHash: body.txHash ?? null,
    });

    return NextResponse.json({ success: true, stage: "response_sent", submission });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save project submission.";
    return NextResponse.json({ success: false, stage, error: message, stack: error instanceof Error ? error.stack ?? null : null }, { status: 400 });
  }
}
