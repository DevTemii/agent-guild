import { NextResponse } from "next/server";
import { buildDisplayBudget, parseUsdAmountInput } from "@/lib/budget";

export const runtime = "nodejs";

type ContractResponse = {
  clientName: string;
  projectDescription: string;
  displayBudget: {
    amount: number;
    currency: "USD";
    label: string;
  };
  summary: string;
  milestones: {
    title: string;
    amount: number;
  }[];
};

type AiDebugPayload = {
  provider: string | null;
  model: string | null;
  status: "success" | "fallback";
  stage: string;
  fallbackUsed: boolean;
  rawError: string | null;
  rawResponse: string | null;
  reason: string | null;
};

type GenerateContractResponse = ContractResponse & {
  aiDebug: AiDebugPayload;
};

const AI_TIMEOUT_MS = 10_000;

function splitIntoMilestones(displayBudgetAmountUsd: number) {
  const cents = BigInt(Math.round(displayBudgetAmountUsd * 100));
  const part1 = cents * 30n / 100n;
  const part2 = cents * 40n / 100n;
  const part3 = cents - part1 - part2;

  return [part1, part2, part3].map((value, index) => ({
    title:
      index === 0
        ? "Discovery and planning"
        : index === 1
          ? "Core execution"
          : "Final delivery and revisions",
    amount: Number(value) / 100,
  }));
}

function createFallbackContract(
  clientName: string,
  projectDescription: string,
  displayBudgetAmountUsd: number,
  rawAmountInput: string,
  aiDebug: AiDebugPayload
): GenerateContractResponse {
  return {
    clientName,
    projectDescription,
    displayBudget: buildDisplayBudget(displayBudgetAmountUsd),
    summary: `Client agrees to pay Freelancer ${rawAmountInput} CELO after successful delivery of ${projectDescription}.`,
    milestones: splitIntoMilestones(displayBudgetAmountUsd),
    aiDebug,
  };
}

function buildContractPrompt(input: {
  clientName: string;
  projectDescription: string;
  displayBudgetAmountUsd: number;
}) {
  return `
Return ONLY valid JSON in this exact format:
{
  "clientName": "string",
  "projectDescription": "string",
  "displayBudget": {
    "amount": number,
    "currency": "USD",
    "label": "string"
  },
  "summary": "string",
  "milestones": [
    { "title": "string", "amount": number },
    { "title": "string", "amount": number },
    { "title": "string", "amount": number }
  ]
}

Rules:
- displayBudget.currency must always be "USD"
- displayBudget.label must be a concise USD label for the contract value
- milestone amounts must add up exactly to displayBudget.amount
- keep summary concise and professional
- output raw JSON only
- no markdown
- no backticks

Inputs:
Client name: ${input.clientName}
Project description: ${input.projectDescription}
Contract value: ${input.displayBudgetAmountUsd} USD
`.trim();
}

function resolveAiConfig() {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || null;
  const model = process.env.AI_MODEL?.trim() || null;
  const groqApiKey = process.env.GROQ_API_KEY?.trim() || null;
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || null;

  return {
    provider,
    model,
    groqApiKey,
    openAiApiKey,
  };
}

function getAiProviderError(config: ReturnType<typeof resolveAiConfig>) {
  if (!config.provider || !config.model) {
    return "Missing AI provider configuration";
  }

  if (config.provider === "groq" && !config.groqApiKey) {
    return "Missing AI provider configuration";
  }

  if (config.provider === "openai" && !config.openAiApiKey) {
    return "Missing AI provider configuration";
  }

  if (config.provider !== "groq" && config.provider !== "openai") {
    return `Unsupported AI provider: ${config.provider}`;
  }

  return null;
}

async function requestAiContract(input: {
  provider: "groq" | "openai";
  model: string;
  apiKey: string;
  prompt: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const endpoint =
    input.provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: input.prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let parsedBody: unknown = null;

    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch (error) {
      console.error("Agent Guild AI provider returned malformed JSON", {
        provider: input.provider,
        model: input.model,
        rawAiResponse: rawBody,
        jsonParseError: error instanceof Error ? error.message : error,
        stackTrace: error instanceof Error ? error.stack : null,
      });
      throw new Error("Malformed JSON from AI provider");
    }

    if (!response.ok) {
      console.error("Agent Guild AI provider request failed", {
        provider: input.provider,
        model: input.model,
        rawAiResponse: parsedBody,
        status: response.status,
      });
      const errorMessage =
        typeof parsedBody === "object" &&
        parsedBody !== null &&
        "error" in parsedBody &&
        typeof (parsedBody as { error?: { message?: string } }).error?.message === "string"
          ? (parsedBody as { error: { message: string } }).error.message
          : `Provider unavailable (${response.status})`;
      throw new Error(errorMessage);
    }

    return {
      rawAiResponse: parsedBody,
      content:
        typeof parsedBody === "object" &&
        parsedBody !== null &&
        "choices" in parsedBody
          ? ((parsedBody as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ??
              "")
          : "",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI provider timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiContractResponse(text: string) {
  let normalizedText = text.trim();
  if (normalizedText.startsWith("```")) {
    normalizedText = normalizedText.replace(/```json/g, "").replace(/```/g, "").trim();
  }

  const parsed = JSON.parse(normalizedText) as ContractResponse;
  if (
    !parsed?.displayBudget ||
    typeof parsed.displayBudget.amount !== "number" ||
    parsed.displayBudget.currency !== "USD" ||
    typeof parsed.displayBudget.label !== "string" ||
    !Array.isArray(parsed.milestones)
  ) {
    throw new Error("Invalid AI response shape");
  }

  return parsed;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "generate-contract endpoint is live. Please use POST.",
  });
}

export async function POST(request: Request) {
  let stage = "route_entered";
  console.log("create workflow handler entered");

  try {
    const rawRequestText = await request.text();
    console.log("Agent Guild create workflow handler body", {
      stage,
      typeofBody: typeof rawRequestText,
      rawRequestText,
    });

    const body = (rawRequestText ? JSON.parse(rawRequestText) : {}) as {
      clientName?: string;
      projectDescription?: string;
      displayBudgetAmountUsd?: string | number;
      title?: string;
      description?: string;
      amount?: string;
      wallet?: string;
      chainId?: number | string;
    };
    stage = "payload_validated";

    const clientName = body.clientName;
    const projectDescription = body.projectDescription;
    const displayBudgetAmountInput =
      typeof body.displayBudgetAmountUsd === "string"
        ? body.displayBudgetAmountUsd
        : String(body.displayBudgetAmountUsd ?? "");

    console.log("Agent Guild AI generation request", {
      stage,
      incomingWorkflowPayload: body,
      amountRawValue: displayBudgetAmountInput,
      walletAddress: body.wallet ?? null,
      chainId: body.chainId ?? null,
    });

    if (!clientName || !projectDescription || !displayBudgetAmountInput.trim()) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    let parsedDisplayBudgetAmountUsd;
    try {
      parsedDisplayBudgetAmountUsd = parseUsdAmountInput(displayBudgetAmountInput);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Contract value must be a valid USD amount like 0.01 or 25.",
        },
        { status: 400 }
      );
    }

    const displayBudgetAmountUsd = parsedDisplayBudgetAmountUsd.amount;
    const prompt = buildContractPrompt({
      clientName,
      projectDescription,
      displayBudgetAmountUsd,
    });

    const aiConfig = resolveAiConfig();
    const providerConfigError = getAiProviderError(aiConfig);
    stage = "ai_provider_loaded";

    console.log("Agent Guild AI generation config", {
      stage,
      selectedAiProvider: aiConfig.provider,
      modelName: aiConfig.model,
      hasWorkflowSessionSecret: Boolean(process.env.WORKFLOW_SESSION_SECRET),
      hasGroqKey: Boolean(aiConfig.groqApiKey),
      hasOpenAiKey: Boolean(aiConfig.openAiApiKey),
      prompt,
    });

    if (providerConfigError) {
      const fallbackResponse = createFallbackContract(
        clientName,
        projectDescription,
        displayBudgetAmountUsd,
        displayBudgetAmountInput.trim(),
        {
          provider: aiConfig.provider,
          model: aiConfig.model,
          status: "fallback",
          stage,
          fallbackUsed: true,
          rawError: providerConfigError,
          rawResponse: null,
          reason: providerConfigError,
        }
      );

      console.error("Agent Guild AI generation fallback", {
        incomingWorkflowPayload: body,
        stage,
        selectedAiProvider: aiConfig.provider,
        modelName: aiConfig.model,
        generatedAiPrompt: prompt,
        rawAiResponse: null,
        parsedContractResponse: fallbackResponse,
        serverError: providerConfigError,
      });

      return NextResponse.json(fallbackResponse);
    }

    try {
      const provider = aiConfig.provider as "groq" | "openai";
      const apiKey = provider === "groq" ? aiConfig.groqApiKey! : aiConfig.openAiApiKey!;
      stage = "ai_generation_started";
      const aiResponse = await requestAiContract({
        provider,
        model: aiConfig.model!,
        apiKey,
        prompt,
      });
      stage = "ai_generation_finished";

      console.log("Agent Guild AI generation raw response", {
        stage,
        selectedAiProvider: provider,
        modelName: aiConfig.model,
        rawAiResponse: aiResponse.rawAiResponse,
      });

      if (!aiResponse.content.trim()) {
        throw new Error("Provider returned an empty response");
      }

      try {
        const parsedContract = parseAiContractResponse(aiResponse.content);
        console.log("Agent Guild AI generation parsed response", {
          stage,
          parsedContractResponse: parsedContract,
        });

        stage = "response_sent";
        return NextResponse.json({
          ...parsedContract,
          aiDebug: {
            provider,
            model: aiConfig.model,
            status: "success",
            stage,
            fallbackUsed: false,
            rawError: null,
            rawResponse: JSON.stringify(aiResponse.rawAiResponse),
            reason: null,
          },
        } satisfies GenerateContractResponse);
      } catch (error) {
        console.error("Agent Guild AI response parse failed", {
          stage,
          generatedAiPrompt: prompt,
          rawAiResponse: aiResponse.rawAiResponse,
          jsonParseError: error instanceof Error ? error.message : error,
          stackTrace: error instanceof Error ? error.stack : null,
        });
        throw new Error(
          error instanceof Error && error.message.trim()
            ? `Malformed JSON: ${error.message}`
            : "Malformed JSON"
        );
      }
    } catch (error) {
      const fallbackReason =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Provider unavailable";
      const fallbackResponse = createFallbackContract(
        clientName,
        projectDescription,
        displayBudgetAmountUsd,
        displayBudgetAmountInput.trim(),
        {
          provider: aiConfig.provider,
          model: aiConfig.model,
          status: "fallback",
          stage,
          fallbackUsed: true,
          rawError: fallbackReason,
          rawResponse: null,
          reason: fallbackReason,
        }
      );

      console.error("Agent Guild AI generation fallback", {
        incomingWorkflowPayload: body,
        stage,
        generatedAiPrompt: prompt,
        selectedAiProvider: aiConfig.provider,
        modelName: aiConfig.model,
        rawAiResponse: null,
        parsedContractResponse: fallbackResponse,
        serverError: fallbackReason,
        stackTrace: error instanceof Error ? error.stack : null,
      });

      return NextResponse.json(fallbackResponse);
    }
  } catch (error) {
    console.error("Agent Guild generate-contract route error", {
      stage,
      serverError: error instanceof Error ? error.message : error,
      stackTrace: error instanceof Error ? error.stack : null,
    });
    return NextResponse.json(
      {
        success: false,
        stage,
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unexpected server error.",
        stack: error instanceof Error ? error.stack ?? null : null,
      },
      { status: 500 }
    );
  }
}
