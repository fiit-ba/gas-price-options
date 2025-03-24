import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import optionABI from '../contracts/optionABI.json';
import contractsInfo from '../contracts/contracts.json';
import WrittenOptionCard from './WrittenOptionCard';
import PositionCard from './PositionCard';

function MyOptions({ provider, signer, contracts, account }) {
  const [writtenOptions, setWrittenOptions] = useState([]);
  const [boughtOptions, setBoughtOptions] = useState([]);
  const [latestL1Block, setLatestL1Block] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contracts.optionFactory && account) {
      fetchUserOptions();
      getLatestL1Block();
    }
  }, [contracts.optionFactory, account]);

  const getLatestL1Block = async () => {
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

      setLatestL1Block(latestBlock);
      return latestBlock;
  } catch (error) {
    console.error("Error fetching latest block:", error);
    return 0;
  }
}

  const fetchUserOptions = async () => {
    try {
      setLoading(true);
      // Clear both arrays at the start of fetching
      setBoughtOptions([]);
      setWrittenOptions([]);

      const signer = await provider.getSigner();
      const optionFactory = new ethers.Contract(
        contractsInfo.OptionFactory.address,
        contractsInfo.OptionFactory.abi,
        signer 
      );
      
      const optionAddresses = await optionFactory.getAllOptions();

      // Create temporary arrays to hold the new options
      const newWrittenOptions = [];
      const newBoughtOptions = [];

      for (const address of optionAddresses) {
        try {
          const signer = await provider.getSigner();
          const optionContract = new ethers.Contract(
            address,
            optionABI.GasOption.abi,
            signer
          );
      
          const params = await optionContract.parameters();
          const availableUntilBlock = await optionContract.availableUntilBlock();
          const writer = await optionContract.writer();
          const balance = await provider.getBalance(address);

          if (writer.toLowerCase() == account.toLowerCase()) {
            let optionDetails = {
              address: address,
              hurstExponent: params.hurstExponent,
              meanReversionSpeed: params.meanReversionSpeed,
              volatility: params.volatility,
              meanGasPrice: params.meanGasPrice,
              minPremium: params.minPremium,
              maxGasPrice: params.maxPrice,
              availableUntilBlock: availableUntilBlock,
              balance: balance,
            }
            newWrittenOptions.push(optionDetails);
          }

          const position = await optionContract.positions(account);
          if (position.isActive) {
            const positionDetails = {
              address: address,
              strikePrice: position.strikePrice,
              expirationBlock: position.expirationBlock,
              premium: position.premium,
              isSettled: position.isSettled,
              isActive: position.isActive
            }
            newBoughtOptions.push(positionDetails);
          }
          else {
            console.log("Position is not active");
            newBoughtOptions = []
          }

        } catch (error) {
          console.error("Error fetching option details:", error);
        }
      }

      console.log(newBoughtOptions)

      // Set state once with the complete arrays
      setWrittenOptions(newWrittenOptions);
      setBoughtOptions(newBoughtOptions);

    } catch (error) {
      console.error("Error fetching options:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return (
      <div className="my-options-container">
        <h2>My Options</h2>
        <p>Please connect your wallet to view your options.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-options-container">
        <h2>My Options</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="my-options-container">
      <h2>My Options</h2>
      
      
      <section className="bought-options">
        <h3>Bought Options</h3>
        {boughtOptions.length === 0 ? (
          <p>No bought options found</p>  
        ) : (
          <div className="options-list">
            {boughtOptions.map((option) => (
              option.isActive && (
                <PositionCard 
                  key={option.address}
                  position={option}
                  provider={provider}
                  optionAddress={option.address}
              />
            )))}
          </div>
        )}
      </section>

      <section className="written-options">
        <h3>Written Options</h3>
        {writtenOptions.length === 0 ? (
          <p>No written options found</p>
        ) : (
          <div className="options-list">
            {writtenOptions.map((option) => (
              <WrittenOptionCard 
                provider={provider}
                key={option.address}
                address={option.address}
                option={option}
                latestL1Block={latestL1Block}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

export default MyOptions; 