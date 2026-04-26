import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import hre from "hardhat";

describe("AgentRegistry", async () => {
  let owner: Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number];
  let freelancer: Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number];
  let outsider: Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number];
  let registry: Awaited<ReturnType<typeof hre.viem.deployContract<"AgentRegistry">>>;

  beforeEach(async () => {
    const wallets = await hre.viem.getWalletClients();
    [owner, freelancer, outsider] = wallets;

    registry = await hre.viem.deployContract("AgentRegistry");
  });

  it("only allows the owner to manage beta access", async () => {
    await assert.rejects(
      registry.write.setBetaAccess([freelancer.account.address, true], {
        account: freelancer.account,
      })
    );

    await registry.write.setBetaAccess([freelancer.account.address, true], {
      account: owner.account,
    });

    const allowed = await registry.read.betaAllowed([freelancer.account.address]);
    assert.equal(allowed, true);
  });

  it("allows any wallet to create a profile without allowlist access", async () => {
    await registry.write.registerAgent(
      ["Freelancer", "Open profile", "Design", 100n, "Lagos", "Open"],
      { account: freelancer.account }
    );

    const agents = await registry.read.getAgents();
    assert.equal(agents.length, 1);
    assert.equal(agents[0].owner.toLowerCase(), freelancer.account.address.toLowerCase());
  });

  it("keeps one profile per wallet", async () => {
    await registry.write.registerAgent(
      ["Freelancer", "Open profile", "Design", 100n, "Lagos", "Open"],
      { account: freelancer.account }
    );

    await assert.rejects(
      registry.write.registerAgent(
        ["Freelancer Two", "Duplicate profile", "Design", 120n, "Lagos", "Busy"],
        { account: freelancer.account }
      )
    );
  });

  it("lets multiple wallets appear in discovery", async () => {
    await registry.write.registerAgent(
      ["Freelancer", "Open profile", "Design", 100n, "Lagos", "Open"],
      { account: freelancer.account }
    );
    await registry.write.registerAgent(
      ["Outsider", "Open profile", "Ops", 90n, "Abuja", "Open"],
      { account: outsider.account }
    );

    const agents = await registry.read.getAgents();
    assert.equal(agents.length, 2);
    assert.equal(agents[0].owner.toLowerCase(), freelancer.account.address.toLowerCase());
    assert.equal(agents[1].owner.toLowerCase(), outsider.account.address.toLowerCase());
  });
});
