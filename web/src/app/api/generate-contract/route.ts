export async function POST(req: Request) {
    try {
        const { clientName, projectDescription, budget } = await req.json();

        if (!clientName || !projectDescription || !budget) {
            return Response.json(
                { error: "Missing required fields." },
                { status: 400 }
            );
        }

        const prompt = `
You are a freelance contract assistant for Agent Guild.

Generate ONLY valid JSON in this exact format:
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
- The milestone amounts must add up exactly to the total budget.
- Make the milestones realistic for freelance project delivery.
- Keep the summary concise and professional.
- Return only JSON.
- No markdown.
- No backticks.

Inputs:
Client name: ${clientName}
Project description: ${projectDescription}
Budget: ${budget} USD
`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: process.env.OPENROUTER_MODEL || "openrouter/free",
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!response.ok || !text) {
            console.error("OpenRouter error:", data);
            return Response.json(
                { error: data?.error?.message || "Failed to generate contract." },
                { status: 500 }
            );
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            console.error("Invalid JSON from model:", text);
            return Response.json(
                { error: "Model did not return valid JSON.", raw: text },
                { status: 500 }
            );
        }

        return Response.json(parsed);
    } catch (error) {
        console.error("Route error:", error);
        return Response.json(
            { error: "Unexpected server error." },
            { status: 500 }
        );
    }
}