const { expect } = require("chai");
const { ethers } = require("hardhat");

const L1_BLOCK_ADDRESS = "0x4200000000000000000000000000000000000015";

describe("GasOption", async function () {
    let factory;
    let option;
    let owner;
    let writer;
    let buyer;
    let keeper;
    let funder;

    let L1BlockSigner;

    const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
    let currentBlock = await l1Block.number();


    // Test parameters
    const hurstExponent = ethers.parseEther("0.38");      // 0.5 scaled to 1e18
    const meanReversionSpeed = ethers.parseEther("0.0079");  // 0.1 scaled to 1e18
    const volatility = ethers.parseEther("0.0886");         // 0.5 scaled to 1e18
    const meanGasPrice = ethers.parseUnits("22", "gwei"); // 20 gwei
    const minPremium = ethers.parseUnits("0.0001", "gwei");
    const maxPrice = ethers.parseUnits("100", "gwei");
    const availableBlocks = 100000;
    const collateral = ethers.parseEther("1");           // 1 ETH

    beforeEach(async function () {
        [owner, writer, buyer, keeper, funder] = await ethers.getSigners();

        const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);

        const L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");
        
        // Fund the L1BlockSigner with 1 ETH
        await funder.sendTransaction({
            to: L1BlockSigner.address,
            value: ethers.parseEther("1")
        });

        // Deploy library first
        const GasOptionPricing = await ethers.getContractFactory("GasOptionPricing");
        const gasOptionPricing = await GasOptionPricing.deploy();

        // Deploy factory with library linking
        const Factory = await ethers.getContractFactory("OptionFactory", {
            libraries: {
                GasOptionPricing: gasOptionPricing.target
            }
        });
        factory = await Factory.deploy();

        // Create option
        const tx = await factory.connect(writer).createOption(
            hurstExponent,
            meanReversionSpeed,
            volatility,
            meanGasPrice,
            minPremium,
            maxPrice,
            availableBlocks,
            { value: collateral }
        );
        const receipt = await tx.wait();
        
        // Get option address from event
        const event = receipt.logs.find(log => 
            log.fragment && log.fragment.name === 'OptionCreated'
        );
        const optionAddress = event.args[0];

        // Get option contract instance
        const Option = await ethers.getContractFactory("GasOption", {
            libraries: {
                GasOptionPricing: gasOptionPricing.target
            }
        });
        option = Option.attach(optionAddress);
      
        await setL1Gas(L1BlockSigner, currentBlock ,ethers.parseUnits("20", "gwei"));
    });

    describe("Deployment", function () {
        it("Should set correct parameters", async function () {
            const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
            const params = await option.parameters();
            const availableBlock = await option.availableUntilBlock();
            let currentBlock = await l1Block.number();
           
            expect(params.hurstExponent).to.equal(hurstExponent);
            expect(params.meanReversionSpeed).to.equal(meanReversionSpeed);
            expect(params.volatility).to.equal(volatility);
            expect(params.meanGasPrice).to.equal(meanGasPrice);
            expect(params.minPremium).to.equal(minPremium);
            expect(params.maxPrice).to.equal(maxPrice);
            expect(availableBlock).to.equal(availableBlocks+Number(currentBlock));
        });

        it("Should set correct writer", async function () {
            expect(await option.writer()).to.equal(writer.address);
        });

        it("Should have correct collateral", async function () {
            expect(await ethers.provider.getBalance(option.target)).to.equal(collateral);
        });

        it("Should allow only the writer to extend available blocks", async function () {
            const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
            const L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            const currentBlock = await l1Block.number();
            const initialAvailableUntil = await option.availableUntilBlock();
            const extensionBlocks = 50000;

            await mineL1For(L1BlockSigner, availableBlocks, ethers.parseUnits("20", "gwei"));

            // Only writer should be able to extend
            await expect(option.connect(buyer).extend(extensionBlocks))
                .to.be.revertedWith("Not writer");

            await expect(option.connect(writer).extend(extensionBlocks))
                .to.not.be.reverted;

            const newAvailableUntil = await option.availableUntilBlock();
            expect(newAvailableUntil).to.equal(initialAvailableUntil + BigInt(extensionBlocks));
        });

        it("Should allow only the writer to update parameters", async function () {
            const L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");
            const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
            const newAvailableUntilBlock = 100;

            await mineL1For(L1BlockSigner, availableBlocks*2, ethers.parseUnits("20", "gwei"));

            // New parameters as a struct
            const newParams = {
                hurstExponent: ethers.parseEther("0.42"),
                meanReversionSpeed: ethers.parseEther("0.0085"),
                volatility: ethers.parseEther("0.095"),
                meanGasPrice: ethers.parseUnits("25", "gwei"),
                minPremium: ethers.parseUnits("0.00015", "gwei"),
                maxPrice: ethers.parseUnits("120", "gwei")
            };

            // Only writer should be able to update parameters
            await expect(option.connect(buyer).updateParameters(newParams, newAvailableUntilBlock))
                .to.be.revertedWith("Not writer");

            await expect(option.connect(writer).updateParameters(newParams, newAvailableUntilBlock))
                .to.not.be.reverted;

            const params = await option.parameters();
            expect(params.hurstExponent).to.equal(newParams.hurstExponent);
            expect(params.meanReversionSpeed).to.equal(newParams.meanReversionSpeed);
            expect(params.volatility).to.equal(newParams.volatility);
            expect(params.meanGasPrice).to.equal(newParams.meanGasPrice);
            expect(params.minPremium).to.equal(newParams.minPremium);
            expect(params.maxPrice).to.equal(newParams.maxPrice);
        });
    });

    describe("Option Buying", function () {
        const strikePrice = ethers.parseUnits("25", "gwei"); // 25 gwei
        const duration = 100;
        const contractsAmount = 1;

        it("Should allow buying an option", async function () {
            const buyerBalanceInitial = await ethers.provider.getBalance(buyer.address);
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            
            await expect(option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium }
            )).to.not.be.reverted;

            const position = await option.positions(buyer.address);
            expect(position.strikePrice).to.equal(strikePrice);
            expect(position.isSettled).to.be.false;
            expect(position.isActive).to.be.true;
        });

        it("Should discount the premium with higher strike price", async function () {
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            const premium2 = await option.calculatePremium(strikePrice+strikePrice, duration, contractsAmount);

            expect(premium2).to.be.lessThan(premium);
        });

        it("Should fail if premium is insufficient", async function () {
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            
            await expect(option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium - 100n }
            )).to.be.revertedWith("Insufficient premium");
        });

        it("Should refund excess premium", async function () {
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            const excess = ethers.parseEther("0.1"); // 0.1 ETH excess
            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
            
            const tx = await option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium + excess }
            );
            const receipt = await tx.wait();
            
            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            const gasSpent = receipt.gasUsed * receipt.gasPrice;
            
            // Buyer should only lose the premium amount plus gas costs
            expect(buyerBalanceBefore - buyerBalanceAfter).to.closeTo(premium + gasSpent, 200000n);
        });

        it("Should not allow opening multiple positions", async function () {
            // Buy first option
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            await option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium }
            );
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            await mineL1For(L1BlockSigner, 10, ethers.parseUnits("20", "gwei"));


            // Attempt to buy second option
            await expect(option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium }
            )).to.be.revertedWith("Already has Position");
        });

        it("Should allow buying, settling, and buying again", async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            // Buy the first option
            const strikePrice1 = ethers.parseUnits("30", "gwei");
            const duration1 = 100;
            const amountOfContracts1 = 1;
            const premium1 = await option.calculatePremium(strikePrice1, duration1, amountOfContracts1);

            await expect(option.connect(buyer).buyOption(strikePrice1, duration1, amountOfContracts1, { value: premium1 })).to.not.be.reverted;

            // Mine blocks to reach expiration
            await mineL1For(L1BlockSigner, duration1, ethers.parseUnits("20", "gwei"));

            // Settle the first option
            await expect(option.connect(buyer).settleOption())
                .to.not.be.reverted;

            let position1 = await option.positions(buyer.address);
            expect(position1.isSettled).to.be.true;
            expect(position1.isActive).to.be.false;

            // Buy the second option
            const strikePrice2 = ethers.parseUnits("30", "gwei");
            const duration2 = 10;
            const amountOfContracts2 = 2;
            const premium2 = await option.calculatePremium(strikePrice2, duration2, amountOfContracts2);

            await expect(option.connect(buyer).buyOption(strikePrice2, duration2, amountOfContracts2, { value: premium2 })).to.not.be.reverted;

            // Mine blocks to reach expiration
            await mineL1For(L1BlockSigner, duration2, ethers.parseUnits("40", "gwei"));

            // Settle the second option
            await expect(option.connect(buyer).settleOption())
                .to.not.be.reverted;

            let position2 = await option.positions(buyer.address);
            expect(position2.isSettled).to.be.true;
            expect(position2.isActive).to.be.false;
        });

        it("Should not allow buying option that expires after availability", async function () {
            const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
            let currentBlock = await l1Block.number();
            const availableUntilBlock = await option.availableUntilBlock();

            await mineL1For(L1BlockSigner, Number(availableUntilBlock-currentBlock)-100, ethers.parseUnits("40", "gwei"));
            currentBlock = await l1Block.number();
            
            // Try to buy option that would expire after availableUntilBlock
            const strikePrice = ethers.parseUnits("25", "gwei");
            const duration = Number(availableUntilBlock-currentBlock)+10; // Duration that goes beyond availability
            const contractsAmount = 1;
            
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            
            await expect(option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium }
            )).to.be.revertedWith("Option not available");
        });
    });

    describe("Option Settlement", function () {
        const strikePrice = ethers.parseUnits("25", "gwei");
        const duration = 100;
        const contractsAmount = 1;

        beforeEach(async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");
            const premium = await option.calculatePremium(strikePrice, duration, contractsAmount);
            const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);

            await setL1Gas(L1BlockSigner, Number(l1Block.number()), ethers.parseUnits("20", "gwei"));

            tx1 = await option.connect(buyer).buyOption(
                strikePrice,
                duration,
                contractsAmount,
                { value: premium }
            );

        });

        it("Should allow holder to settle", async function () {
            const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            let currentBlock = await l1Block.number();
            await mineL1For(L1BlockSigner, duration, ethers.parseUnits("20", "gwei"));
            
            currentBlock = await l1Block.number();
            await expect(option.connect(buyer).settleOption())
                .to.not.be.reverted;

            const position = await option.positions(buyer.address);
            expect(position.isSettled).to.be.true;
            expect(position.isActive).to.be.false;
        });

        it("Should settle in profit", async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            await mineL1For(L1BlockSigner, duration, ethers.parseUnits("70", "gwei"));
            
            
            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
            const contractBalanceBefore = await ethers.provider.getBalance(option.target);
            
            const tx2 = await option.connect(buyer).settleOption();

            const position = await option.positions(buyer.address);
            expect(position.isSettled).to.be.true;
            expect(position.isActive).to.be.false;

            const receipt2 = await tx2.wait();
            const gasSpent2 = receipt2.gasUsed * receipt2.gasPrice;

            const contractBalance = await ethers.provider.getBalance(option.target);

            // Check if the buyer received the settlement amount
            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            expect(buyerBalanceAfter+gasSpent2).to.be.above(buyerBalanceBefore);
            expect(contractBalance).to.lessThan(contractBalanceBefore);
        });

        it("Should not allow settling before expiry", async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");
            
            // Mine some blocks but less than duration
            await mineL1For(L1BlockSigner, duration - 10, ethers.parseUnits("70", "gwei"));
            
            // Attempt to settle before expiry
            await expect(option.connect(buyer).settleOption())
                .to.be.revertedWith("Not expired");

            const position = await option.positions(buyer.address);
            expect(position.isSettled).to.be.false;
            expect(position.isActive).to.be.true;
        });        

        it("Should revert if not settled in time", async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");
            
            // Wait longer than the duration plus grace period
            await mineL1For(L1BlockSigner, duration+2, ethers.parseUnits("40", "gwei"));

            await expect(option.connect(buyer).settleOption())
                .to.be.revertedWith("Passed");

            const position = await option.positions(buyer.address);
            expect(position.isSettled).to.be.false;
            expect(position.isActive).to.be.true;
        });

        it("Should allow keeper to settle", async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            const nextExpiring = await option.getFirstToExpire();

            await mineL1Until(L1BlockSigner, Number(nextExpiring), ethers.parseUnits("70", "gwei"));

            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
            const keeperBalanceBefore = await ethers.provider.getBalance(keeper.address);
            const contractBalanceBefore = await ethers.provider.getBalance(option.target);

            await expect(option.connect(keeper).keeperSettle())
                .to.not.be.reverted;

            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            const keeperBalanceAfter = await ethers.provider.getBalance(keeper.address);
            const contractBalanceAfter = await ethers.provider.getBalance(option.target);

            expect(buyerBalanceAfter).to.be.above(buyerBalanceBefore);
            expect(keeperBalanceAfter).to.be.above(keeperBalanceBefore);
            expect(contractBalanceAfter).to.be.lessThan(contractBalanceBefore);

            const position = await option.positions(buyer.address);
            expect(position.isSettled).to.be.true;
            expect(position.isActive).to.be.false;
        });

        it("Should not allow keeper to settle with no positions", async function () {
            L1BlockSigner = await ethers.getImpersonatedSigner("0xDeaDDEaDDeAdDeAdDEAdDEaddeAddEAdDEAd0001");

            const nextExpiring = await option.getFirstToExpire();

            // Mine until the next expiring block
            await mineL1Until(L1BlockSigner, Number(nextExpiring)-5, ethers.parseUnits("70", "gwei"));

            // Try to settle with no positions
            await expect(option.connect(keeper).keeperSettle()).to.be.revertedWith("No expiry in this blocks");
        });

        it("Should allow keeper to settle multiple positions with same expiry", async function () {
            // Create a second buyer position with same expiry
            const buyer2 = funder; // Using funder account as second buyer
            const premium2 = await option.calculatePremium(strikePrice, duration, 2*contractsAmount);
            
            await option.connect(buyer2).buyOption(
                strikePrice,
                duration,
                2*contractsAmount,
                { value: premium2 }
            );

            // Get balances before settlement
            const buyer1BalanceBefore = await ethers.provider.getBalance(buyer.address);
            const buyer2BalanceBefore = await ethers.provider.getBalance(buyer2.address);
            const keeperBalanceBefore = await ethers.provider.getBalance(keeper.address);
            const contractBalanceBefore = await ethers.provider.getBalance(option.target);

            // Mine blocks until expiry and set high gas price
            const nextExpiring = await option.getFirstToExpire();
            await mineL1Until(L1BlockSigner, Number(nextExpiring), ethers.parseUnits("70", "gwei"));

            // Keeper settles both positions
            await expect(option.connect(keeper).keeperSettle())
                .to.not.be.reverted;

            // Verify both positions are settled
            const position1 = await option.positions(buyer.address);
            const position2 = await option.positions(buyer2.address);
            expect(position1.isSettled).to.be.true;
            expect(position2.isSettled).to.be.true;
            expect(position1.isActive).to.be.false;
            expect(position2.isActive).to.be.false;

            // Verify all parties received their funds
            const buyer1BalanceAfter = await ethers.provider.getBalance(buyer.address);
            const buyer2BalanceAfter = await ethers.provider.getBalance(buyer2.address);
            const keeperBalanceAfter = await ethers.provider.getBalance(keeper.address);
            const contractBalanceAfter = await ethers.provider.getBalance(option.target);

            expect(buyer1BalanceAfter).to.be.above(buyer1BalanceBefore);
            expect(buyer2BalanceAfter).to.be.above(buyer2BalanceBefore);
            expect(keeperBalanceAfter).to.be.above(keeperBalanceBefore);
            expect(contractBalanceAfter).to.be.lessThan(contractBalanceBefore);
        });
    });
});


async function mineL1For(signer, duration, baseFee) {
    const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
    const currentBlock = await l1Block.number();
    const targetBlock = currentBlock + BigInt.asUintN(64,BigInt(duration));
    
    await setL1Gas(signer, targetBlock, baseFee);
}

async function mineL1Until(signer, untilBlock, baseFee) {
    
    await setL1Gas(signer, BigInt.asUintN(64,BigInt(untilBlock)), baseFee);
}

async function setL1Gas(signer, blockNumber, baseFee) {
    const currBlockData = await getL1BlockValues();
    
    const calldata = ethers.concat([
        "0x440a5e20",  // Function selector for setL1BlockValuesEcotone
        ethers.zeroPadValue(ethers.toBeHex(currBlockData.baseFeeScalar), 4),
        ethers.zeroPadValue(ethers.toBeHex(currBlockData.blobBaseFeeScalar), 4),
        ethers.zeroPadValue(ethers.toBeHex(currBlockData.sequenceNumber), 8),
        ethers.zeroPadValue(ethers.toBeHex(currBlockData.timestamp), 8),
        ethers.zeroPadValue(ethers.toBeHex(blockNumber ? blockNumber : currBlockData.blockNumber), 8),
        ethers.zeroPadValue(ethers.toBeHex(baseFee), 32),
        ethers.zeroPadValue(ethers.toBeHex(currBlockData.blobBaseFee), 32),
        ethers.ZeroHash,
        ethers.ZeroHash
    ]);

    await signer.sendTransaction({
        to: L1_BLOCK_ADDRESS,
        data: calldata,
        gasLimit: 500000,  // Explicit reasonable gas limit
        maxFeePerGas: ethers.parseUnits("100", "gwei")  // Maximum fee we're willing to pay
    });
}

async function getL1BlockValues() {
    const l1Block = await ethers.getContractAt("IL1Block", L1_BLOCK_ADDRESS);
    const baseFeeScalar = await l1Block.baseFeeScalar();
    const blobBaseFeeScalar = await l1Block.blobBaseFeeScalar();
    const sequenceNumber = await l1Block.sequenceNumber();
    const timestamp = await l1Block.timestamp();
    const blockNum = await l1Block.number();
    const baseFee = await l1Block.basefee();
    const blobBaseFee = await l1Block.blobBaseFee();
    const hash = await l1Block.hash();
    const batcherHash = await l1Block.batcherHash();
    return {
        baseFeeScalar: baseFeeScalar,
        blobBaseFeeScalar: blobBaseFeeScalar,
        sequenceNumber: sequenceNumber,
        timestamp: timestamp,
        blockNumber: blockNum,
        baseFee: baseFee,
        blobBaseFee: blobBaseFee,
        hash: hash,
        batcherHash: batcherHash
    };
}