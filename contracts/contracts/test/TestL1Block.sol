// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../IL1Block.sol";

contract TestL1Block {
    address constant L1_BLOCK_ADDRESS = 0x4200000000000000000000000000000000000015;
    IL1Block private immutable l1Block;
    
    // Store some L1 info for demonstration
    uint64 public lastCheckedL1Block;
    
    event L1InfoUpdated(uint64 blockNumber);
    
    constructor() {
        l1Block = IL1Block(L1_BLOCK_ADDRESS);
    }
    
    function updateL1Info() external {
        lastCheckedL1Block = l1Block.number();
        emit L1InfoUpdated(lastCheckedL1Block);
    }

    function getL1BlockNumber() external view returns (uint64) {
        return l1Block.number();
    }

    function getL1Basefee() external view returns (uint256) {
        return l1Block.basefee();
    }

    function getL1BlobBasefee() external view returns (uint256) {
        return l1Block.blobBaseFee();
    }
}
