import { defineChain } from "thirdweb";
import {
  AgentGuildNetworkKey,
  agentGuildRuntimeConfig,
} from "./runtimeConfig";

type NetworkDefinition = {
  key: AgentGuildNetworkKey;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBaseUrl: string;
};

const NETWORK_DEFINITIONS: Record<AgentGuildNetworkKey, NetworkDefinition> = {
  "celo-mainnet": {
    key: "celo-mainnet",
    chainId: 42220,
    chainName: "Celo Mainnet",
    rpcUrl: "https://forno.celo.org",
    explorerBaseUrl: "https://celoscan.io",
  },
  "celo-sepolia": {
    key: "celo-sepolia",
    chainId: 11142220,
    chainName: "Celo Sepolia",
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    explorerBaseUrl: "https://sepolia.celoscan.io",
  },
};

const fallbackNetworkKey: AgentGuildNetworkKey = "celo-mainnet";

export const agentGuildNetworkKey = agentGuildRuntimeConfig.networkKey ?? fallbackNetworkKey;
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
  agentRegistryAddress: agentGuildRuntimeConfig.activeDeployment?.agentRegistryAddress ?? "",
  freelanceEscrowAddress: agentGuildRuntimeConfig.activeDeployment?.freelanceEscrowAddress ?? "",
};

export function getExplorerAddressUrl(address: string) {
  return `${agentGuildExplorerBaseUrl}/address/${address}`;
}

export function getExplorerTransactionUrl(txHash: string) {
  return `${agentGuildExplorerBaseUrl}/tx/${txHash}`;
}
