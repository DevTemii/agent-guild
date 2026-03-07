export type GeneratedContract = {
  clientName: string;
  projectDescription: string;
  budget: number;
  summary: string;
  milestones: {
    title: string;
    amount: number;
  }[];
};

export function generateMockContract(
  clientName: string,
  projectDescription: string,
  budget: number
): GeneratedContract {
  const milestone1 = Math.floor(budget * 0.3);
  const milestone2 = Math.floor(budget * 0.3);
  const milestone3 = budget - milestone1 - milestone2;

  return {
    clientName,
    projectDescription,
    budget,
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