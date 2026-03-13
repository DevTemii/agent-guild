export type ReputationData = {
    completedContracts: number;
    guildScore: number;
    totalEarned: number;
    creditUnlocked: boolean;
    creditAmount: number;
};

const STORAGE_KEY = "agent-guild-reputation";

function normalizeKey(key: string) {
    return key.trim().toLowerCase();
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

export function getReputationForWallet(walletAddress: string): ReputationData {
    const all = getAllReputation();
    const key = normalizeKey(walletAddress);

    return (
        all[key] || {
            completedContracts: 0,
            guildScore: 0,
            totalEarned: 0,
            creditUnlocked: false,
            creditAmount: 0,
        }
    );
}

export function setReputationForWallet(
    walletAddress: string,
    data: ReputationData
) {
    if (typeof window === "undefined") return;

    const all = getAllReputation();
    const key = normalizeKey(walletAddress);

    all[key] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearAllReputation() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
}