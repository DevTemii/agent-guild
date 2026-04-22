import { buildDisplayBudget } from "./budget";

export type GeneratedContract = {
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

export function generateMockContract(
  clientName: string,
  projectDescription: string,
  displayBudgetAmountUsd: number
): GeneratedContract {
  const milestone1 = Math.floor(displayBudgetAmountUsd * 0.3);
  const milestone2 = Math.floor(displayBudgetAmountUsd * 0.3);
  const milestone3 = displayBudgetAmountUsd - milestone1 - milestone2;

  return {
    clientName,
    projectDescription,
    displayBudget: buildDisplayBudget(displayBudgetAmountUsd),
    summary: `Freelancer will complete the project for ${clientName}. The work includes: ${projectDescription}. Payment will be split across 3 milestones based on delivery progress.`,
    milestones: [
      {
        title: "Project kickoff and research",
        amount: milestone1,
      },
      {
        title: "Core execution and draft delivery",
        amount: milestone2,
      },
      {
        title: "Final delivery and revisions",
        amount: milestone3,
      },
    ],
  };
}
