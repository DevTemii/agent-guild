import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import { normalizeChainId } from "@/lib/chainId";

export const runtime = "nodejs";

const AI_TIMEOUT_MS = 10_000;

type ContractTemplate = {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
  currency: "CELO";
  deliverable: string;
  payoutTerms: string;
  deliveryWindow: string;
  milestones: string[];
  generatedBy: "ai" | "local-fallback";
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

type GenerateContractResponse = {
  success: boolean;
  stage: string;
  error: string | null;
  fallback: ContractTemplate | null;
  contract: ContractTemplate;
  summary: string;
  milestones: {
    title: string;
    amount: number;
  }[];
  aiDebug: AiDebugPayload;
  debug: {
    provider: string | null;
    model: string | null;
    stage: string;
    wallet: string | null;
    chainId: number | null;
    amount: string;
    amountWei: string;
  };
};

function normalizeAmountInput(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Amount is required.");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must use plain decimal format.");
  }

  const fraction = normalized.split(".")[1];
  if (fraction && fraction.length > 18) {
    throw new Error("Amount supports up to 18 decimal places.");
  }

  const amountWei = parseUnits(normalized, 18);
  if (amountWei <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return {
    amount: normalized,
    amountWei: amountWei.toString(),
  };
}

function createMilestoneBreakdown(amountWei: bigint) {
  const part1 = (amountWei * 30n) / 100n;
  const part2 = (amountWei * 40n) / 100n;
  const part3 = amountWei - part1 - part2;

  return [
    { title: "Freelancer accepts the deal", amount: Number(formatUnits(part1, 18)) },
    { title: "Client secures payment", amount: Number(formatUnits(part2, 18)) },
    { title: "Freelancer submits work", amount: Number(formatUnits(part3, 18)) },
  ];
}

function buildPrompt(input: {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
}) {
  return `
Return ONLY valid JSON in this exact format:
{
  "title": "string",
  "description": "string",
  "amount": "string",
  "amountWei": "string",
  "currency": "CELO",
  "deliverable": "string",
  "payoutTerms": "string",
  "deliveryWindow": "string",
  "milestones": ["string", "string", "string", "string"]
}

Rules:
- amount must exactly match the provided CELO decimal string
- amountWei must exactly match the provided wei string
- currency must always be "CELO"
- output raw JSON only
- no markdown
- no backticks

Inputs:
Title: ${input.title}
Description: ${input.description}
Amount: ${input.amount} CELO
Amount Wei: ${input.amountWei}
`.trim();
}

function resolveAiConfig() {
  return {
    provider: process.env.AI_PROVIDER?.trim().toLowerCase() || null,
    model: process.env.AI_MODEL?.trim() || null,
    groqApiKey: process.env.GROQ_API_KEY?.trim() || null,
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
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

function createFallbackContract(input: {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
}): ContractTemplate {
  return {
    title: input.title,
    description: input.description,
    amount: input.amount,
    amountWei: input.amountWei,
    currency: "CELO",
    deliverable: input.description,
    payoutTerms: "Client releases funds after submitted work is reviewed.",
    deliveryWindow: "1 day",
    milestones: [
      "Freelancer accepts the deal",
      "Client secures payment",
      "Freelancer submits work",
      "Client confirms payout",
    ],
    generatedBy: "local-fallback",
  };
}

function buildSummary(contract: ContractTemplate) {
  return `Client agrees to pay Freelancer ${contract.amount} CELO after successful delivery of ${contract.deliverable}.`;
}

function toLegacyMilestones(contract: ContractTemplate) {
  return createMilestoneBreakdown(BigInt(contract.amountWei));
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
        messages: [{ role: "user", content: input.prompt }],
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
      const providerError =
        typeof parsedBody === "object" &&
        parsedBody !== null &&
        "error" in parsedBody &&
        typeof (parsedBody as { error?: { message?: string } }).error?.message === "string"
          ? (parsedBody as { error: { message: string } }).error.message
          : `Provider unavailable (${response.status})`;
      throw new Error(providerError);
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
      throw new Error("AI timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiContractResponse(
  text: string,
  expected: {
    title: string;
    description: string;
    amount: string;
    amountWei: string;
  }
) {
  let normalizedText = text.trim();
  if (normalizedText.startsWith("```")) {
    normalizedText = normalizedText.replace(/```json/g, "").replace(/```/g, "").trim();
  }

  const parsed = JSON.parse(normalizedText) as Partial<ContractTemplate>;

  if (
    !parsed ||
    typeof parsed.title !== "string" ||
    typeof parsed.description !== "string" ||
    typeof parsed.amount !== "string" ||
    typeof parsed.amountWei !== "string" ||
    parsed.currency !== "CELO" ||
    typeof parsed.deliverable !== "string" ||
    typeof parsed.payoutTerms !== "string" ||
    typeof parsed.deliveryWindow !== "string" ||
    !Array.isArray(parsed.milestones)
  ) {
    throw new Error("Invalid AI response shape");
  }

  if (parsed.amount.trim() !== expected.amount || parsed.amountWei.trim() !== expected.amountWei) {
    throw new Error("AI response amount mismatch");
  }

  return {
    title: parsed.title.trim(),
    description: parsed.description.trim(),
    amount: parsed.amount.trim(),
    amountWei: parsed.amountWei.trim(),
    currency: "CELO",
    deliverable: parsed.deliverable.trim(),
    payoutTerms: parsed.payoutTerms.trim(),
    deliveryWindow: parsed.deliveryWindow.trim(),
    milestones: parsed.milestones.map((item) => String(item).trim()).filter(Boolean),
    generatedBy: "ai",
  } satisfies ContractTemplate;
}

function createSuccessResponse(input: {
  success: boolean;
  stage: string;
  error: string | null;
  fallback: ContractTemplate | null;
  contract: ContractTemplate;
  aiDebug: AiDebugPayload;
  wallet: string | null;
  chainId: number | null;
}) {
  return {
    success: input.success,
    stage: input.stage,
    error: input.error,
    fallback: input.fallback,
    contract: input.contract,
    summary: buildSummary(input.contract),
    milestones: toLegacyMilestones(input.contract),
    aiDebug: input.aiDebug,
    debug: {
      provider: input.aiDebug.provider,
      model: input.aiDebug.model,
      stage: input.stage,
      wallet: input.wallet,
      chainId: input.chainId,
      amount: input.contract.amount,
      amountWei: input.contract.amountWei,
    },
  } satisfies GenerateContractResponse;
}

function createFailureResponse(input: {
  stage: string;
  error: string;
  fallback?: ContractTemplate | null;
  provider?: string | null;
  model?: string | null;
  wallet?: string | null;
  chainId?: number | null;
  amount?: string;
  amountWei?: string;
}) {
  return {
    success: false,
    stage: input.stage,
    error: input.error,
    fallback: input.fallback ?? null,
    debug: {
      provider: input.provider ?? null,
      model: input.model ?? null,
      stage: input.stage,
      wallet: input.wallet ?? null,
      chainId: input.chainId ?? null,
      amount: input.amount ?? "",
      amountWei: input.amountWei ?? "",
    },
  };
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
  let rawRequestText = "";

  try {
    rawRequestText = await request.text();
    console.log("Agent Guild create workflow handler body", {
      stage,
      typeofBody: typeof rawRequestText,
      rawRequestText,
    });

    let body: {
      title?: string;
      description?: string;
      amount?: string;
      amountWei?: string;
      wallet?: string;
      chainId?: number | string;
      role?: string;
      timestamp?: string;
    } = {};

    try {
      body = (rawRequestText ? JSON.parse(rawRequestText) : {}) as typeof body;
    } catch (error) {
      return NextResponse.json(
        createFailureResponse({
          stage: "body_parse_failed",
          error: error instanceof Error ? error.message : "Failed to parse JSON body.",
        }),
        { status: 400 }
      );
    }

    stage = "payload_validated";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const wallet = typeof body.wallet === "string" ? body.wallet.trim().toLowerCase() : null;
    const chainId = normalizeChainId(body.chainId);
    const missingFields = [
      !title ? "title" : null,
      !description ? "description" : null,
      !body.amount ? "amount" : null,
      !body.amountWei ? "amountWei" : null,
      !wallet ? "wallet" : null,
      chainId === null ? "chainId" : null,
    ].filter((value): value is string => Boolean(value));

    console.log("Agent Guild AI generation request", {
      stage,
      incomingWorkflowPayload: body,
      walletAddress: wallet,
      chainId,
      missingFields,
    });

    if (missingFields.length > 0) {
      return NextResponse.json(
        createFailureResponse({
          stage,
          error: `Invalid payload. Missing: ${missingFields.join(", ")}`,
          wallet,
          chainId,
        }),
        { status: 400 }
      );
    }

    if (chainId !== 42220) {
      return NextResponse.json(
        createFailureResponse({
          stage,
          error: "MiniPay must be connected to Celo Mainnet (42220).",
          wallet,
          chainId,
        }),
        { status: 400 }
      );
    }

    const parsedAmount = normalizeAmountInput(body.amount!);
    if (parsedAmount.amountWei !== body.amountWei!.trim()) {
      return NextResponse.json(
        createFailureResponse({
          stage,
          error: "Amount and amountWei do not match.",
          wallet,
          chainId,
          amount: parsedAmount.amount,
          amountWei: parsedAmount.amountWei,
        }),
        { status: 400 }
      );
    }

    const prompt = buildPrompt({
      title,
      description,
      amount: parsedAmount.amount,
      amountWei: parsedAmount.amountWei,
    });

    const aiConfig = resolveAiConfig();
    stage = "ai_provider_checked";
    const providerConfigError = getAiProviderError(aiConfig);

    console.log("Agent Guild AI generation config", {
      stage,
      incomingWorkflowPayload: body,
      generatedAiPrompt: prompt,
      selectedAiProvider: aiConfig.provider,
      modelName: aiConfig.model,
      hasWorkflowSessionSecret: Boolean(process.env.WORKFLOW_SESSION_SECRET),
      hasGroqKey: Boolean(aiConfig.groqApiKey),
      hasOpenAiKey: Boolean(aiConfig.openAiApiKey),
    });

    if (providerConfigError) {
      stage = "fallback_generated";
      const fallback = createFallbackContract({
        title,
        description,
        amount: parsedAmount.amount,
        amountWei: parsedAmount.amountWei,
      });

      return NextResponse.json(
        createSuccessResponse({
          success: false,
          stage,
          error: providerConfigError,
          fallback,
          contract: fallback,
          aiDebug: {
            provider: aiConfig.provider,
            model: aiConfig.model,
            status: "fallback",
            stage,
            fallbackUsed: true,
            rawError: providerConfigError,
            rawResponse: null,
            reason: providerConfigError,
          },
          wallet,
          chainId,
        })
      );
    }

    const provider = aiConfig.provider as "groq" | "openai";
    const apiKey = provider === "groq" ? aiConfig.groqApiKey! : aiConfig.openAiApiKey!;

    try {
      stage = "ai_generation_attempted";
      const aiResponse = await requestAiContract({
        provider,
        model: aiConfig.model!,
        apiKey,
        prompt,
      });

      console.log("Agent Guild AI generation raw response", {
        stage,
        selectedAiProvider: provider,
        modelName: aiConfig.model,
        rawAiResponse: aiResponse.rawAiResponse,
      });

      if (!aiResponse.content.trim()) {
        throw new Error("Provider returned an empty response");
      }

      const parsedContract = parseAiContractResponse(aiResponse.content, {
        title,
        description,
        amount: parsedAmount.amount,
        amountWei: parsedAmount.amountWei,
      });
      stage = "response_sent";

      console.log("Agent Guild AI generation parsed response", {
        stage,
        parsedContractResponse: parsedContract,
      });

      return NextResponse.json(
        createSuccessResponse({
          success: true,
          stage,
          error: null,
          fallback: null,
          contract: parsedContract,
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
          wallet,
          chainId,
        })
      );
    } catch (error) {
      stage = "fallback_generated";
      const fallbackReason =
        error instanceof Error && error.message.trim() ? error.message : "Provider unavailable";
      const fallback = createFallbackContract({
        title,
        description,
        amount: parsedAmount.amount,
        amountWei: parsedAmount.amountWei,
      });

      console.error("Agent Guild AI generation fallback", {
        incomingWorkflowPayload: body,
        stage,
        generatedAiPrompt: prompt,
        selectedAiProvider: aiConfig.provider,
        modelName: aiConfig.model,
        rawAiResponse: null,
        parsedContractResponse: fallback,
        serverError: fallbackReason,
        stackTrace: error instanceof Error ? error.stack : null,
      });

      return NextResponse.json(
        createSuccessResponse({
          success: false,
          stage,
          error: fallbackReason,
          fallback,
          contract: fallback,
          aiDebug: {
            provider: aiConfig.provider,
            model: aiConfig.model,
            status: "fallback",
            stage,
            fallbackUsed: true,
            rawError: fallbackReason,
            rawResponse: null,
            reason: fallbackReason,
          },
          wallet,
          chainId,
        })
      );
    }
  } catch (error) {
    console.error("Agent Guild generate-contract route error", {
      stage,
      serverError: error instanceof Error ? error.message : error,
      stackTrace: error instanceof Error ? error.stack : null,
    });
    return NextResponse.json(
      createFailureResponse({
        stage,
        error: error instanceof Error && error.message.trim() ? error.message : "Unexpected server error.",
      }),
      { status: 500 }
    );
  }
}
