import React from 'react';
import { ethers } from 'ethers';
import './WrittenOptionCard.css';
import optionABI from '../contracts/optionABI.json';


function WrittenOptionCard({ address, option, provider, latestL1Block }) {
    //console.log("latestL1Block", latestL1Block);
  const handleExtend = () => {
    // TODO: Implement extend functionality
    alert("TODO: Implement a modal window or something for extending availability");


    console.log("Extend option:", address);
  };

  const handleEditParams = async () => {
    const signer = await provider.getSigner();
    const optionContract = new ethers.Contract(
    address,
    optionABI.GasOption.abi,
    signer
    );

    try {
        const contractWithSigner = optionContract.connect(signer);

        console.log("Withdrawing option:", address);
    } catch (error) {
        console.error("Error withdrawing option:", error);
    }
    console.log("Edit params for option:", address);
  };

  const handleWithdraw = async () => {
    const signer = await provider.getSigner();
    const optionContract = new ethers.Contract(
    address,
    optionABI.GasOption.abi,
    signer
    );

    try {
      const contractWithSigner = optionContract.connect(signer);

    const tx = await contractWithSigner.withdrawForce();
      await tx.wait();
      console.log("Withdrawing option:", address);
    } catch (error) {
      console.error("Error withdrawing option:", error);
    }
  };

  return (
    <div className="written-option-card">
      <div className="option-header">
        <div className="title-row">
          <h4>Option Details {option.balance.toString() === '0' && <span className="inactive-label">Inactive</span>}</h4>
        </div>
        <span className="option-address">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
      </div>
      
      <div className="option-params">
        <div className="param-row">
          <span className="param-label">Hurst Exponent:</span>
          <span className="param-value">{ethers.formatUnits(option.hurstExponent, 18)}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Mean Reversion Speed:</span>
          <span className="param-value">{ethers.formatUnits(option.meanReversionSpeed, 18)}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Volatility:</span>
          <span className="param-value">{ethers.formatUnits(option.volatility, 18)}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Mean Gas Price:</span>
          <span className="param-value">{ethers.formatUnits(option.meanGasPrice, 9)} Gwei</span>
        </div>
        <div className="param-row">
          <span className="param-label">Min Premium:</span>
          <span className="param-value">{ethers.formatEther(option.minPremium)} ETH</span>
        </div>
        <div className="param-row">
          <span className="param-label">Max Gas Price:</span>
          <span className="param-value">{ethers.formatUnits(option.maxGasPrice, 9)} Gwei</span>
        </div>
        <div className="param-row">
          <span className="param-label">Available Until Block:</span>
          <span className="param-value">{option.availableUntilBlock.toString()}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Available for:</span>
          <span className="param-value">{(Number(option.availableUntilBlock) - latestL1Block).toString()} blocks</span>
        </div>
        <div className="param-row">
          <span className="param-label">Balance:</span>
          <span className="param-value">{ethers.formatEther(option.balance)} ETH</span>
        </div>
        
      </div>

      <div className="option-actions">
        <button 
          className="action-button extend-button"
          onClick={handleExtend}
        >
          Extend
        </button>
        <button 
          className="action-button edit-button"
          onClick={handleEditParams}
        >
          Edit Parameters
        </button>
        <button 
          className="action-button withdraw-button"
          onClick={handleWithdraw}
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}

export default WrittenOptionCard; 