// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./GasOption.sol";
import "./IL1Block.sol";



// Factory Contract
contract OptionFactory {

    // L1Block predeploy on Optimism address and object
    address constant L1_BLOCK_ADDRESS = 0x4200000000000000000000000000000000000015;
    IL1Block private immutable l1Block;

    constructor() {
        l1Block = IL1Block(L1_BLOCK_ADDRESS);
    }

    // Array to store all created options
    address[] public allOptions;
    
    mapping(address => bool) public isOptionContract;
    mapping(address => bool) public isActiveOption;

    
    event OptionCreated(address indexed optionContract, address indexed writer);

    function createOption(
        uint256 hurstExponent,
        uint256 meanReversionSpeed,
        uint256 volatility,
        uint256 meanGasPrice,
        uint256 minPremium,
        uint256 maxPrice,
        uint64 availableBlocks
    ) external payable returns (address) {
        require(msg.value > 0, "Must deposit collateral");
        require(availableBlocks > 0, "Must be available for some blocks");
        uint64 currentL1Block = l1Block.number();


        GasOption.OptionParameters memory params = GasOption.OptionParameters({
            hurstExponent: hurstExponent,
            meanReversionSpeed: meanReversionSpeed,
            volatility: volatility,
            meanGasPrice: meanGasPrice,
            minPremium: minPremium,
            maxPrice: maxPrice
        });

        GasOption option = new GasOption(
            msg.sender,
            currentL1Block + availableBlocks,
            params
        );
        
        isOptionContract[address(option)] = true;
        allOptions.push(address(option));
        
        // Transfer the collateral to the new option contract
        payable(address(option)).transfer(msg.value);
        
        emit OptionCreated(address(option), msg.sender);
        
        return address(option);
    }

    function isValidOption(address optionAddress) external view returns (bool) {
        return isOptionContract[optionAddress];
    }

        // New functions to manage options
    function getAllOptions() external view returns (address[] memory) {
        return allOptions;
    }

}
