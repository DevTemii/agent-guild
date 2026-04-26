import "@nomicfoundation/hardhat-viem";
import { network } from "hardhat";

const REGISTRY_ADDRESS = "0xbd1a9e035d61b27a9c4cf18b5f7728de35d9d18b" as const;
const FREELANCER_WALLET = "0xEf3dC4784F591B8609C1A62b3BaE855fD716Ca82" as const;

async function main() {
    const { viem } = await network.connect("celoMainnet");

    const [walletClient] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const adminAddress = walletClient.account.address;

    console.log("Allowlisting from admin wallet:", adminAddress);
    console.log("AgentRegistry:", REGISTRY_ADDRESS);
    console.log("Freelancer wallet:", FREELANCER_WALLET);

    const registry = await viem.getContractAt("AgentRegistry", REGISTRY_ADDRESS, {
        client: {
            wallet: walletClient,
            public: publicClient,
        },
    });

    const txHash = await registry.write.setBetaAccess([FREELANCER_WALLET, true]);

    console.log("Submitted transaction:", txHash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log("Allowlist confirmed in block:", receipt.blockNumber.toString());
    console.log(
        `Success: ${FREELANCER_WALLET} is allowlisted on AgentRegistry ${REGISTRY_ADDRESS}.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
