export type AgentGuildNetworkKey = "celo-mainnet" | "celo-sepolia";

type DeploymentAddressSet = {
  agentRegistryAddress: string | null;
  freelanceEscrowAddress: string | null;
};

export type AgentGuildRuntimeConfig = {
  valid: boolean;
  errors: string[];
  thirdwebClientId: string | null;
  networkKey: AgentGuildNetworkKey | null;
  deploymentByNetwork: Record<AgentGuildNetworkKey, DeploymentAddressSet>;
  activeDeployment: DeploymentAddressSet | null;
};

type AgentGuildPublicEnv = {
  thirdwebClientId: string | null;
  requestedNetwork: string | null;
  celoMainnetAgentRegistryAddress: string | null;
  celoMainnetFreelanceEscrowAddress: string | null;
};

declare global {
  var __agentGuildRuntimeConfigLogged: boolean | undefined;
}

function readPublicValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidEvmAddress(value: string | null) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validateNetworkKey(value: string | null) {
  if (value === "celo-mainnet") {
    return value satisfies AgentGuildNetworkKey;
  }

  return null;
}

function readAgentGuildPublicEnv(): AgentGuildPublicEnv {
  return {
    thirdwebClientId: readPublicValue(process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID),
    requestedNetwork: readPublicValue(process.env.NEXT_PUBLIC_AGENT_GUILD_NETWORK)?.toLowerCase() ?? null,
    celoMainnetAgentRegistryAddress: readPublicValue(process.env.NEXT_PUBLIC_CELO_MAINNET_AGENT_REGISTRY_ADDRESS),
    celoMainnetFreelanceEscrowAddress: readPublicValue(process.env.NEXT_PUBLIC_CELO_MAINNET_FREELANCE_ESCROW_ADDRESS),
  };
}

function buildRuntimeConfig(): AgentGuildRuntimeConfig {
  const errors: string[] = [];
  const publicEnv = readAgentGuildPublicEnv();
  const thirdwebClientId = publicEnv.thirdwebClientId;
  const requestedNetwork = publicEnv.requestedNetwork;
  const networkKey = validateNetworkKey(requestedNetwork);

  const deploymentByNetwork: Record<AgentGuildNetworkKey, DeploymentAddressSet> = {
    "celo-mainnet": {
      agentRegistryAddress: publicEnv.celoMainnetAgentRegistryAddress,
      freelanceEscrowAddress: publicEnv.celoMainnetFreelanceEscrowAddress,
    },
    "celo-sepolia": {
      agentRegistryAddress: null,
      freelanceEscrowAddress: null,
    },
  };

  if (!thirdwebClientId) {
    errors.push("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required for Agent Guild runtime configuration.");
  }

  if (!requestedNetwork) {
    errors.push("NEXT_PUBLIC_AGENT_GUILD_NETWORK is required for Agent Guild runtime configuration.");
  } else if (!networkKey) {
    errors.push("NEXT_PUBLIC_AGENT_GUILD_NETWORK must be 'celo-mainnet'.");
  }

  const activeDeployment = networkKey ? deploymentByNetwork[networkKey] : null;

  if (networkKey && activeDeployment) {
    const addressPrefix = networkKey === "celo-mainnet" ? "NEXT_PUBLIC_CELO_MAINNET" : "NEXT_PUBLIC_CELO_SEPOLIA";

    if (!isValidEvmAddress(activeDeployment.agentRegistryAddress)) {
      errors.push(`${addressPrefix}_AGENT_REGISTRY_ADDRESS must be a valid EVM address.`);
    }

    if (!isValidEvmAddress(activeDeployment.freelanceEscrowAddress)) {
      errors.push(`${addressPrefix}_FREELANCE_ESCROW_ADDRESS must be a valid EVM address.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    thirdwebClientId,
    networkKey,
    deploymentByNetwork,
    activeDeployment,
  };
}

const resolvedConfig = buildRuntimeConfig();

if (!globalThis.__agentGuildRuntimeConfigLogged) {
  console.log("Agent Guild runtime config", resolvedConfig);
  globalThis.__agentGuildRuntimeConfigLogged = true;
}

export const agentGuildRuntimeConfig = resolvedConfig;
