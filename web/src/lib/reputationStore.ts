
type ReputationData = {
    completedContracts: number;
    guildScore: number;
    totalEarned: number;
    creditUnlocked: boolean;
    creditAmount: number;
};

const defaultReputation: ReputationData = {
    completedContracts: 0,
    guildScore: 0,
    totalEarned: 0,
    creditUnlocked: false,
    creditAmount: 0,
};

const reputationStore = new Map<string, ReputationData>();

export function getReputationForProfile(profileId: string): ReputationData {
    if (!reputationStore.has(profileId)) {
        return { ...defaultReputation };
    }
    return { ...reputationStore.get(profileId)! };
}

export function setReputationForProfile(
    profileId: string,
    reputation: ReputationData
): void {
    reputationStore.set(profileId, { ...reputation });
}