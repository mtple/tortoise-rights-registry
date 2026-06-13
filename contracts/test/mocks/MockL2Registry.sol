// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IL2Registry} from "../../src/IL2Registry.sol";

/// @dev Minimal stand-in for the Durin L2Registry. Records createSubnode calls and executes the
///      pre-encoded resolver `data` against itself so tests can assert records were applied.
contract MockL2Registry is IL2Registry {
    bytes32 public constant BASE_NODE = keccak256("tortmusic.eth");

    mapping(bytes32 => address) public owners;
    mapping(string => bool) public taken;
    // node => key => value, populated by the multicall data in createSubnode.
    mapping(bytes32 => mapping(string => string)) public texts;

    uint256 public lastDataLen;

    function baseNode() external pure returns (bytes32) {
        return BASE_NODE;
    }

    function makeNode(bytes32 node, string calldata label) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(node, keccak256(bytes(label))));
    }

    function available(string calldata label) external view returns (bool) {
        return bytes(label).length >= 3 && !taken[label];
    }

    function createSubnode(bytes32 node, string calldata label, address owner, bytes[] calldata data)
        external
        returns (bytes32 sub)
    {
        sub = makeNode(node, label);
        owners[sub] = owner;
        taken[label] = true;
        lastDataLen = data.length;
        // Execute the encoded resolver setters against this contract (mimics the registry/resolver).
        for (uint256 i; i < data.length; i++) {
            (bool ok,) = address(this).call(data[i]);
            require(ok, "RECORD_CALL_FAILED");
        }
    }

    /// @dev Matches ENS TextResolver.setText signature so encoded data[] calls land here.
    function setText(bytes32 node, string calldata key, string calldata value) external {
        texts[node][key] = value;
    }
}
