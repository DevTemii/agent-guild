import { NextResponse } from "next/server";
import {
  getWorkflowSubmission,
  upsertWorkflowSubmission,
} from "@/lib/server/workflowBackend";
import { getWorkflowSessionWallet } from "@/lib/server/workflowAuth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const wallet = await getWorkflowSessionWallet();
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
  const wallet = await getWorkflowSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Workflow session required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      deliveryUrl?: string;
      clientWallet?: string;
      freelancerWallet?: string;
      txHash?: string | null;
    };

    if (!body.deliveryUrl?.trim()) {
      return NextResponse.json({ error: "Delivery URL is required." }, { status: 400 });
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

    return NextResponse.json(submission);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save project submission.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
