import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import optionABI from '../contracts/optionABI.json';
import GasOptionPricing from '../contracts/contracts.json';

function OptionCard({ optionAddress, index, provider }) {
  const [optionDetails, setOptionDetails] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [purchaseDetails, setPurchaseDetails] = useState({
    strikePrice: 20,
    numContracts: 1,
    duration: 50,
  });
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    getOptionDetails();
  }, [optionAddress]);

  const getOptionDetails = async () => {
    setIsLoading(true);
    try {
      const signer = await provider.getSigner();
      const optionContract = new ethers.Contract(
        optionAddress,
        optionABI.GasOption.abi,
        signer
      );

      const params = await optionContract.parameters();
      const availableUntilBlock = await optionContract.availableUntilBlock();
      const balance = await provider.getBalance(optionAddress);

      setOptionDetails({
        hurstExponent: params.hurstExponent,
        meanReversionSpeed: params.meanReversionSpeed,
        volatility: params.volatility,
        meanGasPrice: params.meanGasPrice,
        minPremium: params.minPremium,
        maxGasPrice: params.maxPrice,
        availableUntilBlock: availableUntilBlock,
        balance: balance
      });
    } catch (error) {
      console.error("Error fetching option details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePrice = async () => {
    try {
      const signer = await provider.getSigner();
      const optionContract = new ethers.Contract(
        optionAddress,
        optionABI.GasOption.abi,
        signer
      );

      console.log("Quoting for strike price:", purchaseDetails.strikePrice, "duration:", purchaseDetails.duration, "numContracts:", purchaseDetails.numContracts);


      const price = await optionContract.calculatePremium(
        ethers.parseUnits(purchaseDetails.strikePrice.toString(), 'gwei'), 
        purchaseDetails.duration,
        purchaseDetails.numContracts
      );

      console.log("Premium:", ethers.formatEther(price));

      setQuote(ethers.formatEther(price));
    } catch (error) {
      console.error("Error calculating price:", error);
    }
  };

  const handleBuyOption = async () => {
    try {
        const signer = await provider.getSigner();
        const optionContract = new ethers.Contract(
          optionAddress,
          optionABI.GasOption.abi,
          signer
        );
    
  
        const tx = await optionContract.buyOption(
          ethers.parseUnits(purchaseDetails.strikePrice.toString(), 'gwei'), 
          purchaseDetails.duration,
          purchaseDetails.numContracts,
          {
            value: ethers.parseEther(quote)
          }
        );

        await tx.wait();
  
        console.log("Transaction:",tx);
  
      } catch (error) {
        console.error("Error calculating price:", error);
      } finally {
        alert("You've bought the option for " + quote + " ETH, it will expire in " + purchaseDetails.duration + " blocks. You can view your options in the My Options section.");
      }
    console.log("Buying option:", optionAddress);
  };



  return (
    <div className="option-card">
      {isLoading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading option details...</p>
        </div>
      ) : (
        <>
          <div className="card-header">
            <span>Option #{index + 1} | {optionAddress.slice(0, 8)}...{optionAddress.slice(-6)}</span>
            {optionDetails.balance?.toString() === '0' && <span className="inactive-label">Inactive</span>}
          </div>


          {optionDetails.balance?.toString() !== '0' && (<div className="card-content">
            <div className="parameters-section">
                <p><small>Available Until Block: {ethers.formatUnits(optionDetails.availableUntilBlock || 0, 0)}</small></p>
                <ul>
                    <li>Hurst: {ethers.formatUnits(optionDetails.hurstExponent || 0, 18)}</li>
                    <li>Mean Rev: {ethers.formatUnits(optionDetails.meanReversionSpeed || 0, 18)}</li>
                    <li>Vol: {ethers.formatUnits(optionDetails.volatility || 0, 18)}</li>
                    <li>Mean Gas: {ethers.formatUnits(optionDetails.meanGasPrice || 0, 9)} Gwei</li>
                    <li>Max Gas: {ethers.formatUnits(optionDetails.maxGasPrice || 0, 9)} Gwei</li>
                    <li>Min Premium: {ethers.formatUnits(optionDetails.minPremium || 0, 18)} ETH</li>
                    <li>Balance: {ethers.formatUnits(optionDetails.balance || 0, 18)} ETH</li>
                </ul>
            </div>

            <div className="purchase-controls">
                <div className="input-group">
                <label>Strike Price (Gwei):</label>
                <input
                type="number"
                value={purchaseDetails.strikePrice}
                onChange={(e) => setPurchaseDetails({
                    ...purchaseDetails,
                    strikePrice: e.target.value
                })}
                />
            </div>

            <div className="sliders-section">
                <div className="slider-quadrant">
                    <div className="slider-top">
                        <input
                            type="range"
                            min="1"
                            max="300"
                            value={purchaseDetails.numContracts}
                            onChange={(e) => setPurchaseDetails({
                                ...purchaseDetails,
                                numContracts: parseInt(e.target.value)
                            })}
                        />
                    </div>
                    <div className="slider-bottom">
                        <span>Contracts: {purchaseDetails.numContracts}</span>
                    </div>
                </div>

                <div className="slider-quadrant">
                    <div className="slider-top">
                        <input
                            type="range"
                            min="10"
                            max="1000"
                            value={purchaseDetails.duration}
                            onChange={(e) => setPurchaseDetails({
                                ...purchaseDetails,
                                duration: parseInt(e.target.value)
                            })}
                        />
                    </div>
                    <div className="slider-bottom">
                        <span>Duration:</span>
                        <input
                            type="number"
                            min="10"
                            max="1000"
                            value={purchaseDetails.duration}
                            onChange={(e) => setPurchaseDetails({
                                ...purchaseDetails,
                                duration: Math.min(Math.max(parseInt(e.target.value) || 1, 1), 1000)
                            })}
                            style={{ width: '60px', padding: '0.25rem', margin: '0 0.5rem' }}
                        />
                        <span>blocks</span>
                    </div>
                </div>
            </div>

            <div className="purchase-section">
                <p>
                    Quote: {quote ? (
                        <>
                            {quote} ETH <span style={{color: 'grey'}}>
                                (${(parseFloat(quote) * 3500).toFixed(2)})
                            </span>
                        </>
                    ) : 'Not quoted yet'}
                </p>
                <div className="button-group">
                    <button 
                        className="quote-button"
                        onClick={() => calculatePrice()}
                    >
                        Get Quote
                    </button>
                    <button 
                        className="buy-button"
                        disabled={!quote}
                        onClick={() => handleBuyOption()}

                    >
                        Buy Option
                    </button>
                </div>
            </div>
            
        </div>
        </div>)}
        </>
      )}
    </div>
  );
}

export default OptionCard;
