import { defineConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import dotenv from "dotenv";

dotenv.config();

function readOptionalEnv(name) {
  return process.env[name]?.trim();
}

function resolveDeployAccounts() {
  const privateKey = readOptionalEnv("PRIVATE_KEY");
  return privateKey ? [privateKey] : [];
}

function ensureDeployEnv(networkName) {
  const selectedNetwork = readOptionalEnv("HARDHAT_NETWORK");

  if (selectedNetwork !== networkName) {
    return;
  }

  if (!readOptionalEnv("PRIVATE_KEY")) {
    throw new Error(`PRIVATE_KEY is required when deploying to ${networkName}.`);
  }

  if (networkName === "celoMainnet" && !readOptionalEnv("CELO_MAINNET_RPC_URL")) {
    throw new Error("CELO_MAINNET_RPC_URL is required when deploying to celoMainnet.");
  }
}

ensureDeployEnv("celoMainnet");
ensureDeployEnv("celoSepolia");

export default defineConfig({
  plugins: [hardhatViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    celoMainnet: {
      type: "http",
      chainType: "l1",
      url: readOptionalEnv("CELO_MAINNET_RPC_URL") || "https://forno.celo.org",
      chainId: 42220,
      accounts: resolveDeployAccounts(),
    },
    celoSepolia: {
      type: "http",
      chainType: "l1",
      url:
        readOptionalEnv("CELO_SEPOLIA_RPC_URL") ||
        "https://forno.celo-sepolia.celo-testnet.org",
      chainId: 11142220,
      accounts: resolveDeployAccounts(),
    },
  },
});
