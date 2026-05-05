import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CreateContractInput = {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
  clientWallet: string;
  clientName: string;
  freelancerWallet: string;
  freelancerName: string;
  projectBrief: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: CreateContractInput = await req.json();

    if (!body.clientWallet || !body.freelancerWallet) {
      return NextResponse.json(
        { success: false, error: "MISSING_WALLETS" },
        { status: 400 }
      );
    }

    const clientWallet = body.clientWallet.toLowerCase();
    const freelancerWallet = body.freelancerWallet.toLowerCase();

    console.log("create_contract_start", {
      clientWallet,
      freelancerWallet,
    });

    let summary = "Client agrees to pay freelancer upon delivery.";

    try {
      const groqResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content: "Generate a simple freelance contract summary.",
              },
              {
                role: "user",
                content: `Create a contract: ${body.projectBrief}`,
              },
            ],
          }),
        }
      );
      if (groqResponse.ok) {
        const data = await groqResponse.json();
        summary = data?.choices?.[0]?.message?.content || summary;
      }
    } catch (e) {
      console.warn("groq_failed_fallback_used");
    }

    const amountNum = Number(body.amount);

    const draft = {
      clientWallet,
      clientName: body.clientName,
      freelancerWallet,
      freelancerName: body.freelancerName,
      projectBrief: body.projectBrief,
      amount: body.amount,
      amountWei: body.amountWei,
      settlementAmountCelo: body.amount,
      summary,
      milestones: [
        { title: "Milestone 1", amount: amountNum / 4 },
        { title: "Milestone 2", amount: amountNum / 4 },
        { title: "Milestone 3", amount: amountNum / 4 },
        { title: "Milestone 4", amount: amountNum / 4 },
      ],
      createdAt: new Date().toISOString(),
    };

    console.log("create_contract_draft_generated_only");

    return NextResponse.json({
      success: true,
      stage: "draft_generated",
      draft,
    });
  } catch (error) {
    console.error("create_contract_error", error);

    return NextResponse.json(
      {
        success: false,
        error: "CREATE_CONTRACT_FAILED",
      },
      { status: 500 }
    );
  }
}