import { NextResponse } from "next/server";

type ContractResponse = {
    clientName: string;
    projectDescription: string;
    budget: number;
    summary: string;
    milestones: {
        title: string;
        amount: number;
    }[];
};

function fallbackContract(
    clientName: string,
    projectDescription: string,
    budget: number
): ContractResponse {
    const part1 = Math.floor(budget * 0.3);
    const part2 = Math.floor(budget * 0.4);
    const part3 = budget - part1 - part2;

    return {
        clientName,
        projectDescription,
        budget,
        summary:
            "This freelance engagement is structured into three milestones covering planning, execution, and final delivery.",
        milestones: [
            { title: "Discovery and planning", amount: part1 },
            { title: "Core execution", amount: part2 },
            { title: "Final delivery and revisions", amount: part3 },
        ],
    };
}

export async function GET() {
    return NextResponse.json({
        ok: true,
        message: "generate-contract endpoint is live. Please use POST.",
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const clientName = body.clientName;
        const projectDescription = body.projectDescription;
        const budget = Number(body.budget);

        if (!clientName || !projectDescription || !budget) {
            return NextResponse.json(
                { error: "Missing required fields." },
                { status: 400 }
            );
        }

        const groqKey = process.env.GROQ_API_KEY;

        if (!groqKey) {
            return NextResponse.json(fallbackContract(clientName, projectDescription, budget));
        }

        const prompt = `
Return ONLY valid JSON in this exact format:
{
  "clientName": "string",
  "projectDescription": "string",
  "budget": number,
  "summary": "string",
  "milestones": [
    { "title": "string", "amount": number },
    { "title": "string", "amount": number },
    { "title": "string", "amount": number }
  ]
}

Rules:
- milestone amounts must add up exactly to the total budget
- keep summary concise and professional
- output raw JSON only
- no markdown
- no backticks

Inputs:
Client name: ${clientName}
Project description: ${projectDescription}
Budget: ${budget} USD
`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
            console.error("Groq API error:", data);
            return NextResponse.json(fallbackContract(clientName, projectDescription, budget));
        }

        let text = data?.choices?.[0]?.message?.content?.trim();

        if (!text) {
            return NextResponse.json(fallbackContract(clientName, projectDescription, budget));
        }

        if (text.startsWith("```")) {
            text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        try {
            const parsed = JSON.parse(text);
            return NextResponse.json(parsed);
        } catch (err) {
            console.error("Invalid JSON from Groq:", text);
            return NextResponse.json(fallbackContract(clientName, projectDescription, budget));
        }
    } catch (error) {
        console.error("Route error:", error);
        return NextResponse.json(
            { error: "Unexpected server error." },
            { status: 500 }
        );
    }
}