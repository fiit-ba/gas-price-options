const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GasOptionPricing", function () {
  let pricing;
  const PRECISION = ethers.parseUnits("1", 18);
  
  before(async function () {
    // Deploy the library first
    const GasOptionPricingLib = await ethers.getContractFactory("GasOptionPricing");
    const gasOptionPricingLib = await GasOptionPricingLib.deploy();
    await gasOptionPricingLib.waitForDeployment();

    // Deploy the test contract with the library linked
    const TestPricingFactory = await ethers.getContractFactory("TestGasOptionPricing", {
        libraries: {
            GasOptionPricing: await gasOptionPricingLib.getAddress()
        }
    });
    pricing = await TestPricingFactory.deploy();
    await pricing.waitForDeployment();
  });

  describe("exp function", function () {
    const testParams = {
      meanGasPrice: ethers.parseUnits("22", 9),     // 22 GWEI
      volatility: ethers.parseUnits("0.0886", 18),       // 0.0886 volatility
      meanReversionSpeed: ethers.parseUnits("0.0079", 18), // 0.0.0079 mean reversion
      hurstExponent: ethers.parseUnits("0.38", 18),  // 0.38 Hurst
      minPremium: ethers.parseUnits("0.0001", 18),  // 0.0001 ETH
      maxPrice: ethers.parseUnits("100", 9)         // 100 GWEI
  };


    it("should return PRECISION for exp(0)", async function () {
      const result = await pricing.testExp(0);
      expect(result).to.equal(PRECISION);
    });

    it("should calculate e^1 correctly", async function () {
      const result = await pricing.testExp(PRECISION);
      // e ≈ 2.718281828459045
      expect(result).to.be.closeTo(
        ethers.parseUnits("2.718281828", 18), 
        ethers.parseUnits("0.000001", 18)
      );
    });

    it("should calculate e^(1/3) correctly", async function () {
      const x = PRECISION / 3n;
      const result = await pricing.testExp(x);
      // e^(1/3) = 1.395612403
      expect(result).to.be.closeTo(
        ethers.parseUnits("1.395612403", 18), 
        ethers.parseUnits("0.02", 18)
      );
    });

    it("should calculate e^-(1/3) correctly", async function () {
      const x = PRECISION / 3n;
      const result = await pricing.testExp(-x);
      // e^-(1/3) = 0.7165313
      expect(result).to.be.closeTo(
        ethers.parseUnits("0.7165313", 18), 
        ethers.parseUnits("0.02", 18)
      );
    });

    it("should calculate e^-1 correctly", async function () {
      const result = await pricing.testExp(-PRECISION);
      // e^-1 ≈ 0.367879441171442
      expect(result).to.be.closeTo(
        ethers.parseUnits("0.367879441", 18),
        ethers.parseUnits("0.000001", 18)
      );
    });

    it("should calculate e^(-0.0079*60) correctly", async function () {
      const duration = BigInt(60);
      const exponent = -testParams.meanReversionSpeed * duration;
      const result = await pricing.testExp(exponent);
      // e^(-0.0079*60) ≈ 0.62
      expect(result).to.be.closeTo(
        ethers.parseUnits("0.6225073", 18),
        ethers.parseUnits("0.000001", 18)
      );
    });

    it("should revert for very negative numbers", async function () {
      await expect(
        pricing.testExp(ethers.parseUnits("-90", 18))
      ).to.be.revertedWith("EXP_OUT_OF_BOUNDS");
    });

    it("should revert for very large numbers", async function () {
      await expect(
        pricing.testExp(ethers.parseUnits("90", 18))
      ).to.be.to.be.revertedWith("EXP_OUT_OF_BOUNDS");
    });
  });

  describe("ln function", function () {
    it("should return 0 for ln(1)", async function () {
      const result = await pricing.testLn(1);
      expect(result).to.equal(0);
    });

    it("should calculate ln(2) correctly", async function () {
      const result = await pricing.testLn(2);
      // ln(2) ≈ 0.693147180559945
      expect(result).to.be.closeTo(
        ethers.parseUnits("0.693147180", 18),
        ethers.parseUnits("0.000001", 18)
      );
    });

    it("should revert for zero input", async function () {
      await expect(
        pricing.testLn(0)
      ).to.be.revertedWith("Input must be >= 1");
    });
  });

  describe("calculatePremium", function () {
    let pricing;
    let gasOptionPricingLib;
    var expectedPrice;
    const testParams = {
        meanGasPrice: ethers.parseUnits("22", 9),     // 22 GWEI
        volatility: ethers.parseUnits("0.0886", 18),       // 0.0886 volatility
        meanReversionSpeed: ethers.parseUnits("0.0079", 18), // 0.0.0079 mean reversion
        hurstExponent: ethers.parseUnits("0.38", 18),  // 0.38 Hurst
        minPremium: ethers.parseUnits("0.0001", 18),  // 0.0001 ETH
        maxPrice: ethers.parseUnits("100", 9)         // 100 GWEI
    };

    beforeEach(async function () {
        // Deploy the library first
        const GasOptionPricingLib = await ethers.getContractFactory("GasOptionPricing");
        gasOptionPricingLib = await GasOptionPricingLib.deploy();
        await gasOptionPricingLib.waitForDeployment();

        // Deploy the test contract with the library linked
        const TestPricingFactory = await ethers.getContractFactory("TestGasOptionPricing", {
            libraries: {
                GasOptionPricing: await gasOptionPricingLib.getAddress()
            }
        });
        pricing = await TestPricingFactory.deploy();
        await pricing.waitForDeployment();
        await pricing.setParams(testParams);
    });

    it("should correctly set and retrieve pricing parameters", async function () {
        const params = await pricing.params();
        
        expect(params.meanGasPrice).to.equal(testParams.meanGasPrice);
        expect(params.volatility).to.equal(testParams.volatility);
        expect(params.meanReversionSpeed).to.equal(testParams.meanReversionSpeed);
        expect(params.hurstExponent).to.equal(testParams.hurstExponent);
        expect(params.minPremium).to.equal(testParams.minPremium);
        expect(params.maxPrice).to.equal(testParams.maxPrice);
    });

    it("should calculate expected price", async function () {
        expectedPrice = await pricing.testExpectedPrice(
            20,
            60
        );

        //console.log("Expected Price:", Number(expectedPrice)/1e9);
        expect(expectedPrice).to.be.closeTo(ethers.parseUnits("20.75", 9), ethers.parseUnits("0.01", 9));
    });
 
    it("should apply volatility to expected price", async function () {
        const volatilityAppliedPrice = await pricing.testApplyVolatility(
            expectedPrice,
            ethers.parseUnits("20", 9),
            ethers.parseUnits("30", 9),
            60
        );
        let result = Number(volatilityAppliedPrice)/1e9;
        //console.log("Volatility Applied Premium per unit of gas in Gwei:", result);
        expect(volatilityAppliedPrice).to.be.closeTo(ethers.parseUnits("1.5", 9), ethers.parseUnits("0.225", 9));
    });

    it("should calculate premium for one contract (100,000 units of gas) in Ether", async function () {
        const strikePrice = ethers.parseUnits("30", 9);  // 30 GWEI
        const currentPrice = ethers.parseUnits("20", 9);  // 20 GWEI
        const timeToExpiry = 60;  // blocks

        const premium = await pricing.testCalculatePremium(
            currentPrice,
            strikePrice,
            timeToExpiry
        );

        // expected premium is 0.0005 ETH
        expect(premium).to.be.closeTo(ethers.parseUnits("0.00015", 18), ethers.parseUnits("0.0000225", 18));
    });
  });
}); 