import { useState, useEffect } from 'react';
import { calculateGasParameters } from '../utility/calculateParams';
import { ethers } from 'ethers';
import contractsInfo from '../contracts/contracts.json';

function WriteOption({ provider, signer }) {
  const [gasPrice, setGasPrice] = useState(NaN);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showCalculatedParams, setShowCalculatedParams] = useState(false);
  const [blockDuration, setBlockDuration] = useState(10000);
  const [historicalBlocks, setHistoricalBlocks] = useState(1000);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDataReady, setIsDataReady] = useState(false);
  const [gasData, setGasData] = useState([]);
  const [calculatedParams, setCalculatedParams] = useState(null);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [strikePrice, setStrikePrice] = useState(30); // in Gwei
  const [optionDuration, setOptionDuration] = useState(100); // in blocks
  const [numContracts, setNumContracts] = useState(1);
  const [currentGasPrice, setCurrentGasPrice] = useState(30); // in Gwei
  const [futureGasPrice, setFutureGasPrice] = useState(35);  // Simulated price at expiration
  const [manualParams, setManualParams] = useState({
    hurstExponent: 0.38,
    meanReversionSpeed: 0.0079,
    volatility: 0.0886,
    meanGasPrice: 22
  });
  const [maxGasPrice, setMaxGasPrice] = useState(50); // in Gwei
  const [minPremium, setMinPremium] = useState(0); // in ETH
  const [collateral, setCollateral] = useState(0); // in ETH


  const CONTRACT_SIZE = 100000;  // gas units per contract
  const GWEI_TO_ETH = 1e-9;      // conversion factor
  const ETH_PRICE_USD = 3200;  // Current ETH price in USD

  const optionFactory = new ethers.Contract(
    contractsInfo.OptionFactory.address,
    contractsInfo.OptionFactory.abi,
    signer 
  );


  // Check for local storage data on component mount
  useEffect(() => {
    const storedData = localStorage.getItem('gasData');
    setHasLocalData(!!storedData);
  }, []);

  useEffect(() => {
    handleGasPriceChange();
    const interval = setInterval(handleGasPriceChange, 14000);

    return () => clearInterval(interval);
  }, []);

  const handleLoadFromStorage = () => {
    try {
      const storedData = JSON.parse(localStorage.getItem('gasData'));
      if (storedData) {
        setGasData(storedData);
        setIsDataReady(true);
        alert('Data loaded from local storage successfully!');
      }
    } catch (error) {
      console.error('Error loading from local storage:', error);
      alert('Error loading data from local storage');
    }
  };

  const handleSaveToStorage = () => {
    try {
      localStorage.setItem('gasData', JSON.stringify(gasData));
      setHasLocalData(true);
      alert('Data saved to local storage successfully!');
    } catch (error) {
      console.error('Error saving to local storage:', error);
      alert('Error saving data to local storage');
    }
  };

  const calculateTimeFromBlocks = (blocks) => {
    const seconds = blocks * 14;
    if (seconds < 3600) {
      return `${blocks} blocks (≈${Math.round(seconds / 60)} minutes)`;
    } else if (seconds < 86400) {
      return `${blocks} blocks (≈${(seconds / 3600).toFixed(1)} hours)`;
    } else {
      return `${blocks} blocks (≈${(seconds / 86400).toFixed(1)} days)`;
    }
  };

  const handleGasPriceChange = async () => {
    try {
      const rpc_url = "https://ethereum-rpc.publicnode.com";
      const response = await fetch(rpc_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1
        })
      });

      const data = await response.json();
      const currentGasPrice = parseInt(data.result, 16);
      setGasPrice(currentGasPrice);
    } catch (error) {
      console.error('Error fetching gas price:', error);
    }
  };

  // Max blocks for approximately 1 week (7 days)
  const maxBlocks = Math.ceil((7 * 24 * 60 * 60) / 14); // ≈ 43200 blocks

  const handleFetchData = async () => {
    setIsDownloading(true);
    setIsDataReady(false);
    setDownloadProgress(0);

    const rpc_url = "https://ethereum-rpc.publicnode.com";

    try {
      // First get the latest block number
      const response = await fetch(rpc_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });
      
      const data = await response.json();
      const latestBlock = parseInt(data.result, 16);
      const gasData = [];

      console.log("latestBlock", latestBlock);
      // Fetch gas data for each block
      for (let i = 0; i < historicalBlocks; i++) {
        const blockNumber = latestBlock - i;
        const blockResponse = await fetch(rpc_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: [`0x${blockNumber.toString(16)}`, false],
            id: 1
          })
        });

        const blockData = await blockResponse.json();
        if (blockData.result) {
          gasData.push({
            blockNumber: blockNumber,
            baseGasPrice: parseInt(blockData.result.baseFeePerGas, 16)
          });
        }

        // Update progress
        setDownloadProgress(((i + 1) / historicalBlocks) * 100);
      }

      console.log('Fetched gas data:', gasData);
      setGasData(gasData);
      setIsDataReady(true);
    } catch (error) {
      console.error('Error fetching gas data:', error);
      alert('Error fetching gas data. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const calculateParameters = () => {
    console.log("gasData", gasData);
    if (!gasData.length) return;

    try {
      const params = calculateGasParameters(gasData);
      console.log("params", params);
      setCalculatedParams(params);
    } catch (error) {
      console.error('Error calculating parameters:', error);
      alert('Error calculating parameters. Please try again.');
    }
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const rows = text.split('\n');
          const headers = rows[0].toLowerCase().split(',');
          
          // Find the relevant column indices
          const blockNumberIndex = headers.findIndex(h => h.includes('block'));
          const gasPriceIndex = headers.findIndex(h => h.includes('gas'));
          
          if (blockNumberIndex === -1 || gasPriceIndex === -1) {
            throw new Error('CSV must contain "block" and "gas" columns');
          }

          const parsedData = rows.slice(1)  // Skip header row
            .filter(row => row.trim())      // Remove empty rows
            .map(row => {
              const columns = row.split(',');
              return {
                blockNumber: parseInt(columns[blockNumberIndex]),
                baseGasPrice: parseFloat(columns[gasPriceIndex])
              };
            });

          setGasData(parsedData);
          setIsDataReady(true);
          alert('CSV data loaded successfully!');
        } catch (error) {
          console.error('Error parsing CSV:', error);
          alert('Error parsing CSV file. Please check the format.');
        }
      };
      reader.readAsText(file);
    }
  };

  // Premium calculation function with gas units
  // This example estimation is not valid enymore, the correct calculation is implemented in GasOptionPricing.sol
  const calculatePremium = (currentGasPrice, strike, duration, params, contracts = 1) => {
    if (!params) return 0;

    const meanGas = params.raw.meanGasPrice;
    const sigma = params.raw.volatility;
    const kappa = params.raw.meanReversionSpeed;
    const H = params.raw.hurstExponent;
    const maxPrice = 100; // arbitrary max price for probability calculation

    // Debug logging
    const debug = true;
    const log = (step, value) => {
        if (debug) console.log(`${step}: ${value}`);
    };

    // 1. Expected future price based on mean reversion from the paper
    log('-Kappa', -kappa);
    const meanReversionFactor = Math.exp(-kappa * duration);
    log('Mean Reversion Factor', meanReversionFactor);
    const expectedPrice = meanGas + (currentGasPrice - meanGas) * meanReversionFactor;
    log('Expected Price (Gwei)', expectedPrice);

   // 2. Variance calculation from from paper
    const baseScaling = (sigma**2 / (2*kappa));
    const expTerm = (1 - Math.exp(-2 * kappa * duration)); 
    const hurstTerm = Math.pow(duration, 2 * H);
    const variance = baseScaling * expTerm * hurstTerm;
    log('Variance', variance);


    // 3. Volatility term
    const volatilityTerm = Math.sqrt(variance);
    log('Volatility Term', volatilityTerm);

    // 4. Calculate option value components
    const diffFromStrike = expectedPrice - strike;
    log('Diff from Strike (Gwei)', diffFromStrike);

    // 6. Risk adjustment based on time to expiry (scaled by max possible change)
    const riskAdjustment = 1+(Math.sqrt(duration)/8);
    log('Risk Adjustment', riskAdjustment);

    // 7. Calculate premium in Gwei
    let premium;
    if (diffFromStrike > 0) {
        // In the money
        premium = expectedPrice;
    } else {
        // Out of the money - probability of reaching strike
        const maxPossibleMove = maxPrice - currentGasPrice;
        const neededMove = strike - currentGasPrice;
        const probabilityFactor = Math.max(0, 1 - (neededMove / maxPossibleMove));
        premium = volatilityTerm * probabilityFactor;
    }
    log('Base Premium (Gwei)', premium);

    // 8. Convert to ETH terms
    const finalPremium = premium * contracts * CONTRACT_SIZE * GWEI_TO_ETH;
    log('Final Premium (ETH)', finalPremium);

    return Math.max(0.0001, finalPremium);
};
  // Add these calculations
  const calculateOptionMetrics = (contracts, strike, duration, currentGasPrice, params) => {
    if (!params) return null;

    const totalGasUnits = contracts * CONTRACT_SIZE;
    const premium = calculatePremium(currentGasPrice, strike, duration, params, contracts);
    const intrinsicValue = Math.max(currentGasPrice - strike, 0) * totalGasUnits / 1e9;
    const breakEvenPrice = strike + (premium * 1e9) / totalGasUnits;

    return {
      totalGasUnits,
      premium,
      intrinsicValue,
      breakEvenPrice
    };
  };

  const applyManualParams = () => {
    setCalculatedParams({
      raw: {
        hurstExponent: manualParams.hurstExponent,
        meanReversionSpeed: manualParams.meanReversionSpeed,
        volatility: manualParams.volatility,
        meanGasPrice: manualParams.meanGasPrice
      }
    });
    setIsDataReady(true);
  };

  const handleWriteOption = async () => {
    try {
      if (!signer) {
        throw new Error("No signer available. Please connect your wallet first.");
      }

      // Create contract instance with signer
      const optionFactoryWithSigner = optionFactory.connect(signer);

      const optionParams = {
        hurstExponent: ethers.parseUnits(calculatedParams.raw.hurstExponent.toString(), 18),
        meanReversionSpeed: ethers.parseUnits(calculatedParams.raw.meanReversionSpeed.toString(), 18),
        volatility: ethers.parseUnits(calculatedParams.raw.volatility.toString(), 18),
        meanGasPrice: ethers.parseUnits(calculatedParams.raw.meanGasPrice.toString(), 9), // Gas price in Gwei
        maxGasPrice: ethers.parseUnits(maxGasPrice.toString(), 9), // Gas price in Gwei
        minPremium: ethers.parseUnits(minPremium.toString(), 18),
      };
      // Encode and log the calldata
      const calldata = optionFactoryWithSigner.interface.encodeFunctionData('createOption', [
        optionParams.hurstExponent,
        optionParams.meanReversionSpeed,
        optionParams.volatility,
        optionParams.meanGasPrice,
        optionParams.minPremium,
        optionParams.maxGasPrice,
        blockDuration
      ]);
      console.log('Encoded calldata:', calldata);

      // Estimate gas before sending transaction
      try {
        const gasEstimate = await optionFactoryWithSigner.createOption.estimateGas(
          optionParams.hurstExponent,
          optionParams.meanReversionSpeed,
          optionParams.volatility,
          optionParams.meanGasPrice,
          optionParams.minPremium,
          optionParams.maxGasPrice,
          ethers.getBigInt(blockDuration),
          { value: ethers.parseUnits(collateral.toString(), 18) }
        );
        console.log('Estimated gas:', gasEstimate.toString());
      } catch (estimateError) {
        console.error('Gas estimation failed:', estimateError);
        if (estimateError.data) {
          console.log('Revert reason:', estimateError.data);
        }
      }

      console.log('Sending transaction...');
      const tx = await optionFactoryWithSigner.createOption(
        optionParams.hurstExponent,
        optionParams.meanReversionSpeed,
        optionParams.volatility,
        optionParams.meanGasPrice,
        optionParams.minPremium,
        optionParams.maxGasPrice,
        ethers.getBigInt(blockDuration),
        { value: ethers.parseUnits(collateral.toString(), 18) }
      );
      
      console.log('Transaction sent:', tx.hash);
      console.log('Transaction data:', tx);
      
      console.log('Waiting for confirmation...');
      const resp = await tx.wait();
      console.log('Transaction confirmed:', resp);
      
    } catch (error) {
      console.error('Detailed error:', {
        message: error.message,
        code: error.code,
        data: error.data,
        transaction: error.transaction,
        receipt: error.receipt
      });
      alert('Failed to write option: ' + error.message);
    }
  };

  return (
    <div className="write-option">
      <h1>Write New Option Contract</h1>
      <div className="option-form">
        <h2>Contract Details</h2>
        <p>Gas Price: {(gasPrice / 1000000000).toFixed(2)} Gwei</p>
        
        <div className="parameter-buttons-container">
          <div className="parameter-buttons">
            <button 
              className={`param-btn ${showManualEntry ? 'active' : ''}`}
              onClick={() => {
                setShowManualEntry(!showManualEntry);
                setShowCalculatedParams(false);
              }}
            >
              Manual Parameter Entry
            </button>
            <button 
              className={`param-btn ${showCalculatedParams ? 'active' : ''}`}
              onClick={() => {
                setShowCalculatedParams(!showCalculatedParams);
                setShowManualEntry(false);
              }}
            >
              Calculate Optimal Parameters
            </button>
          </div>
        </div>

        {showManualEntry && (
          <div className="parameter-inputs">
            <div className="input-group">
              <label>Hurst Exponent:</label>
              <input 
                type="number" 
                step="0.01" 
                min="0" 
                max="1" 
                defaultValue="0.38"
                onChange={(e) => setManualParams(prev => ({
                  ...prev,
                  hurstExponent: Math.max(0, Math.min(1, Number(e.target.value)))
                }))}
              />
            </div>
            <div className="input-group">
              <label>Mean Reversion Speed:</label>
              <input 
                type="number" 
                step="0.01" 
                min="0" 
                defaultValue="0.0079"
                onChange={(e) => setManualParams(prev => ({
                  ...prev,
                  meanReversionSpeed: Math.max(0, Number(e.target.value))
                }))}
              />
            </div>
            <div className="input-group">
              <label>Volatility:</label>
              <input 
                type="number" 
                step="0.01" 
                min="0" 
                defaultValue="0.0886"
                onChange={(e) => setManualParams(prev => ({
                  ...prev,
                  volatility: Math.max(0, Number(e.target.value))
                }))}
              />
            </div>
            <div className="input-group">
              <label>Mean Gas Price (Gwei):</label>
              <input 
                type="number" 
                step="1" 
                min="0" 
                defaultValue="22"
                onChange={(e) => setManualParams(prev => ({
                  ...prev,
                  meanGasPrice: Math.max(0, Number(e.target.value))
                }))}
              />
            </div>
            <div className="manual-entry-actions">
              <button 
                className="param-btn apply-btn"
                onClick={applyManualParams}
              >
                Apply Parameters
              </button>
            </div>
            <p className="parameter-disclaimer">
            Note: These prefilled values are based on the "Gas Fees on the Ethereum Blockchain: From Foundations to Derivatives Valuations" research by Meister and Prince from June 2024 and were estimated over the last ~1M blocks at the time of publication. They may not reflect current market conditions.            </p>
          </div>
        )}

        {showCalculatedParams && (
          <div className="calculated-params">
            <h3>Historical Data Settings</h3>
            <div className="historical-blocks-slider">
              <label>Number of Historical Blocks:</label>
              <input 
                type="range" 
                min="1000" 
                max="10000"
                step="100"
                value={historicalBlocks}
                onChange={(e) => setHistoricalBlocks(parseInt(e.target.value))}
                disabled={isDownloading}
              />
              <p>{historicalBlocks.toLocaleString()} blocks</p>
            </div>

            <div className="data-buttons">
              <button 
                className="param-btn"
                onClick={handleFetchData}
                disabled={isDownloading}
              >
                Fetch Gas Data
              </button>
              <button
                className="param-btn"
                onClick={handleLoadFromStorage}
                disabled={!hasLocalData || isDownloading}
              >
                Load From Storage
              </button>
              <label className="param-btn">
                Load CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer'
                  }}
                />
              </label>
              <button 
                className="param-btn"
                disabled={!isDataReady}
                onClick={calculateParameters}
              >
                Calculate Parameters
              </button>
              <button
                className="param-btn"
                disabled={!gasData.length}
                onClick={handleSaveToStorage}
              >
                Save Data
              </button>
            </div>

            {isDownloading && (
              <div className="progress-bar-container">
                <p className="progress-message">
                  Downloading blocks: {Math.floor((historicalBlocks * downloadProgress) / 100).toLocaleString()} of {historicalBlocks.toLocaleString()} 
                  ({Math.round(downloadProgress)}%)
                </p>
                <div className="progress-bar-wrapper">
                  <div 
                    className="progress-bar"
                    style={{ width: `${downloadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="parameters-display">
              <h3>Calculated Parameters:</h3>
              <p>Hurst Exponent: {calculatedParams ? calculatedParams.raw.hurstExponent.toFixed(4) : '--'}</p>
              <p>Mean Reversion Speed: {calculatedParams ? calculatedParams.raw.meanReversionSpeed.toFixed(4) : '--'}</p>
              <p>Volatility: {calculatedParams ? calculatedParams.raw.volatility.toFixed(4) : '--'}</p>
              <p>Mean Gas: {calculatedParams ? `${(calculatedParams.raw.meanGasPrice).toFixed(2)} Gwei` : '--'}</p>
            </div>

          </div>
        )}

        <div className="duration-slider">
          <label>Contract Duration:</label>
          <input 
            type="range" 
            min="1000"
            step="100"
            max={maxBlocks}
            value={blockDuration}
            onChange={(e) => setBlockDuration(parseInt(e.target.value))}
          />
          <p>{calculateTimeFromBlocks(blockDuration)}</p>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label>Maximum Gas Price Coverage (Gwei):</label>
            <input
              type="number"
              step="5"
              value={maxGasPrice}
              onChange={(e) => setMaxGasPrice(Math.max(30, Number(e.target.value)))}
              className="parameter-input"
            />
            <small className="input-note">
              Maximum gas price you're willing to cover
            </small>
          </div>

          <div className="input-group">
            <label>Minimum Premium Required (ETH):</label>
            <input
              type="number"
              step="0.00001"
              value={minPremium}
              onChange={(e) => setMinPremium(Math.max(0, Number(e.target.value)))}
              className="parameter-input"
            />
            <small className="input-note">
              Minimum premium you require
            </small>
          </div>

          <div className="input-group">
            <label>Amount of ETH you want to deposit:</label>
            <input
              type="number"
              value={collateral}
              onChange={(e) => setCollateral(Math.max(0, Number(e.target.value)))}
              className="parameter-input"
            />
            <small className="input-note">
              Amount of ETH to deposit as collateral
            </small>
          </div>
        </div>

        <button 
          className="param-btn write-option-btn"
          onClick={handleWriteOption}
          disabled={!isDataReady || !calculatedParams}
          style={{
            width: '100%',
            marginTop: '2rem',
            backgroundColor: '#4CAF50',
            color: 'white',
            position: 'relative',
            padding: '1rem'
          }}
        >
          Write New Option
          <small 
            className="gas-cost-note"
            style={{
              display: 'block',
              fontSize: '0.8rem',
              marginTop: '0.5rem',
              color: 'rgba(255, 255, 255, 0.8)'
            }}
          >
            This action is gas intensive and would cost around 0.5-1$
          </small>
        </button>

        {/* Option Preview Section */}
        <div className="option-preview">
          <h3 className="preview-title">Option Preview</h3>
          <div className="preview-container">
            <div className="preview-inputs">
              <div className="input-group">
                <label>Number of Contracts:</label>
                <input
                  type="range"
                  min="1"
                  max="300"
                  value={numContracts}
                  onChange={(e) => setNumContracts(Math.max(1, Number(e.target.value)))}
                />
                <span>{numContracts} contracts ({(numContracts * CONTRACT_SIZE).toLocaleString()} gas units)</span>
                <small className="input-note">
                  1 contract = 100,000 gas units. Maximum block gas is 30M, allowing up to 300 contracts.
                </small>
              </div>

              <div className="input-group">
                <label>Current Gas Price (Gwei):</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={currentGasPrice}
                  onChange={(e) => setCurrentGasPrice(Math.max(1, Number(e.target.value)))}
                />
                <small className="input-note">
                  Gas price at the time of writing the option
                </small>
              </div>

              <div className="input-group">
                <label>Strike Price (Gwei):</label>
                <input
                  type="number"
                  min="10"
                  step="5"
                  value={strikePrice}
                  onChange={(e) => setStrikePrice(Math.max(1, Number(e.target.value)))}
                />
              </div>

              <div className="input-group">
                <label>Future Gas Price (Gwei):</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={futureGasPrice}
                  onChange={(e) => setFutureGasPrice(Math.max(1, Number(e.target.value)))}
                />
                <small className="input-note">
                  Simulated gas price at expiration (for P/L calculation)
                </small>
              </div>

              <div className="input-group">
                <label>Duration: {optionDuration} blocks (≈{Math.round(optionDuration * 14 / 60)} minutes)</label>
                <input
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={optionDuration}
                  onChange={(e) => setOptionDuration(Number(e.target.value))}
                  className="duration-slider"
                />
              </div>
            </div>

            <div className="preview-summary">
              <h4>Option Summary</h4>
              {calculatedParams && (() => {
                const metrics = calculateOptionMetrics(
                  numContracts,
                  strikePrice,
                  optionDuration,
                  currentGasPrice,  // Use current price for premium calculation
                  calculatedParams
                );
                
                // Calculate P/L based on future price
                const profitLoss = (
                  (Math.max(futureGasPrice - strikePrice, 0) * metrics.totalGasUnits / 1e9) - 
                  metrics.premium
                );
                
                return (
                  <>
                    <div className="option-details">
                      <h5>Option Details</h5>
                      <div className="summary-item">
                        <span>Type:</span>
                        <span>Gas Price Call Option</span>
                      </div>
                      <div className="summary-item">
                        <span>Contracts:</span>
                        <span>{numContracts} ({(numContracts * CONTRACT_SIZE).toLocaleString()} gas units)</span>
                      </div>
                      <div className="summary-item">
                        <span>Current Gas Price:</span>
                        <span>{currentGasPrice} Gwei</span>
                      </div>
                      <div className="summary-item">
                        <span>Strike Price:</span>
                        <span>{strikePrice} Gwei</span>
                      </div>
                      <div className="summary-item">
                        <span>Duration:</span>
                        <span>{optionDuration} blocks (≈{Math.round(optionDuration * 14 / 60)} minutes)</span>
                      </div>
                    </div>

                    <div className="value-breakdown">
                      <h5>Option Premium</h5>
                      <div className="summary-item">
                        <span>Intrinsic Value:</span>
                        <span>{metrics.intrinsicValue.toFixed(4)} ETH</span>
                      </div>
                      <div className="summary-item">
                        <span>Time Value:</span>
                        <span>{(metrics.premium - metrics.intrinsicValue).toFixed(4)} ETH</span>
                      </div>
                      <div className="summary-item highlight">
                        <span>Total Premium:</span>
                        <span>
                          {metrics.premium.toFixed(4)} ETH 
                          <span className="usd-value">
                            (${(metrics.premium * ETH_PRICE_USD).toFixed(2)})
                          </span>
                        </span>
                      </div>
                      <div className="summary-item">
                        <span>Premium per Gas Unit:</span>
                        <span>{(metrics.premium / metrics.totalGasUnits * 1e9).toFixed(2)} Gwei</span>
                      </div>
                    </div>

                    <div className="profit-simulation">
                      <h5>Profit Simulation</h5>
                      <div className="summary-item">
                        <span>Future Gas Price:</span>
                        <span>{futureGasPrice} Gwei</span>
                      </div>
                      <div className="summary-item">
                        <span>Break-even Price:</span>
                        <span>{metrics.breakEvenPrice.toFixed(2)} Gwei</span>
                      </div>
                      <div className="summary-item highlight">
                        <span>Simulated P/L:</span>
                        <span className={profitLoss >= 0 ? "in-money" : "out-money"}>
                          {profitLoss.toFixed(4)} ETH
                          <span className="usd-value">
                            (${(profitLoss * ETH_PRICE_USD).toFixed(2)})
                          </span>
                        </span>
                      </div>
                      <div className="moneyness-indicator">
                        <span>Status at Expiry:</span>
                        <span className={futureGasPrice > strikePrice ? "in-money" : "out-money"}>
                          {futureGasPrice > strikePrice ? "In the Money" : "Out of the Money"}
                          {" "}
                          ({Math.abs(futureGasPrice - strikePrice).toFixed(2)} Gwei {futureGasPrice > strikePrice ? "above" : "below"} strike)
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WriteOption; 
