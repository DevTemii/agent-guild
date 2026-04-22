import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("FreelanceEscrow", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [clientWallet, freelancerWallet, otherFreelancerWallet] =
    await viem.getWalletClients();

  it("emits ProjectCreated with the exact created project id", async function () {
    const escrow = await viem.deployContract("FreelanceEscrow", [], {
      client: { wallet: clientWallet },
    });
    const fromBlock = await publicClient.getBlockNumber();

    await escrow.write.createProject([freelancerWallet.account.address]);

    const events = await publicClient.getContractEvents({
      address: escrow.address,
      abi: escrow.abi,
      eventName: "ProjectCreated",
      fromBlock,
      strict: true,
    });

    const [client, freelancer, amount, status] = await escrow.read.getProject([1n]);

    assert.equal(events.length, 1);
    assert.equal(events[0].args.projectId, 1n);
    assert.equal(
      events[0].args.client.toLowerCase(),
      clientWallet.account.address.toLowerCase(),
    );
    assert.equal(
      events[0].args.freelancer.toLowerCase(),
      freelancerWallet.account.address.toLowerCase(),
    );
    assert.equal(await escrow.read.projectCount(), 1n);
    assert.equal(client.toLowerCase(), clientWallet.account.address.toLowerCase());
    assert.equal(
      freelancer.toLowerCase(),
      freelancerWallet.account.address.toLowerCase(),
    );
    assert.equal(amount, 0n);
    assert.equal(Number(status), 0);
  });

  it("uses monotonic non-zero ids for successive projects", async function () {
    const escrow = await viem.deployContract("FreelanceEscrow", [], {
      client: { wallet: clientWallet },
    });
    const fromBlock = await publicClient.getBlockNumber();

    await escrow.write.createProject([freelancerWallet.account.address]);
    await escrow.write.createProject([otherFreelancerWallet.account.address]);

    const events = await publicClient.getContractEvents({
      address: escrow.address,
      abi: escrow.abi,
      eventName: "ProjectCreated",
      fromBlock,
      strict: true,
    });

    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((eventLog) => eventLog.args.projectId),
      [1n, 2n],
    );
    assert.ok(events.every((eventLog) => eventLog.args.projectId > 0n));
  });
});
