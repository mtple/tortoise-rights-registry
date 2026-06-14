// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IL2Registry} from "./IL2Registry.sol";

/// @notice Minimal view into the rights registry: who registered a given song.
interface IRightsRegistry {
    function songs(bytes32 songKey)
        external
        view
        returns (
            address artist,
            uint8 permissionMode,
            uint64 consentTimestamp,
            bool licenseActive,
            uint96 priceUsdc,
            bytes32 manifestHash,
            bytes32 audioHash,
            bytes32 licenseTermsHash,
            string memory walrusManifestBlobId,
            string memory walrusAudioBlobId
        );
}

/// @title TortoiseRegistrar
/// @notice A Durin registrar for minting song subnames under tortmusic.eth. Two mint paths:
///         - register() — onlyOwner (admin CLI), can mint any label to any owner.
///         - registerByArtist() — the song's REGISTERED ARTIST mints THEIR OWN song's subname
///           (label derived from songId, owner = the artist). This keeps the web app keyless: the
///           artist's wallet sends the mint right after registerSong, no admin key on the server.
/// @dev    Durin's example registrar is fully open-mint (anyone, any name) — deliberately NOT used.
///         registerByArtist is the controlled equivalent: gated to msg.sender == songs[songId].artist,
///         and the label is forced to equal songId, so an artist can only name their own song.
contract TortoiseRegistrar is Ownable {
    IL2Registry public immutable registry;
    IRightsRegistry public immutable rights;

    event SongNameRegistered(string label, address indexed owner, bytes32 indexed node);

    error NotSongArtist();

    constructor(IL2Registry registry_, IRightsRegistry rights_, address owner_) Ownable(owner_) {
        registry = registry_;
        rights = rights_;
    }

    /// @notice Admin mint: `label`.tortmusic.eth to `owner` with pre-encoded resolver `records`.
    function register(string calldata label, address owner, bytes[] calldata records)
        external
        onlyOwner
        returns (bytes32 node)
    {
        node = registry.createSubnode(registry.baseNode(), label, owner, records);
        emit SongNameRegistered(label, owner, node);
    }

    /// @notice Artist mint: the registered artist of `songId` mints `songId`.tortmusic.eth to
    ///         themselves with pre-encoded `records`. Keeps the app keyless (artist sends the tx).
    /// @dev The label IS the songId, so the artist can only name their own song; gated to the
    ///      on-chain registered artist. createSubnode reverts on a duplicate (ERC-721), so no re-mint.
    function registerByArtist(string calldata songId, bytes[] calldata records)
        external
        returns (bytes32 node)
    {
        (address artist,,,,,,,,,) = rights.songs(keccak256(bytes(songId)));
        if (msg.sender != artist) revert NotSongArtist();
        node = registry.createSubnode(registry.baseNode(), songId, artist, records);
        emit SongNameRegistered(songId, artist, node);
    }

    /// @notice Helper to compute the node for a label (off-chain convenience / tests).
    function nodeFor(string calldata label) external view returns (bytes32) {
        return registry.makeNode(registry.baseNode(), label);
    }
}
