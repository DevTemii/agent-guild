import { network } from "hardhat";

async function main() {
    const { viem } = await network.connect("celoMainnet");

    //  get deployer wallet
    const [walletClient] = await viem.getWalletClients();
    const deployer = walletClient.account.address;

    console.log("Deploying from:", deployer);

    // deploy contract (no constructor args needed)
    const escrow = await viem.deployContract("FreelanceEscrow");

    console.log("FreelanceEscrow deployed at:", escrow.address);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});