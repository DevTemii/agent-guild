import { getReputationForProfile } from "./reputationStore";

export function getReputation(profileName: string) {
    return getReputationForProfile(profileName.trim().toLowerCase());
}