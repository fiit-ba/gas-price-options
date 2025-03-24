// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

// Gas optimalizations
library GasOptionPricing {
    // Precision constants
    uint256 constant PRECISION = 1e18;
    uint256 constant HALF_PRECISION = 5e17;
    uint256 constant MAX_PRECISION_LOSS = 1e15; // 0.1% maximum acceptable precision loss
    
    struct PricingParams {
        uint256 meanGasPrice;
        uint256 volatility;      // Scaled by 1e18
        uint256 meanReversionSpeed; // Scaled by 1e18
        uint256 hurstExponent;   // Scaled by 1e18
        uint256 minPremium;      // Minimum premium to prevent dust
        uint256 maxPrice;
    }

    // Error definitions
    error PrecisionLossExceeded(uint256 expected, uint256 actual);
    error ParameterOutOfBounds(string param, uint256 value, uint256 max);
    error NumericalOverflow(string operation);

    // Improved exp function apporoximation using taylor series
    function exp(int256 x) internal pure returns (uint256) {
        // Use 18 decimal places for fixed point arithmetic
        uint256 SCALE = 1e18;
        
        // e in fixed point format (e * 1e18)
        uint256 E = 2718281828459045235;

        // Prevent overflow with reasonable bounds
        require(x <= 88 * int256(SCALE) && x >= -88 * int256(SCALE), "EXP_OUT_OF_BOUNDS");
        
        if (x == 0) {
            return SCALE; 
        }

        // Handle negative exponents
        if (x < 0) {
            require(x > type(int256).min, "EXP_UNDERFLOW");
            return (SCALE * SCALE) / exp(-x);
        }

        // Split into integer and fractional parts
        uint256 integerPart = uint256(x) / SCALE;
        uint256 fractionalPart = uint256(x) % SCALE;

        // Calculate integer part with repeated multiplication
        uint256 integerResult = SCALE;
        if (integerPart > 0) {
            uint256 base = E;
            for (uint256 i = 0; i < integerPart; i++) {
                integerResult = Math.mulDiv(integerResult, base, SCALE);
            }
        }

        // Calculate fractional part with Taylor series
        uint256 fractionalResult = SCALE;
        uint256 term = SCALE;
        uint256 numerator = fractionalPart;

        for (uint256 i = 1; i <= 8; i++) {
            term = Math.mulDiv(term, numerator, SCALE * i);
            fractionalResult += term;
        }

        // Combine results
        return Math.mulDiv(integerResult, fractionalResult, SCALE);
    }

    function abs(int256 x) internal pure returns (uint256) {
        return x < 0 ? uint256(-x) : uint256(x);
    }

    function pow(uint256 base, uint256 exponent) internal pure returns (uint256) {
        uint256 result = 1;
        for (uint256 i = 0; i < exponent; i++) {
            result = Math.mulDiv(result, base, PRECISION);
        }
        return result;
    }

    function powerWithFractional(uint256 base, int256 exponent) internal pure returns (uint256) {
        if (base <= 1) return 1e18;
        
        // Using log-exp method for power with fractional exponent
        uint256 logBase = ln(base);
        int256 scaledExp = int256((exponent * SafeCast.toInt256(logBase)) / 1e18);
        return exp(scaledExp);
    }

    function ln(uint256 x) public pure returns (uint256) {
        require(x >= 1, "Input must be >= 1");
        uint256 SCALE = 2**64;
        uint256 LN2_SCALED = 12786308645202655659; // ln(2) * 2^64
        uint256 MAX_ITERATIONS = 20;
        uint256 DECIMALS = 1e18;

        if (x == 1) {
            return 0;
        }
        
        uint256 fixed_x = x * SCALE;
        
        uint256 result = 0;
        uint256 n = 0;
        uint256 y = fixed_x;
        
        while (y >= 2 * SCALE) {
            y /= 2;
            n += 1;
        }
        
        result = n * LN2_SCALED;
        
        y = ((y - SCALE) * SCALE) / (y + SCALE);
        uint256 y_squared = (y * y) / SCALE;
        uint256 y_power = y;
        uint256 term;
        
        // Taylor series expansion
        for (uint256 i = 1; i <= MAX_ITERATIONS; i += 2) {
            term = (y_power * SCALE) / (i * SCALE);
            result += term;
            
            y_power = (y_power * y_squared) / SCALE;
            term = (y_power * SCALE) / ((i + 2) * SCALE);
            if (term == 0) break;
            result -= term;
            
            y_power = (y_power * y_squared) / SCALE;
        }
        
        // Convert from our internal scaling (2^64) to 18 decimals of precision
        return (result * DECIMALS) / SCALE;
    }

    // Main premium calculation with precision checks
    function calculatePremium(
        uint256 currentGasPrice,
        uint256 strike,
        uint256 duration,
        PricingParams memory params
    ) internal pure returns (uint256) {
        // Parameter validation
        if (params.volatility > PRECISION) 
            revert ParameterOutOfBounds("volatility", params.volatility, PRECISION);
        if (params.meanReversionSpeed > PRECISION) 
            revert ParameterOutOfBounds("mean_reversion", params.meanReversionSpeed, PRECISION);
        if (params.hurstExponent > PRECISION) 
            revert ParameterOutOfBounds("hurst", params.hurstExponent, PRECISION);

        // Calculate with precision checks
        uint256 premium = _calculatePremiumInternal(
            currentGasPrice,
            strike,
            duration,
            params
        );

        // Apply minimum premium to prevent dust
        return premium < params.minPremium ? params.minPremium : premium;
    }

    // Internal calculation function (implementation similar to previous version but with safe operations)
    function _calculatePremiumInternal(
        uint256 currentGasPrice,
        uint256 strike,
        uint256 duration,
        PricingParams memory params
    ) private pure returns (uint256) {
        // Move constants to storage to save stack space
        uint256 premium = _calculateExpectedPrice(
            currentGasPrice,
            duration,
            params
        );

        premium = _applyVolatility(
            premium,
            currentGasPrice,
            strike,
            duration,
            params
        );

        // Final scaling
        return premium*1e5; // CONTRACT_SIZE
    }

    function _calculateExpectedPrice(
        uint256 currentGasPrice,
        uint256 duration,
        PricingParams memory params
    ) public pure returns (uint256) {

        if (params.meanReversionSpeed > uint256(type(int256).max)) {
            revert NumericalOverflow("kappa_too_large");
        }
        int256 negativeKappa = -SafeCast.toInt256(params.meanReversionSpeed);

        if (duration > uint256(type(int256).max)) {
            revert NumericalOverflow("duration_too_large");
        }
        int256 meanReversionTerm = negativeKappa * SafeCast.toInt256(duration);
        
        uint256 meanReversionFactor = exp(meanReversionTerm);
        if (meanReversionFactor == 0) revert NumericalOverflow("mean_reversion_factor_zero");

        // Calculate difference using unsigned integers
        uint256 difference;
        bool inNegativeDirection;
        currentGasPrice = currentGasPrice*1e9;
        if (currentGasPrice > params.meanGasPrice) {
            difference = currentGasPrice - params.meanGasPrice;
            inNegativeDirection = false;
        } else {
            difference = params.meanGasPrice - currentGasPrice;
            inNegativeDirection = true;
        }
        // Calculate adjusted deviation
        uint256 adjustedDev = Math.mulDiv(difference, meanReversionFactor, 1e18);

        uint256 expectedPrice = inNegativeDirection ? params.meanGasPrice - adjustedDev : params.meanGasPrice + adjustedDev;
        
        return expectedPrice;
    }

    function _applyVolatility(
        uint256 expectedPrice,
        uint256 currentGasPrice,
        uint256 strike,
        uint256 duration,
        PricingParams memory params
    ) public pure returns (uint256) {
        expectedPrice = expectedPrice*1e9;
        strike = strike*1e9;

        uint256 variance = _calculateVariance(duration, params);

        uint256 volatilityTerm = (Math.sqrt(variance) * 1e9);

        uint256 diffFromStrike = currentGasPrice < strike ? strike - currentGasPrice : currentGasPrice - strike;

        uint256 premium;

        if (expectedPrice <= strike || currentGasPrice < strike) {
            // Out of the money - only time value
            uint256 maxMove = params.maxPrice - currentGasPrice;
            uint256 neededMove = strike - currentGasPrice;
            uint256 ratio = (neededMove)/(maxMove);
            uint256 probabilityFactor = Math.max(0, 1e18 - (ratio*1e9));
            premium = volatilityTerm * (probabilityFactor/1e9);
        } else {    
            // In the money
            premium = volatilityTerm + expectedPrice;
        
        }

        uint256 finalPremium = premium/1e18;
        
        return  finalPremium;
    }


    function _calculateVariance(
        uint256 duration, 
        PricingParams memory params
    ) public pure returns (uint256) {
        int256 sigma = SafeCast.toInt256(params.volatility);
        int256 kappa = SafeCast.toInt256(params.meanReversionSpeed);
        int256 hurst = SafeCast.toInt256(params.hurstExponent);

        // Calculate scaling
        int256 sigma2 = sigma**2;
        require(uint256(sigma2) > 0, "P1: sigmaSquared is zero");

        int256 twoKappa = kappa*2;

        int256 baseScaling = sigma2 / twoKappa;
        require(baseScaling > 0, "P1: Base scaling is less than zero");


        // Calculate time component
        uint256 expComponent = exp(-2 * kappa * SafeCast.toInt256(duration));

        int256 meanReversionEffect = 1e18 - SafeCast.toInt256(expComponent);
        require(meanReversionEffect > 0, "P2: meanReversionEffect <= 0");

        // Calculate time scaling
        int256 hurstExponent = (2 * hurst); 

        uint256 timeScaling = powerWithFractional(duration, hurstExponent);

        // Calculate variance
        int256 variance = baseScaling;
        variance = (variance * meanReversionEffect) / 1e18;
        variance = (variance * SafeCast.toInt256(timeScaling)) / 1e18;

        require(variance > 0, "variance_zero");

        return SafeCast.toUint256(variance);
    }

    function calculateSettlement(
        uint256 strikePrice,
        uint256 currentGasPrice
    ) public pure returns (uint256) {
        if (currentGasPrice >= strikePrice) {
            return currentGasPrice-strikePrice;
        }
        return 0;
    }
}