export function calculateGasParameters(historicalData) {
    // 1. Calculate log prices first (most memory efficient way)
    const logPrices = [];
    let sumPrice = 0;
    
    for(let i = 0; i < historicalData.length; i++) {
        const price = historicalData[i].baseGasPrice / 1e9;
        sumPrice += price;
        logPrices.push(Math.log(price));
    }
    
    const meanPrice = sumPrice / historicalData.length;

    // 2. Calculate Hurst using simplified variance method
    function calculateHurst() {
        const lags = [1, 2, 4, 8, 16];
        const points = [];
        
        for(const lag of lags) {
            let sumVar = 0;
            let count = 0;
            
            // Only use first 10000 points for variance calculation
            const maxPoints = Math.min(10000, logPrices.length - lag);
            
            for(let i = 0; i < maxPoints; i++) {
                const diff = logPrices[i + lag] - logPrices[i];
                sumVar += diff * diff;
                count++;
            }
            
            if(count > 0) {
                points.push([Math.log(lag), Math.log(sumVar / count)]);
            }
        }
        
        // Simple linear regression
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for(const [x, y] of points) {
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
        const n = points.length;
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        
        return slope / 2;
    }

    // 3. Calculate kappa (mean reversion speed)
    function calculateKappa() {
        let sumProduct = 0;
        let sumSquared = 0;
        const meanLog = logPrices.reduce((a, b) => a + b) / logPrices.length;
        
        for(let i = 1; i < logPrices.length; i++) {
            const diff = logPrices[i] - logPrices[i-1];
            const dev = logPrices[i-1] - meanLog;
            sumProduct += diff * dev;
            sumSquared += dev * dev;
        }
        
        return -sumProduct / sumSquared;
    }

    // 4. Calculate volatility
    function calculateVolatility() {
        let sumSq = 0;
        let count = 0;
        
        for(let i = 1; i < logPrices.length; i++) {
            const diff = logPrices[i] - logPrices[i-1];
            sumSq += diff * diff;
            count++;
        }
        
        return Math.sqrt(sumSq / count);
    }

    const H = calculateHurst();
    const kappa = calculateKappa();
    const sigma = calculateVolatility();

    return {
        raw: {
            hurstExponent: H,
            meanReversionSpeed: kappa,
            volatility: sigma,
            meanGasPrice: meanPrice
        },
        forContract: {
            hurstScaled: Math.round(H * 1e6),
            kappaScaled: Math.round(kappa * 1e6),
            sigmaScaled: Math.round(sigma * 1e6),
            meanGasPrice: Math.round(meanPrice * 1e6)
        }
    };
}