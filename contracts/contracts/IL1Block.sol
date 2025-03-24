// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IL1Block {
    function baseFeeScalar() external view returns (uint32);
    function blobBaseFeeScalar() external view returns (uint32);
    function sequenceNumber() external view returns (uint64);
    function timestamp() external view returns (uint64);
    function number() external view returns (uint64);
    function basefee() external view returns (uint256);
    function blobBaseFee() external view returns (uint256);
    function hash() external view returns (bytes32);
    function batcherHash() external view returns (bytes32);
} 