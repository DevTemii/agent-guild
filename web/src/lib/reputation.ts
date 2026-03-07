export function getReputation(index: number, hourlyRate: bigint) {
    const completedContracts = Math.min(index + 1, 5);
    const guildScore = Math.min(completedContracts * 10, 100);
    const totalEarned = Number(hourlyRate) * completedContracts * 8;
    const creditUnlocked = completedContracts >= 3;
    const creditAmount = creditUnlocked ? 200 : 0;

    return {
        completedContracts,
        guildScore,
        totalEarned,
        creditUnlocked,
        creditAmount,
    };
}