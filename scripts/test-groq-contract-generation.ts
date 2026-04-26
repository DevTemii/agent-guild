import { config as loadEnv } from "dotenv";
import {
  generateContractWithGroq,
  getGroqModel,
} from "../web/src/lib/server/groqContractGenerator.ts";

loadEnv({ path: ".env.local" });
if (!process.env.GROQ_API_KEY) {
  loadEnv({ path: "web/.env.local" });
}

async function main() {
  const input = {
    title: "Logo Design",
    description: "Design a clean logo for a small business",
    amount: "0.1",
    amountWei: "100000000000000000",
    clientWallet: "0x1111111111111111111111111111111111111111",
    chainId: 42220,
  } as const;

  console.log("Testing Groq contract generation", {
    model: getGroqModel(),
    title: input.title,
    amount: input.amount,
  });

  const contract = await generateContractWithGroq(input);
  console.log("Groq contract generation succeeded");
  console.log(JSON.stringify(contract, null, 2));
}

main().catch((error) => {
  console.error("Groq contract generation test failed");
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        code:
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : null,
        stack: error instanceof Error ? error.stack : null,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
