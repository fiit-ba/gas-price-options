// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../GasOptionPricing.sol";

contract TestGasOptionPricing {
    using GasOptionPricing for uint256;

    GasOptionPricing.PricingParams public params;

    constructor() {
        // Initialize with some reasonable default values
        params = GasOptionPricing.PricingParams({
            meanGasPrice: 22,      // 22 GWEI
            volatility: 886e14,           // 0.0886 annual volatility
            meanReversionSpeed: 79e14,   // 0.0079 mean reversion speed
            hurstExponent: 38e16,        // 0.38 Hurst exponent
            minPremium: 100000000000000,// 0.0001 ether
            maxPrice: 100   // 100 GWEI
        });
    }

    function testExp(int256 x) public pure returns (uint256) {
        return GasOptionPricing.exp(x);
    }

    function testLn(uint256 x) public pure returns (uint256) {
        return GasOptionPricing.ln(x);
    }

    function testCalculatePremium(
        uint256 currentGasPrice,
        uint256 strike,
        uint256 duration
    ) public view returns (uint256) {
        return GasOptionPricing.calculatePremium(
            currentGasPrice,
            strike,
            duration,
            params
        );
    }

    function testExpectedPrice(
        uint256 currentGasPrice,
        uint256 duration
    ) public view returns (uint256) {
        return GasOptionPricing._calculateExpectedPrice(currentGasPrice, duration, params);
    }

    function testApplyVolatility(
        uint256 expectedPrice,
        uint256 currentGasPrice,
        uint256 strike,
        uint256 duration
    ) public view returns (uint256) {
        return GasOptionPricing._applyVolatility(expectedPrice, currentGasPrice, strike, duration, params);
    }

    // Optional: Add function to update params for different test scenarios
    function setParams(GasOptionPricing.PricingParams memory _params) public {
        params = _params;
    }
} 