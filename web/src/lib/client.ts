import { createThirdwebClient } from "thirdweb";
import { agentGuildRuntimeConfig } from "./runtimeConfig";

type ThirdwebClient = ReturnType<typeof createThirdwebClient>;

let cachedClient: ThirdwebClient | null = null;

function createAgentGuildClient() {
  if (!agentGuildRuntimeConfig.thirdwebClientId) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createThirdwebClient({
      clientId: agentGuildRuntimeConfig.thirdwebClientId,
    });
  }

  return cachedClient;
}

export const client = createAgentGuildClient();
