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

function readPublicEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isValidEvmAddress(value: string | null) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validateNetworkKey(value: string | null) {
  if (value === "celo-mainnet" || value === "celo-sepolia") {
    return value satisfies AgentGuildNetworkKey;
  }

  return null;
}

function buildRuntimeConfig(): AgentGuildRuntimeConfig {
  const errors: string[] = [];
  const thirdwebClientId = readPublicEnv("NEXT_PUBLIC_THIRDWEB_CLIENT_ID");
  const requestedNetwork = readPublicEnv("NEXT_PUBLIC_AGENT_GUILD_NETWORK")?.toLowerCase() ?? null;
  const networkKey = validateNetworkKey(requestedNetwork);

  const deploymentByNetwork: Record<AgentGuildNetworkKey, DeploymentAddressSet> = {
    "celo-mainnet": {
      agentRegistryAddress: readPublicEnv("NEXT_PUBLIC_CELO_MAINNET_AGENT_REGISTRY_ADDRESS"),
      freelanceEscrowAddress: readPublicEnv("NEXT_PUBLIC_CELO_MAINNET_FREELANCE_ESCROW_ADDRESS"),
    },
    "celo-sepolia": {
      agentRegistryAddress: readPublicEnv("NEXT_PUBLIC_CELO_SEPOLIA_AGENT_REGISTRY_ADDRESS"),
      freelanceEscrowAddress: readPublicEnv("NEXT_PUBLIC_CELO_SEPOLIA_FREELANCE_ESCROW_ADDRESS"),
    },
  };

  if (!thirdwebClientId) {
    errors.push("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required for Agent Guild runtime configuration.");
  }

  if (!requestedNetwork) {
    errors.push("NEXT_PUBLIC_AGENT_GUILD_NETWORK is required for Agent Guild runtime configuration.");
  } else if (!networkKey) {
    errors.push("NEXT_PUBLIC_AGENT_GUILD_NETWORK must be either 'celo-mainnet' or 'celo-sepolia'.");
  } else if (process.env.NODE_ENV === "production" && networkKey !== "celo-mainnet") {
    errors.push(
      "Production Agent Guild builds must target Celo Mainnet with NEXT_PUBLIC_AGENT_GUILD_NETWORK=celo-mainnet."
    );
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

export const agentGuildRuntimeConfig = buildRuntimeConfig();
