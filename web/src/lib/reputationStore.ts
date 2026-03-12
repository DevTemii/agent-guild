export type ReputationData = {
    completedContracts: number;
    guildScore: number;
    totalEarned: number;
    creditUnlocked: boolean;
    creditAmount: number;
};

const STORAGE_KEY = "agent-guild-reputation";

function normalizeKey(profileKey: string) {
    return profileKey.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getAllReputation(): Record<string, ReputationData> {
    if (typeof window === "undefined") return {};

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

export function getReputationForProfile(profileKey: string): ReputationData {
    const all = getAllReputation();
    const key = normalizeKey(profileKey);

    return (
        all[key] || {
            completedContracts: 2,
            guildScore: 20,
            totalEarned: 400,
            creditUnlocked: false,
            creditAmount: 0,
        }
    );
}

export function setReputationForProfile(
    profileKey: string,
    data: ReputationData
) {
    if (typeof window === "undefined") return;

    const all = getAllReputation();
    const key = normalizeKey(profileKey);

    all[key] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearAllReputation() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
}