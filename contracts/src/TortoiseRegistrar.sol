// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IL2Registry} from "./IL2Registry.sol";

/// @title TortoiseRegistrar
/// @notice An onlyOwner Durin registrar for minting song subnames under tortmusic.eth.
/// @dev    Durin's example L2Registrar.register() has NO access control (anyone can mint any
///         name) — we deliberately do not ship that. Here only the owner (the admin CLI key)
///         can mint. One song subname per opted-in song: <slug>.tortmusic.eth. (plan §4, D5)
///
///         Records are pre-encoded by the caller (the admin CLI builds setText/setAddr calldata
///         with viem) and passed straight through to createSubnode, which runs them atomically
///         against the new node. Keeping the registrar selector-agnostic avoids coupling to the
///         resolver's exact ABI here.
contract TortoiseRegistrar is Ownable {
    IL2Registry public immutable registry;

    event SongNameRegistered(string label, address indexed owner, bytes32 indexed node);

    error LabelUnavailable(string label);

    constructor(IL2Registry registry_, address owner_) Ownable(owner_) {
        registry = registry_;
    }

    /// @notice Mint `label`.tortmusic.eth to `owner` with `records` (pre-encoded resolver setters).
    /// @param label   the subname label (song slug). Durin requires 3+ chars.
    /// @param owner   the subname owner (typically the artist, or the admin for a demo).
    /// @param records ABI-encoded calls to the registry's resolver (setText/setAddr) for the new node.
    /// @return node   the namehash of the minted subname.
    function register(string calldata label, address owner, bytes[] calldata records)
        external
        onlyOwner
        returns (bytes32 node)
    {
        if (!registry.available(label)) revert LabelUnavailable(label);
        node = registry.createSubnode(registry.baseNode(), label, owner, records);
        emit SongNameRegistered(label, owner, node);
    }

    /// @notice Helper to compute the node for a label (off-chain convenience / tests).
    function nodeFor(string calldata label) external view returns (bytes32) {
        return registry.makeNode(registry.baseNode(), label);
    }
}
