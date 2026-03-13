import { network } from "hardhat";

async function main() {
    const { viem } = await network.connect("sepolia");

    const escrow = await viem.deployContract("FreelanceEscrow");

    console.log("FreelanceEscrow deployed at:", escrow.address);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});