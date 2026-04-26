const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";
const REQUEST_TIMEOUT_MS = 10_000;

export type GroqContractGeneratorInput = {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
  clientWallet: string;
  freelancerWallet?: string;
  chainId: number;
};

export type GroqGeneratedContract = {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
  currency: "CELO";
  deliverable: string;
  payoutTerms: string;
  deliveryWindow: string;
  milestones: string[];
};

export class GroqContractGeneratorError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GroqContractGeneratorError";
    this.code = code;
  }
}

function createPrompt(input: GroqContractGeneratorInput) {
  return [
    "Return ONLY valid JSON.",
    "No markdown.",
    "No explanation.",
    "No code fences.",
    "",
    "Use exactly this shape:",
    "{",
    '  "title": "string",',
    '  "description": "string",',
    '  "amount": "string",',
    '  "amountWei": "string",',
    '  "currency": "CELO",',
    '  "deliverable": "string",',
    '  "payoutTerms": "string",',
    '  "deliveryWindow": "string",',
    '  "milestones": ["string", "string", "string", "string"]',
    "}",
    "",
    "Rules:",
    `- title must stay close to "${input.title}"`,
    `- description must stay close to "${input.description}"`,
    `- amount must exactly equal "${input.amount}"`,
    `- amountWei must exactly equal "${input.amountWei}"`,
    '- currency must always equal "CELO"',
    "- payoutTerms must be concise and payment-focused",
    "- deliveryWindow must be a short human-readable string",
    "- milestones must have exactly 4 short strings",
    "",
    "Deal context:",
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Amount: ${input.amount} CELO`,
    `Amount Wei: ${input.amountWei}`,
    `Client Wallet: ${input.clientWallet}`,
    `Freelancer Wallet: ${input.freelancerWallet ?? "not provided"}`,
    `Chain ID: ${input.chainId}`,
  ].join("\n");
}

function parseJsonResponse(rawResponse: string) {
  try {
    return JSON.parse(rawResponse) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      error?: {
        message?: string;
      };
    };
  } catch (error) {
    console.error("Agent Guild Groq top-level JSON parse failed", {
      rawAiResponse: rawResponse,
      jsonParseError: error instanceof Error ? error.message : String(error),
      stackTrace: error instanceof Error ? error.stack : null,
    });
    throw new GroqContractGeneratorError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "Groq returned an invalid HTTP payload."
    );
  }
}

function parseContractJson(rawContent: string, input: GroqContractGeneratorInput) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    console.error("Agent Guild Groq contract JSON parse failed", {
      rawAiResponse: rawContent,
      jsonParseError: error instanceof Error ? error.message : String(error),
      stackTrace: error instanceof Error ? error.stack : null,
    });
    throw new GroqContractGeneratorError(
      "AI_RESPONSE_PARSE_FAILED",
      "Groq returned JSON that could not be parsed."
    );
  }

  const candidate = parsed as Partial<GroqGeneratedContract>;

  const isValidMilestones =
    Array.isArray(candidate.milestones) &&
    candidate.milestones.length === 4 &&
    candidate.milestones.every((item) => typeof item === "string" && item.trim().length > 0);

  if (
    typeof candidate.title !== "string" ||
    typeof candidate.description !== "string" ||
    typeof candidate.amount !== "string" ||
    typeof candidate.amountWei !== "string" ||
    candidate.currency !== "CELO" ||
    typeof candidate.deliverable !== "string" ||
    typeof candidate.payoutTerms !== "string" ||
    typeof candidate.deliveryWindow !== "string" ||
    !isValidMilestones
  ) {
    throw new GroqContractGeneratorError(
      "AI_RESPONSE_PARSE_FAILED",
      "Groq returned JSON with an invalid contract shape."
    );
  }

  if (candidate.amount.trim() !== input.amount || candidate.amountWei.trim() !== input.amountWei) {
    throw new GroqContractGeneratorError(
      "AI_RESPONSE_PARSE_FAILED",
      "Groq returned amount values that did not match the request."
    );
  }

  const milestones = candidate.milestones as string[];

  return {
    title: candidate.title.trim(),
    description: candidate.description.trim(),
    amount: candidate.amount.trim(),
    amountWei: candidate.amountWei.trim(),
    currency: "CELO",
    deliverable: candidate.deliverable.trim(),
    payoutTerms: candidate.payoutTerms.trim(),
    deliveryWindow: candidate.deliveryWindow.trim(),
    milestones: milestones.map((item) => item.trim()),
  } satisfies GroqGeneratedContract;
}

export async function generateContractWithGroq(
  input: GroqContractGeneratorInput
): Promise<GroqGeneratedContract> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  const prompt = createPrompt(input);

  console.log("Agent Guild Groq contract generation request", {
    incomingWorkflowPayload: input,
    generatedAiPrompt: prompt,
    selectedAiProvider: "groq",
    modelName: model,
  });

  if (!apiKey) {
    throw new GroqContractGeneratorError(
      "MISSING_GROQ_API_KEY",
      "Missing AI provider configuration"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write concise freelance contract data and must return only strict JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    const rawResponse = await response.text();
    const parsedResponse = parseJsonResponse(rawResponse);

    console.log("Agent Guild Groq raw response", {
      selectedAiProvider: "groq",
      modelName: model,
      rawAiResponse: parsedResponse,
    });

    if (!response.ok) {
      const providerError =
        typeof parsedResponse.error?.message === "string" && parsedResponse.error.message.trim()
          ? parsedResponse.error.message
          : `Groq request failed with status ${response.status}.`;
      throw new GroqContractGeneratorError("AI_PROVIDER_REQUEST_FAILED", providerError);
    }

    const content = parsedResponse.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      throw new GroqContractGeneratorError(
        "AI_PROVIDER_EMPTY_RESPONSE",
        "Groq returned an empty contract response."
      );
    }

    const parsedContract = parseContractJson(content, input);

    console.log("Agent Guild Groq parsed contract", {
      parsedContractResponse: parsedContract,
    });

    return parsedContract;
  } catch (error) {
    if (error instanceof GroqContractGeneratorError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new GroqContractGeneratorError(
        "AI_REQUEST_TIMEOUT",
        "Groq contract generation timed out after 10 seconds."
      );
    }

    console.error("Agent Guild Groq contract generation failed", {
      serverError: error instanceof Error ? error.message : String(error),
      stackTrace: error instanceof Error ? error.stack : null,
    });
    throw new GroqContractGeneratorError(
      "AI_PROVIDER_REQUEST_FAILED",
      error instanceof Error && error.message.trim()
        ? error.message
        : "Groq contract generation failed."
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function getGroqModel() {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}
