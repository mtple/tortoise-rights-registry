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

    error AlreadyMinted();

    function createSubnode(bytes32 node, string calldata label, address owner, bytes[] calldata data)
        external
        returns (bytes32 sub)
    {
        // Durin's subname is an ERC-721 — a duplicate label can't be minted twice.
        if (taken[label]) revert AlreadyMinted();
        sub = makeNode(node, label);
        owners[sub] = owner;
        taken[label] = true;
        lastDataLen = data.length;
        // Execute the encoded resolver setters against this contract (mimics the registry/resolver).
        // Replicate Durin/ENS Multicallable: every record's embedded node (calldata[4:36]) MUST equal
        // the subnode, else revert. This catches records encoded for the wrong node.
        for (uint256 i; i < data.length; i++) {
            bytes calldata d = data[i];
            require(d.length >= 36 && bytes32(d[4:36]) == sub, "NODE_MISMATCH");
            (bool ok,) = address(this).call(d);
            require(ok, "RECORD_CALL_FAILED");
        }
    }

    /// @dev Matches ENS TextResolver.setText signature so encoded data[] calls land here.
    function setText(bytes32 node, string calldata key, string calldata value) external {
        texts[node][key] = value;
    }
}
