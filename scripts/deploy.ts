import { network } from "hardhat";

async function main() {
    const { viem } = await network.connect();

    // Deploy by contract name (must match contracts/AgentRegistry.sol contract name)
    const contract = await viem.deployContract("AgentRegistry");

    console.log("AgentRegistry deployed to:", contract.address);
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});