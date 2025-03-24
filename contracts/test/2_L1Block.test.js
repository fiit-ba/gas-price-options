const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("L1Block", function () {
  let testL1Block;
  let owner;

  beforeEach(async function () {
    
    [owner] = await ethers.getSigners();
    
    const TestL1Block = await ethers.getContractFactory("TestL1Block");
    testL1Block = await TestL1Block.deploy();
    await testL1Block.waitForDeployment();
  });

  it("Should get L1 block number", async function () {
    const blockNumber = await testL1Block.getL1BlockNumber();
    expect(blockNumber).to.be.gt(0);
  });

  it("Should get L1 base fee", async function () {
    const baseFee = await testL1Block.getL1Basefee();
    expect(baseFee).to.be.gt(0);
  });

  it("Should get L1 blob base fee", async function () {
    const blobBaseFee = await testL1Block.getL1BlobBasefee();
    expect(blobBaseFee).to.be.gt(0);
  });
});