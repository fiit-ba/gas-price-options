import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './PositionCard.css';
import optionABI from '../contracts/optionABI.json';

function PositionCard({ position, provider, optionAddress }) {
    const [currentBlock, setCurrentBlock] = useState(0);
    const [blocksRemaining, setBlocksRemaining] = useState(0);

    useEffect(() => {
        const updateBlockInfo = async () => {
            //console.log("latestL1Block", currentBlock);
            setBlocksRemaining(Number(position.expirationBlock) - currentBlock);
        };

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
            
                setCurrentBlock(latestBlock);
                return latestBlock;
            } catch (error) {
                console.error("Error fetching latest block:", error);
                return 0;
            }
        }

        getLatestL1Block();
        updateBlockInfo();
        const interval = setInterval(getLatestL1Block, 14000);
        return () => clearInterval(interval);

    }, [currentBlock, provider]);


    const handleClearOption = async () => {
      try {
          const signer = await provider.getSigner();
          const optionContract = new ethers.Contract(
            optionAddress,
            optionABI.GasOption.abi,
            signer
          );
        
    
          const tx = await optionContract.clearOption();
  
          await tx.wait();
    
          console.log("Transaction:",tx);
    
        } catch (error) {
          console.error("Error calculating price:", error);
        }
    };
    //console.log(position)

  return (
    <div className="position-card">
      <div className="position-header">
        <h4>Position Details</h4>
        <span className="position-address">{`${position.address.slice(0, 6)}...${position.address.slice(-4)}`}</span>
      </div>

      <div className="position-details">
        <div className="detail-row">
          <span className="detail-label">Strike Price:</span>
          <span className="detail-value">{ethers.formatUnits(position.strikePrice, 9)} Gwei</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Premium Paid:</span>
          <span className="detail-value">{ethers.formatEther(position.premium)} ETH</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Expiration Block:</span>
          <span className="detail-value">{position.expirationBlock.toString()}</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Blocks Remaining:</span>
          <span className="detail-value">{blocksRemaining.toString()}</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Status:</span>
          <span className={`status-badge ${position.isSettled ? 'settled' : blocksRemaining < 0 ? 'expired' : 'active'}`}>
            {position.isSettled ? 'Settled' : blocksRemaining < 0 ? 'Expired without settlement' : 'Active'}
          </span>
        </div>
      </div>

      {position.isActive && !position.isSettled && (
        <div className="position-actions">
          <button className="action-button settle-button">
            Settle Position
          </button>
          <button 
            className="action-button settle-button"
            onClick={() => handleClearOption()}
          >
            Clear Expired Position
          </button>
        </div>
      )}
    </div>
  );
}

export default PositionCard; 