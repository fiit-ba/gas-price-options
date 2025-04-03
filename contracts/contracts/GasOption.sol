// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./GasOptionPricing.sol";
import "./IL1Block.sol";

// Individual Option Contracts
contract GasOption is ReentrancyGuard {
    using GasOptionPricing for *;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;

    // L1Block predeploy on Optimism address and object
    address constant L1_BLOCK_ADDRESS = 0x4200000000000000000000000000000000000015;
    IL1Block private immutable l1Block;

    struct OptionParameters {
        uint256 hurstExponent;     // Scaled by 1e18
        uint256 meanReversionSpeed; // Scaled by 1e18
        uint256 volatility;        // Scaled by 1e18
        uint256 meanGasPrice;      // In wei
        uint256 minPremium;        // In wei
        uint256 maxPrice;          // In wei
    }

    struct OptionPosition {
        uint256 contractsAmount;
        uint256 strikePrice;
        uint256 expirationBlock;
        uint256 premium;
        bool isSettled;
        bool isActive;
    }

    struct ExpiringPosition {
        address holder;
        uint256 expirationBlock;
    }

    address public immutable factory;
    address public immutable writer;
    uint256 public availableUntilBlock;
    OptionParameters public parameters;
    
    mapping(address => OptionPosition) public positions;

    uint256 private firstToExpire;
    EnumerableSet.UintSet private expiryBlocks;
    mapping(uint256 => EnumerableSet.AddressSet) private expiryToAddresses;

    uint256 public constant KEEPER_FEE_PERCENTAGE = 10; // 10% keeper fee

    event OptionBought(address buyer, uint currentGasPrice, uint256 strikePrice, uint256 expirationBlock);
    event OptionSettled(address settler, uint256 settlementAmount);
    event OptionExtended(uint256 newAvailableUntilBlock);

    constructor(
        address _writer,
        uint256 _availableUntilBlock,
        OptionParameters memory _parameters
    ) {
        factory = msg.sender;
        writer = _writer;
        l1Block = IL1Block(L1_BLOCK_ADDRESS);
        availableUntilBlock = _availableUntilBlock;
        parameters = _parameters;
    }

    receive() external payable {
        require(msg.sender == factory || msg.sender == writer, "Not factory or writer");
    }

    function withdrawForce() external {
        require(msg.sender == writer, "Not writer");
        
        payable(writer).transfer(address(this).balance);
    }

    function buyOption(
        uint256 strikePrice,
        uint256 duration,
        uint256 amountOfContracts
    ) external payable nonReentrant {
        uint256 currentGasPrice = l1Block.basefee();
        uint256 currentL1Block = l1Block.number();
        uint256 expirationBlock = currentL1Block + duration;

        require(!positions[msg.sender].isActive, "Already has Position");
        require(currentL1Block+duration+1 < availableUntilBlock, "Option not available");

        uint256 premium = calculatePremium(strikePrice, duration, amountOfContracts);
        require(msg.value >= premium, "Insufficient premium");

        positions[msg.sender] = OptionPosition({
            contractsAmount: amountOfContracts,
            strikePrice: strikePrice,
            expirationBlock: expirationBlock,
            premium: premium,
            isSettled: false,
            isActive: true
        });
        
        expiryBlocks.add(expirationBlock);
        expiryToAddresses[expirationBlock].add(msg.sender);
        if (firstToExpire == 0 || expirationBlock < firstToExpire) {
            firstToExpire = expirationBlock;
        }
        
        emit OptionBought(msg.sender, currentGasPrice, strikePrice, currentL1Block+duration);
        
        if (msg.value > premium) {
            payable(msg.sender).transfer(msg.value - premium);
        }
    }

    function settleOption() external nonReentrant {
        OptionPosition storage position = positions[msg.sender];
        require(position.isActive, "No active position");
        require(!position.isSettled, "Settled");

        uint256 currentGasPrice = l1Block.basefee();
        uint256 currentL1Block = l1Block.number();


        require(currentL1Block >= position.expirationBlock, "Not expired");
        require(currentL1Block <= position.expirationBlock + 1, "Passed");

        uint256 settlementAmount = GasOptionPricing.calculateSettlement(
            position.strikePrice,
            currentGasPrice
        );

        settlementAmount = settlementAmount * 1e5 * position.contractsAmount;

        position.isSettled = true;
        position.isActive = false;
        
        _removeExpiringPosition(msg.sender);
        
        if (settlementAmount > 0) {
            require(settlementAmount <= address(this).balance, "Insufficient balance");
            payable(msg.sender).transfer(settlementAmount);
        }

        emit OptionSettled(msg.sender, settlementAmount);
    }

    function clearOption() external nonReentrant {
        OptionPosition storage position = positions[msg.sender];
        require(position.isActive, "No active position");
        require(!position.isSettled, "Settled");

        delete positions[msg.sender];
        
        _removeExpiringPosition(msg.sender);
    }

    function keeperSettle() external nonReentrant {
        uint256 currentL1Block = l1Block.number();
        uint256 currentL1Gas = l1Block.basefee();
        uint256 keeperTotalReward = 0;
        
        require(firstToExpire > 0 && firstToExpire == currentL1Block, "No expiry in this blocks");
        
        EnumerableSet.AddressSet storage addresses = expiryToAddresses[firstToExpire];
        uint256 addressCount = addresses.length();
        
        // Create a temporary array to store addresses to process
        address[] memory addressesToProcess = new address[](addressCount);
        for (uint256 i = 0; i < addressCount; i++) {
            addressesToProcess[i] = addresses.at(i);
        }
        
        // Process all addresses for current expiry block using the temporary array
        for (uint256 i = 0; i < addressesToProcess.length; i++) {
            address holder = addressesToProcess[i];
            OptionPosition storage position = positions[holder];
            
            if (position.isActive && !position.isSettled) {
                uint256 settlementAmount = GasOptionPricing.calculateSettlement(
                    position.strikePrice,
                    currentL1Gas
                );

                settlementAmount = settlementAmount * 1e5 * position.contractsAmount;

                // Update position state
                position.isSettled = true;
                position.isActive = false;
                _removeExpiringPosition(holder);
                
                if (settlementAmount > 0) {
                    require(settlementAmount <= address(this).balance, "Insufficient balance");
                    uint256 keeperFee = settlementAmount * KEEPER_FEE_PERCENTAGE / 100;
                    uint256 holderAmount = settlementAmount - keeperFee;
                    
                    keeperTotalReward += keeperFee;
                    payable(holder).transfer(holderAmount);
                }
                
                emit OptionSettled(holder, settlementAmount);
            }
        }
        
        // Clean up state after processing all positions
        expiryBlocks.remove(firstToExpire);
        firstToExpire = expiryBlocks.length() > 0 ? expiryBlocks.at(0) : 0;
        
        // Transfer accumulated keeper reward
        if (keeperTotalReward > 0) {
            payable(msg.sender).transfer(keeperTotalReward);
        }
    }

    function extend(uint256 additionalBlocks) external {
        require(msg.sender == writer, "Not writer");
        
        uint256 currentL1Block = l1Block.number();
        require(currentL1Block >= availableUntilBlock, "Still available");
        require(expiryBlocks.length() == 0, "Active positions exist");
        
        availableUntilBlock = currentL1Block + additionalBlocks;
        emit OptionExtended(availableUntilBlock);
    }

    function updateParameters(OptionParameters calldata newParams, uint256 newAvailableUntilBlock) external {
        require(msg.sender == writer, "Not writer");

        uint256 currentL1Block = l1Block.number();
        require(currentL1Block >= availableUntilBlock, "Still available");
        require(expiryBlocks.length() == 0, "Active positions exist");

        parameters = newParams;
        availableUntilBlock = newAvailableUntilBlock;
    }

    // Internal functions
    function calculatePremium(
        uint256 strikePrice,
        uint256 duration,
        uint256 contractsAmount
    ) public view returns (uint256) {
        uint256 currentGasPrice = l1Block.basefee();

        GasOptionPricing.PricingParams memory params = GasOptionPricing.PricingParams({
            meanGasPrice: parameters.meanGasPrice,
            volatility: parameters.volatility,
            meanReversionSpeed: parameters.meanReversionSpeed,
            hurstExponent: parameters.hurstExponent,
            minPremium: parameters.minPremium,
            maxPrice: parameters.maxPrice
        });
        
        return contractsAmount * GasOptionPricing.calculatePremium(
            currentGasPrice,
            strikePrice,
            duration,
            params
        );
    }

    function _removeExpiringPosition(address holder) internal {
        // Get the expiry block from the position
        uint256 expiryBlock = positions[holder].expirationBlock;
        
        // Remove the holder from the expiry-to-addresses mapping
        expiryToAddresses[expiryBlock].remove(holder);
        
        // If no more addresses for this expiry, remove the expiry block
        if (expiryToAddresses[expiryBlock].length() == 0) {
            expiryBlocks.remove(expiryBlock);
            
            // Update firstToExpire if needed
            if (expiryBlock == firstToExpire) {
                firstToExpire = expiryBlocks.length() > 0 ? expiryBlocks.at(0) : 0;
            }
        }
    }
    
    function getFirstToExpire() external view returns (uint256) {
        return firstToExpire;
    }
}

