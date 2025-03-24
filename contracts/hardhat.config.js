require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ignition");
require('hardhat-ethernal');
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    tests: "./test"
  },
  ethernal: {
    apiToken: process.env.ETHERNAL_API_TOKEN
  },
  solidity: {
    version: "0.8.27",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200  // Lower number = smaller contract size but higher deployment gas
      }
    }
  },
  networks : {
    hardhat: {
      forking: {
        url: "https://opt-mainnet.g.alchemy.com/v2/"+process.env.ALCHEMY_API_KEY,
        blockNumber: 128540764
      }
    }
  },
  ignition: {
    modules: ["./ignition/modules/GasOptions.js"]
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    gasPrice: 1, // in gwei
    token: 'ETH',
    ethPrice: 3900,
    showTimeSpent: true,
  },
};
