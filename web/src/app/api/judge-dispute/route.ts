import { NextResponse } from "next/server";

type JudgeDisputeResponse = {
    verdict: "release_funds" | "refund_client";
    confidence: number;
    reasoning: string;
};

function fallbackJudgment(
    contractSummary: string,
    milestones: Array<{ title: string; amount: number }>,
    submittedWorkLink: string,
    disputeReason: string
): JudgeDisputeResponse {
    const hasWorkLink = !!submittedWorkLink?.trim();
    const hasContractContext =
        !!contractSummary?.trim() && Array.isArray(milestones) && milestones.length > 0;
    const hasDispute = !!disputeReason?.trim();

    if (hasDispute && !hasWorkLink) {
        return {
            verdict: "refund_client",
            confidence: 74,
            reasoning:
                "No submitted work link was provided, so the safer decision is to refund the client.",
        };
    }

    if (hasWorkLink && hasContractContext) {
        return {
            verdict: "release_funds",
            confidence: 68,
            reasoning:
                "The project includes contract context and a submitted work link, so releasing funds is the stronger recommendation.",
        };
    }

    return {
        verdict: "refund_client",
        confidence: 60,
        reasoning:
            "The dispute context is incomplete, so refunding the client is the safer fallback recommendation.",
    };
}

export async function GET() {
    return NextResponse.json({
        ok: true,
        message: "judge-dispute endpoint is live. Please use POST.",
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const contractSummary = body.contractSummary;
        const milestones = body.milestones;
        const submittedWorkLink = body.submittedWorkLink;
        const disputeReason = body.disputeReason;

        if (
            !contractSummary ||
            !Array.isArray(milestones) ||
            milestones.length === 0 ||
            !submittedWorkLink ||
            !disputeReason
        ) {
            return NextResponse.json(
                { error: "Missing required dispute context." },
                { status: 400 }
            );
        }

        const groqKey = process.env.GROQ_API_KEY;

        if (!groqKey) {
            return NextResponse.json(
                fallbackJudgment(
                    contractSummary,
                    milestones,
                    submittedWorkLink,
                    disputeReason
                )
            );
        }

        const prompt = `
Return ONLY valid JSON in this exact format:
{
  "verdict": "release_funds" | "refund_client",
  "confidence": number,
  "reasoning": "short plain English explanation"
}

Rules:
- confidence must be an integer from 0 to 100
- reasoning must be short and plain English
- output raw JSON only
- no markdown
- no backticks

Dispute context:
Contract summary: ${contractSummary}
Milestones: ${JSON.stringify(milestones)}
Submitted work link: ${submittedWorkLink}
Dispute reason: ${disputeReason}
`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${groqKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                temperature: 0.2,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Groq dispute judge API error:", data);
            return NextResponse.json(
                fallbackJudgment(
                    contractSummary,
                    milestones,
                    submittedWorkLink,
                    disputeReason
                )
            );
        }

        let text = data?.choices?.[0]?.message?.content?.trim();

        if (!text) {
            return NextResponse.json(
                fallbackJudgment(
                    contractSummary,
                    milestones,
                    submittedWorkLink,
                    disputeReason
                )
            );
        }

        if (text.startsWith("```")) {
            text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        try {
            const parsed = JSON.parse(text);

            if (
                (parsed.verdict !== "release_funds" &&
                    parsed.verdict !== "refund_client") ||
                typeof parsed.confidence !== "number" ||
                typeof parsed.reasoning !== "string"
            ) {
                throw new Error("Invalid dispute judge response shape");
            }

            return NextResponse.json({
                verdict: parsed.verdict,
                confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
                reasoning: parsed.reasoning,
            });
        } catch (err) {
            console.error("Invalid JSON from dispute judge:", text);
            return NextResponse.json(
                fallbackJudgment(
                    contractSummary,
                    milestones,
                    submittedWorkLink,
                    disputeReason
                )
            );
        }
    } catch (error) {
        console.error("Judge dispute route error:", error);
        return NextResponse.json(
            { error: "Unexpected server error." },
            { status: 500 }
        );
    }
}
