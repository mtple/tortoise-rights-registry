// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRightsRegistry} from "../../src/TortoiseRegistrar.sol";

/// @dev Minimal stand-in for TortoiseRightsRegistry — only `songs(key).artist` matters to the
///      registrar's registerByArtist gate. setArtist lets tests register a song's artist.
contract MockRights is IRightsRegistry {
    mapping(bytes32 => address) public artistOf;

    function setArtist(string calldata songId, address artist) external {
        artistOf[keccak256(bytes(songId))] = artist;
    }

    function songs(bytes32 songKey)
        external
        view
        returns (address, uint8, uint64, bool, uint96, bytes32, bytes32, bytes32, string memory, string memory)
    {
        return (artistOf[songKey], 0, 0, false, 0, bytes32(0), bytes32(0), bytes32(0), "", "");
    }
}
