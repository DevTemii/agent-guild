import { network } from "hardhat";

async function main() {
    const { viem } = await network.connect("celoMainnet");

    const [walletClient] = await viem.getWalletClients();
    const deployerAddress = walletClient.account.address;

    console.log("Deploying FreelanceEscrow from:", deployerAddress);

    const escrow = await viem.deployContract("FreelanceEscrow");

    console.log("FreelanceEscrow deployed at:", escrow.address);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
