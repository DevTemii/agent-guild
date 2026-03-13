import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const { clientName, projectDescription, budget } = body;

        if (!clientName || !projectDescription || !budget) {
            return NextResponse.json(
                { error: "Missing required fields." },
                { status: 400 }
            );
        }

        const prompt = `
You are an AI contract generator for a freelance platform called Agent Guild.

Create a simple freelance contract.

Client: ${clientName}
Project: ${projectDescription}
Budget: $${budget}

Return a contract summary and 3 milestones with payment amounts.
`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });

        const data = await response.json();

        const text = data.choices?.[0]?.message?.content;

        if (!text) {
            return NextResponse.json(
                { error: "AI returned empty response." },
                { status: 500 }
            );
        }

        return NextResponse.json({ contract: text });
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            { error: "AI contract generation failed." },
            { status: 500 }
        );
    }
}