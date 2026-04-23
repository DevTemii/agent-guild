import { defineChain } from "thirdweb";
import { requirePublicEnv } from "./runtimeConfig";

export type AgentGuildNetworkKey = "celo-mainnet" | "celo-sepolia";

type NetworkDefinition = {
  key: AgentGuildNetworkKey;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  envPrefix: "CELO_MAINNET" | "CELO_SEPOLIA";
};

const NETWORK_DEFINITIONS: Record<AgentGuildNetworkKey, NetworkDefinition> = {
  "celo-mainnet": {
    key: "celo-mainnet",
    chainId: 42220,
    chainName: "Celo Mainnet",
    rpcUrl: "https://forno.celo.org",
    explorerBaseUrl: "https://celoscan.io",
    envPrefix: "CELO_MAINNET",
  },
  "celo-sepolia": {
    key: "celo-sepolia",
    chainId: 11142220,
    chainName: "Celo Sepolia",
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    explorerBaseUrl: "https://sepolia.celoscan.io",
    envPrefix: "CELO_SEPOLIA",
  },
};

function resolveAgentGuildNetworkKey() {
  const value = requirePublicEnv("NEXT_PUBLIC_AGENT_GUILD_NETWORK").toLowerCase();

  if (value !== "celo-mainnet" && value !== "celo-sepolia") {
    throw new Error(
      "NEXT_PUBLIC_AGENT_GUILD_NETWORK must be either 'celo-mainnet' or 'celo-sepolia'."
    );
  }

  if (process.env.NODE_ENV === "production" && value !== "celo-mainnet") {
    throw new Error(
      "Production Agent Guild builds must target Celo Mainnet with NEXT_PUBLIC_AGENT_GUILD_NETWORK=celo-mainnet."
    );
  }

  return value as AgentGuildNetworkKey;
}

function requireDeploymentAddress(envName: string) {
  const value = requirePublicEnv(envName);

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${envName} must be a valid EVM address.`);
  }

  return value;
}

export const agentGuildNetworkKey = resolveAgentGuildNetworkKey();
export const agentGuildNetwork = NETWORK_DEFINITIONS[agentGuildNetworkKey];
export const agentGuildChain = defineChain({
  id: agentGuildNetwork.chainId,
  name: agentGuildNetwork.chainName,
  rpc: agentGuildNetwork.rpcUrl,
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
});
export const agentGuildChainId = agentGuildNetwork.chainId;
export const agentGuildChainLabel = agentGuildNetwork.chainName;
export const agentGuildExplorerBaseUrl = agentGuildNetwork.explorerBaseUrl;
export const agentGuildIsMainnet = agentGuildNetworkKey === "celo-mainnet";
export const activeAgentGuildDeployment = {
  agentRegistryAddress: requireDeploymentAddress(
    `NEXT_PUBLIC_${agentGuildNetwork.envPrefix}_AGENT_REGISTRY_ADDRESS`
  ),
  freelanceEscrowAddress: requireDeploymentAddress(
    `NEXT_PUBLIC_${agentGuildNetwork.envPrefix}_FREELANCE_ESCROW_ADDRESS`
  ),
};

export function getExplorerAddressUrl(address: string) {
  return `${agentGuildExplorerBaseUrl}/address/${address}`;
}
