// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title TortoiseRightsRegistry
/// @notice Records an artist's EIP-712 consent to opt a single song into AI-training
///         licensing, and sells per-song USDC licenses. Canonical state for the
///         Tortoise Rights Registry; the audio + consent manifest live on Walrus and
///         are committed here by content hash. See plan §4 (C1–C14) for the rationale.
/// @dev    The web app holds no key: the ARTIST sends `registerSong`/`revokeConsent`
///         from their own wallet; buyers send `purchaseSongLicense`. Owner-only ops
///         are limited to ENS/registrar wiring elsewhere — this contract has no owner
///         levers over consent or funds (treasury is immutable, C9).
contract TortoiseRightsRegistry is EIP712, Ownable {
    using SafeERC20 for IERC20;

    /// @notice MVP has a single permission mode; the enum leaves room to extend.
    enum PermissionMode {
        AI_TRAINING_ALLOWED // 0
    }

    /// @dev Field order is chosen for storage packing, not the spec's reading order:
    ///      slot N   : artist (160) + permissionMode (8) + consentTimestamp (64) + licenseActive (8) = 240 bits
    ///      slot N+1 : priceUsdc (96) ...padding
    ///      then the three bytes32 + two dynamic strings.
    struct SongRecord {
        address artist; // who consented (and the only address allowed to update/revoke)
        uint8 permissionMode; // PermissionMode (signed)
        uint64 consentTimestamp; // signed; strictly monotonic per song (C1)
        bool licenseActive; // future licensing currently ALLOWED (not "sold"); false after revoke (C15)
        uint96 priceUsdc; // 6 decimals; set by the artist at registration (NOT signed)
        bytes32 manifestHash; // keccak256 of the song manifest bytes on Walrus
        bytes32 audioHash; // keccak256 of the audio bytes (signed)
        bytes32 licenseTermsHash; // keccak256(LICENSE_TERMS.md bytes) (signed)
        string walrusManifestBlobId; // song manifest blob
        string walrusAudioBlobId; // mirrored audio blob
    }

    /// @notice USDC used for license payments (Base mainnet, 6 decimals — verified).
    IERC20 public immutable USDC;
    /// @notice Receives license payments directly; immutable by design (C9).
    address public immutable treasury;

    /// @notice songKey => record. songKey = keccak256(bytes(songId)).
    mapping(bytes32 => SongRecord) public songs;
    /// @notice songKey => buyer => the song manifest hash they licensed (snapshot, C2/C11).
    mapping(bytes32 => mapping(address => bytes32)) public licenses;

    // EIP-712 Consent typehash — MUST match src/lib/eip712.ts and the manifest exactly.
    bytes32 private constant CONSENT_TYPEHASH = keccak256(
        "Consent(string songId,address artist,bytes32 audioHash,uint8 permissionMode,bytes32 licenseTermsHash,bool optIn,uint64 timestamp)"
    );

    event SongRegistered(
        bytes32 indexed songKey,
        string songId,
        address indexed artist,
        bytes32 manifestHash,
        bytes32 audioHash,
        uint8 permissionMode,
        bytes32 licenseTermsHash,
        string walrusManifestBlobId,
        string walrusAudioBlobId,
        uint96 priceUsdc,
        uint64 consentTimestamp
    );
    event ConsentRevoked(bytes32 indexed songKey, string songId, address indexed artist);
    event LicensePurchased(
        bytes32 indexed songKey, string songId, address indexed buyer, bytes32 manifestHash, uint96 price
    );

    error OnlyArtist();
    error ArtistMismatch();
    error ZeroArtist();
    error NotRegistered();
    error StaleConsent(); // consentTimestamp not strictly greater than stored (C1)
    error BadPermissionMode();
    error InvalidSignature();
    error LicenseInactive();
    error ManifestMismatch(); // expectedManifestHash != live manifestHash (C2/C5)
    error AlreadyLicensed(); // same buyer, repeat purchase (C13)

    /// @param usdc     USDC token address (Base mainnet 0x8335..2913).
    /// @param treasury_ Wallet that receives all license payments. Triple-check (C9): immutable.
    /// @param owner_   Contract owner (admin). No control over consent or funds.
    constructor(IERC20 usdc, address treasury_, address owner_)
        EIP712("TortoiseRightsRegistry", "1")
        Ownable(owner_)
    {
        require(address(usdc) != address(0) && treasury_ != address(0), "ZERO_ADDR");
        USDC = usdc;
        treasury = treasury_;
    }

    /// @notice keccak256(bytes(songId)) — the storage key for a song.
    function songKey(string memory songId) public pure returns (bytes32) {
        return keccak256(bytes(songId));
    }

    /// @notice The EIP-712 digest an artist signs to consent. Exposed so off-chain
    ///         tooling (and tests) can confirm they build the exact same digest.
    function consentDigest(
        string memory songId,
        address artist,
        bytes32 audioHash,
        uint8 permissionMode,
        bytes32 licenseTermsHash,
        bool optIn,
        uint64 timestamp
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CONSENT_TYPEHASH,
                    keccak256(bytes(songId)),
                    artist,
                    audioHash,
                    permissionMode,
                    licenseTermsHash,
                    optIn,
                    timestamp
                )
            )
        );
    }

    /// @notice The EIP-712 domain separator (for tooling/tests).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Register (or re-register / re-opt-in) a song's AI-training consent.
    /// @dev ARTIST-SUBMITTED ONLY (msg.sender == artist) — the tx itself reinforces consent (no relayer).
    ///      Verifies the artist's EIP-712 `Consent{...optIn:true...}` via SignatureChecker (EOA + ERC-1271).
    ///      Anti-replay (C1): consentTimestamp must be strictly greater than the stored one (0 on first
    ///      registration), so an archived signature can't be replayed after a revoke. Re-registration is
    ///      same-artist only and may update manifest/audio/terms/blobs/price. Sets licenseActive = true.
    function registerSong(
        string calldata songId,
        address artist,
        bytes32 manifestHash,
        bytes32 audioHash,
        uint8 permissionMode,
        bytes32 licenseTermsHash,
        string calldata walrusManifestBlobId,
        string calldata walrusAudioBlobId,
        uint96 priceUsdc,
        uint64 consentTimestamp,
        bytes calldata signature
    ) external {
        if (artist == address(0)) revert ZeroArtist();
        if (msg.sender != artist) revert OnlyArtist();
        if (permissionMode > uint8(type(PermissionMode).max)) revert BadPermissionMode();

        bytes32 key = keccak256(bytes(songId));
        SongRecord storage s = songs[key];

        // Re-registration must be by the same artist (first registration: stored artist is 0).
        if (s.artist != address(0) && s.artist != artist) revert ArtistMismatch();
        // Strict monotonicity (C1): blocks replay of an older signature; first register passes vs 0.
        if (consentTimestamp <= s.consentTimestamp) revert StaleConsent();

        // Verify consent over the EXACT signed terms (binds who/what/which-permission/which-terms, C3).
        bytes32 digest =
            consentDigest(songId, artist, audioHash, permissionMode, licenseTermsHash, true, consentTimestamp);
        if (!SignatureChecker.isValidSignatureNow(artist, digest, signature)) revert InvalidSignature();

        s.artist = artist;
        s.manifestHash = manifestHash;
        s.audioHash = audioHash;
        s.permissionMode = permissionMode;
        s.licenseTermsHash = licenseTermsHash;
        s.walrusManifestBlobId = walrusManifestBlobId;
        s.walrusAudioBlobId = walrusAudioBlobId;
        s.priceUsdc = priceUsdc;
        s.consentTimestamp = consentTimestamp;
        s.licenseActive = true; // first registration AND re-opt-in (spec §4)

        emit SongRegistered(
            key,
            songId,
            artist,
            manifestHash,
            audioHash,
            permissionMode,
            licenseTermsHash,
            walrusManifestBlobId,
            walrusAudioBlobId,
            priceUsdc,
            consentTimestamp
        );
    }

    /// @notice Stop NEW license purchases for a song. Forward-looking only.
    /// @dev require(msg.sender == artist). Existing buyer licenses remain valid as snapshots.
    function revokeConsent(string calldata songId) external {
        bytes32 key = keccak256(bytes(songId));
        SongRecord storage s = songs[key];
        if (s.artist == address(0)) revert NotRegistered();
        if (msg.sender != s.artist) revert OnlyArtist();
        s.licenseActive = false;
        emit ConsentRevoked(key, songId, s.artist);
    }

    /// @notice Buy a license for a song with USDC. Unlimited distinct buyers.
    /// @dev Requires the song to be active and the caller's expectedManifestHash to match the live
    ///      manifest (snapshot + no bait-and-switch, C2/C5). Blocks only a REPEAT purchase by the
    ///      same buyer (C13). Payment goes directly to treasury via SafeERC20 (C14).
    /// @param expectedManifestHash The manifest hash the buyer read just before sending the tx.
    function purchaseSongLicense(string calldata songId, bytes32 expectedManifestHash) external {
        bytes32 key = keccak256(bytes(songId));
        SongRecord storage s = songs[key];
        if (s.artist == address(0)) revert NotRegistered();
        if (!s.licenseActive) revert LicenseInactive();
        if (expectedManifestHash != s.manifestHash) revert ManifestMismatch();
        if (licenses[key][msg.sender] != bytes32(0)) revert AlreadyLicensed();

        // Record the snapshot BEFORE the external transfer (checks-effects-interactions).
        licenses[key][msg.sender] = s.manifestHash;
        uint96 price = s.priceUsdc;

        USDC.safeTransferFrom(msg.sender, treasury, price);

        emit LicensePurchased(key, songId, msg.sender, s.manifestHash, price);
    }
}
