import React, { useState, useEffect } from 'react';
import contractsInfo from '../contracts/contracts.json';
import optionABI from '../contracts/optionABI.json';
import { ethers } from 'ethers';
import './BuyOption.css';
import OptionCard from './OptionCard';

function BuyOption({ provider }) {
  const [options, setOptions] = useState([]);

  

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const signer = await provider.getSigner();
        
        const optionFactory = new ethers.Contract(
          contractsInfo.OptionFactory.address,
          contractsInfo.OptionFactory.abi,
          signer 
        );
        
        const optionsList = await optionFactory.getAllOptions();
        setOptions(optionsList);
      } catch (error) {
        console.error("Error loading options:", error);
      }
    };

    if (provider) {
      loadOptions();
    }
  }, [provider]);

  return (
    <div className="buy-option">
      <h1>Available Options</h1>
      <div className="options-list">
        <p>Total number of available options: {options.length}</p>
        {options && options.map((optionAddress, index) => (
          <OptionCard
            key={optionAddress}
            optionAddress={optionAddress}
            index={index}
            provider={provider}
          />
        ))}
      </div>
    </div>
  );
}

export default BuyOption; 