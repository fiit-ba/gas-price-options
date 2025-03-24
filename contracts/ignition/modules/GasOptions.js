const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("GasOptionsModule", ( context) => {
  // Deploy pricing library first
  const pricingLib = context.contract("GasOptionPricing", [], {
    onDeployment: (receipt) => {
      console.log("Pricing Library deployed at:", receipt.address);
    }
  });

  // Deploy factory with library linkage
  const factory = context.contract("OptionFactory", [], {
    libraries: {
      GasOptionPricing: pricingLib
    },
    onDeployment: (receipt) => {
      console.log("Factory deployed at:", receipt.address);
    }
  });

  return { 
    pricingLib,
    factory 
  };
}); 