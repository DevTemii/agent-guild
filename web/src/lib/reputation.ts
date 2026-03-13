import { getReputationForWallet } from "./reputationStore";

export function getReputation(walletAddress: string) {
    return getReputationForWallet(walletAddress);
}