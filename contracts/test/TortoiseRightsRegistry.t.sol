// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TortoiseRightsRegistry} from "../src/TortoiseRightsRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC1271} from "./mocks/MockERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Base is Test {
    TortoiseRightsRegistry internal reg;
    MockERC20 internal usdc;

    // Roles
    uint256 internal artistPk = 0xA11CE;
    address internal artist;
    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal buyer = makeAddr("buyer");
    address internal buyer2 = makeAddr("buyer2");

    // Canonical consent fields reused across tests
    string internal constant SONG_ID = "22db30d4-927b-4fa8-aa91-539903804c06";
    bytes32 internal constant MANIFEST_HASH = keccak256("manifest-v1");
    bytes32 internal constant AUDIO_HASH = keccak256("audio-bytes");
    bytes32 internal constant TERMS_HASH = keccak256("LICENSE_TERMS.md-bytes");
    uint8 internal constant MODE = 0; // AI_TRAINING_ALLOWED
    string internal constant MANIFEST_BLOB = "manifestBlobId123";
    string internal constant AUDIO_BLOB = "audioBlobId456";
    uint96 internal constant PRICE = 5_000_000; // 5 USDC (6 decimals)

    function setUp() public virtual {
        artist = vm.addr(artistPk);
        usdc = new MockERC20();
        reg = new TortoiseRightsRegistry(IERC20(address(usdc)), treasury, owner);
    }

    // ---- helpers ----

    function _sign(uint256 pk, uint64 ts) internal view returns (bytes memory) {
        bytes32 digest = reg.consentDigest(SONG_ID, artist, AUDIO_HASH, MODE, TERMS_HASH, true, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _register(address sender, address artist_, uint64 ts, bytes memory sig) internal {
        vm.prank(sender);
        reg.registerSong(
            SONG_ID, artist_, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, ts, sig
        );
    }

    // Standard happy-path registration by the EOA artist at timestamp `ts`.
    function _registerOk(uint64 ts) internal {
        _register(artist, artist, ts, _sign(artistPk, ts));
    }

    function _fundAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(reg), amount);
    }
}

contract RegisterTest is Base {
    function test_register_happyPath_EOA() public {
        _registerOk(1000);
        (
            address a,
            uint8 mode,
            uint64 ts,
            bool active,
            uint96 price,
            bytes32 mh,
            bytes32 ah,
            bytes32 th,
            ,
        ) = reg.songs(reg.songKey(SONG_ID));
        assertEq(a, artist, "artist");
        assertEq(mode, MODE, "mode");
        assertEq(ts, 1000, "ts");
        assertTrue(active, "active");
        assertEq(price, PRICE, "price");
        assertEq(mh, MANIFEST_HASH, "manifestHash");
        assertEq(ah, AUDIO_HASH, "audioHash");
        assertEq(th, TERMS_HASH, "termsHash");
    }

    function test_register_emitsEvent() public {
        bytes memory sig = _sign(artistPk, 1000);
        vm.expectEmit(true, true, false, true, address(reg));
        emit TortoiseRightsRegistry.SongRegistered(
            reg.songKey(SONG_ID),
            SONG_ID,
            artist,
            MANIFEST_HASH,
            AUDIO_HASH,
            MODE,
            TERMS_HASH,
            MANIFEST_BLOB,
            AUDIO_BLOB,
            PRICE,
            1000
        );
        _register(artist, artist, 1000, sig);
    }

    // C10 / msg.sender==artist gate: a relayer cannot submit even with a valid signature.
    function test_register_revertsIfSenderNotArtist() public {
        bytes memory sig = _sign(artistPk, 1000);
        vm.expectRevert(TortoiseRightsRegistry.OnlyArtist.selector);
        _register(buyer, artist, 1000, sig); // someone else relays
    }

    function test_register_revertsOnZeroArtist() public {
        vm.prank(address(0));
        vm.expectRevert(TortoiseRightsRegistry.ZeroArtist.selector);
        reg.registerSong(
            SONG_ID, address(0), MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, 1, ""
        );
    }

    // C3: signature is over the exact terms — a wrong-key signature fails.
    function test_register_revertsOnBadSignature() public {
        bytes memory wrongSig = _sign(0xBEEF, 1000); // not the artist's key
        vm.expectRevert(TortoiseRightsRegistry.InvalidSignature.selector);
        _register(artist, artist, 1000, wrongSig);
    }

    // C3: tampering any signed field invalidates the signature (audioHash here).
    function test_register_revertsIfSignedFieldTampered() public {
        uint64 ts = 1000;
        bytes32 digest = reg.consentDigest(SONG_ID, artist, AUDIO_HASH, MODE, TERMS_HASH, true, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(artistPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        // Submit with a DIFFERENT audioHash than what was signed.
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.InvalidSignature.selector);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, keccak256("different-audio"), MODE, TERMS_HASH,
            MANIFEST_BLOB, AUDIO_BLOB, PRICE, ts, sig
        );
    }

    function test_register_revertsOnBadPermissionMode() public {
        uint8 badMode = 7;
        bytes32 digest = reg.consentDigest(SONG_ID, artist, AUDIO_HASH, badMode, TERMS_HASH, true, 1000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(artistPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.BadPermissionMode.selector);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, badMode, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, 1000, sig
        );
    }

    // ERC-1271 / Base Account path (R5): a smart-contract wallet signs via its owned EOA.
    function test_register_ERC1271_smartWallet() public {
        // Deploy a smart wallet owned by an EOA; the wallet IS the artist address.
        uint256 ownerPk = 0x5A1A;
        address walletOwner = vm.addr(ownerPk);
        MockERC1271 wallet = new MockERC1271(walletOwner);
        address smartArtist = address(wallet);

        uint64 ts = 2000;
        // Digest must use the smart-wallet address as `artist`.
        bytes32 digest = reg.consentDigest(SONG_ID, smartArtist, AUDIO_HASH, MODE, TERMS_HASH, true, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(smartArtist);
        reg.registerSong(
            SONG_ID, smartArtist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, ts, sig
        );
        (address a,,,bool active,,,,,,) = reg.songs(reg.songKey(SONG_ID));
        assertEq(a, smartArtist, "smart-wallet artist");
        assertTrue(active, "active");
    }

    function test_register_ERC1271_rejectsForeignSig() public {
        uint256 ownerPk = 0x5A1A;
        MockERC1271 wallet = new MockERC1271(vm.addr(ownerPk));
        address smartArtist = address(wallet);
        uint64 ts = 2000;
        bytes32 digest = reg.consentDigest(SONG_ID, smartArtist, AUDIO_HASH, MODE, TERMS_HASH, true, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest); // not the wallet's owner
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(smartArtist);
        vm.expectRevert(TortoiseRightsRegistry.InvalidSignature.selector);
        reg.registerSong(
            SONG_ID, smartArtist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, ts, sig
        );
    }
}

contract ReplayMonotonicityTest is Base {
    // C1: re-submitting the same signature (same timestamp) reverts.
    function test_replay_sameTimestampReverts() public {
        bytes memory sig = _sign(artistPk, 1000);
        _register(artist, artist, 1000, sig);
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.StaleConsent.selector);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, 1000, sig
        );
    }

    // C1: an OLDER timestamp than stored reverts (the core post-revoke replay defense).
    function test_replay_olderTimestampReverts() public {
        _registerOk(1000);
        bytes memory oldSig = _sign(artistPk, 999);
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.StaleConsent.selector);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, 999, oldSig
        );
    }

    // C1 end-to-end: after revoke, an archived earlier signature cannot re-activate licensing.
    function test_replay_afterRevoke_archivedSigRejected() public {
        _registerOk(1000); // licenseActive = true
        vm.prank(artist);
        reg.revokeConsent(SONG_ID); // licenseActive = false

        // Attacker (or anyone) replays the original ts=1000 signature to try to re-open licensing.
        bytes memory archived = _sign(artistPk, 1000);
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.StaleConsent.selector);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, 1000, archived
        );

        // A FRESH signature (newer ts) is required to re-opt-in.
        _registerOk(1001);
        (,,,bool active,,,,,,) = reg.songs(reg.songKey(SONG_ID));
        assertTrue(active, "re-opt-in with fresh sig reactivates");
    }

    // Re-registration updates fields and must be by the same artist.
    function test_reRegister_updatesFields() public {
        _registerOk(1000);
        uint64 ts2 = 2000;
        bytes32 newAudio = AUDIO_HASH; // keep audio same so the helper's digest matches
        bytes memory sig = _sign(artistPk, ts2);
        vm.prank(artist);
        reg.registerSong(
            SONG_ID, artist, keccak256("manifest-v2"), newAudio, MODE, TERMS_HASH, "mblob2", "ablob2", 9_000_000, ts2, sig
        );
        (,,uint64 ts,,uint96 price, bytes32 mh,,,,) = reg.songs(reg.songKey(SONG_ID));
        assertEq(ts, ts2, "ts updated");
        assertEq(price, 9_000_000, "price updated");
        assertEq(mh, keccak256("manifest-v2"), "manifest updated");
    }

    function test_reRegister_differentArtistReverts() public {
        _registerOk(1000);
        // A different artist signs their own valid consent but for the same songId.
        uint256 otherPk = 0xC0FFEE;
        address other = vm.addr(otherPk);
        uint64 ts2 = 2000;
        bytes32 digest = reg.consentDigest(SONG_ID, other, AUDIO_HASH, MODE, TERMS_HASH, true, ts2);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(otherPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(other);
        vm.expectRevert(TortoiseRightsRegistry.ArtistMismatch.selector);
        reg.registerSong(
            SONG_ID, other, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, ts2, sig
        );
    }
}

contract RevokeTest is Base {
    function test_revoke_flipsActive() public {
        _registerOk(1000);
        bytes32 key = reg.songKey(SONG_ID);
        vm.expectEmit(true, true, false, true, address(reg));
        emit TortoiseRightsRegistry.ConsentRevoked(key, SONG_ID, artist);
        vm.prank(artist);
        reg.revokeConsent(SONG_ID);
        (,,,bool active,,,,,,) = reg.songs(key);
        assertFalse(active, "inactive after revoke");
    }

    function test_revoke_onlyArtist() public {
        _registerOk(1000);
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.OnlyArtist.selector);
        reg.revokeConsent(SONG_ID);
    }

    function test_revoke_unregisteredReverts() public {
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.NotRegistered.selector);
        reg.revokeConsent("nope");
    }
}

contract PurchaseTest is Base {
    function setUp() public override {
        super.setUp();
        _registerOk(1000);
    }

    function test_purchase_happyPath_movesUSDCAndRecords() public {
        _fundAndApprove(buyer, PRICE);
        bytes32 key = reg.songKey(SONG_ID);
        // expectEmit checks the NEXT emitted log; purchaseSongLicense emits USDC Transfer
        // first, then LicensePurchased, so match by (indexed topics + data) which only the
        // latter satisfies. startPrank keeps `buyer` as msg.sender through the call.
        vm.startPrank(buyer);
        vm.expectEmit(true, true, false, true, address(reg));
        emit TortoiseRightsRegistry.LicensePurchased(key, SONG_ID, buyer, MANIFEST_HASH, PRICE);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
        vm.stopPrank();

        assertEq(reg.licenses(key, buyer), MANIFEST_HASH, "license snapshot");
        assertEq(usdc.balanceOf(treasury), PRICE, "treasury paid");
        assertEq(usdc.balanceOf(buyer), 0, "buyer debited");
    }

    // C15: unlimited distinct buyers may license while active.
    function test_purchase_twoBuyersBothSucceed() public {
        _fundAndApprove(buyer, PRICE);
        _fundAndApprove(buyer2, PRICE);
        vm.prank(buyer);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
        vm.prank(buyer2);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
        assertEq(reg.licenses(reg.songKey(SONG_ID), buyer), MANIFEST_HASH);
        assertEq(reg.licenses(reg.songKey(SONG_ID), buyer2), MANIFEST_HASH);
        assertEq(usdc.balanceOf(treasury), uint256(PRICE) * 2, "treasury got both");
    }

    // C13: same buyer cannot purchase twice.
    function test_purchase_sameBuyerTwiceReverts() public {
        _fundAndApprove(buyer, uint256(PRICE) * 2);
        vm.prank(buyer);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.AlreadyLicensed.selector);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
    }

    // C2/C5: stale expectedManifestHash (artist re-registered) reverts safely.
    function test_purchase_staleManifestHashReverts() public {
        _fundAndApprove(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.ManifestMismatch.selector);
        reg.purchaseSongLicense(SONG_ID, keccak256("some-old-manifest"), PRICE);
    }

    // Revoked song: no new licenses.
    function test_purchase_afterRevokeReverts() public {
        vm.prank(artist);
        reg.revokeConsent(SONG_ID);
        _fundAndApprove(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.LicenseInactive.selector);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
    }

    function test_purchase_unregisteredReverts() public {
        _fundAndApprove(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.NotRegistered.selector);
        reg.purchaseSongLicense("nope", MANIFEST_HASH, PRICE);
    }

    // C14: insufficient allowance reverts (SafeERC20 surfaces the token revert).
    function test_purchase_insufficientAllowanceReverts() public {
        usdc.mint(buyer, PRICE); // funded but no approve
        vm.prank(buyer);
        vm.expectRevert(); // SafeERC20 bubbles the "ALLOWANCE" revert
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
        // license must NOT be recorded on a failed payment (checks-effects-interactions reverts all)
        assertEq(reg.licenses(reg.songKey(SONG_ID), buyer), bytes32(0), "no license on failed pay");
    }

    // A buyer who licensed before a revoke keeps their snapshot.
    function test_purchase_snapshotSurvivesRevoke() public {
        _fundAndApprove(buyer, PRICE);
        vm.prank(buyer);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);
        vm.prank(artist);
        reg.revokeConsent(SONG_ID);
        assertEq(reg.licenses(reg.songKey(SONG_ID), buyer), MANIFEST_HASH, "snapshot survives revoke");
    }

    // AUDIT F1 — price slippage guard: a buyer who set maxPrice is protected when the live price
    // exceeds it. Reverts PriceTooHigh rather than charging the higher amount.
    function test_purchase_priceAboveMaxReverts() public {
        _fundAndApprove(buyer, uint256(PRICE) * 100);
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.PriceTooHigh.selector);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE - 1); // willing to pay < listed
    }

    // AUDIT F1 — the actual exploit the audit found: artist front-runs a generous-allowance buyer
    // by re-registering a HIGHER price under the SAME manifestHash. The maxPrice guard now stops it;
    // without the guard this drained the buyer's full allowance (PoC charged 10_000 USDC for 1).
    function test_purchase_priceFrontRun_blockedByMaxPrice() public {
        // Buyer approves a generous allowance and intends to pay the listed 5 USDC.
        _fundAndApprove(buyer, uint256(PRICE) * 1000);

        // Artist front-runs: same manifestHash, same audio/terms, fresh sig at ts+1, price x1000.
        uint64 ts2 = 1001;
        uint96 jacked = PRICE * 1000;
        bytes memory sig = _sign(artistPk, ts2);
        vm.prank(artist);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, jacked, ts2, sig
        );

        // Buyer's pending purchase, still bounded at the price they saw, now reverts instead of draining.
        vm.prank(buyer);
        vm.expectRevert(TortoiseRightsRegistry.PriceTooHigh.selector);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, PRICE);

        // No funds moved, no license recorded.
        assertEq(usdc.balanceOf(treasury), 0, "treasury untouched");
        assertEq(reg.licenses(reg.songKey(SONG_ID), buyer), bytes32(0), "no license recorded");
    }

    // An honest re-price the buyer accepts still works: buyer raises maxPrice to the new price.
    function test_purchase_acceptsHigherPriceWhenMaxAllows() public {
        uint64 ts2 = 1001;
        uint96 newPrice = PRICE * 2;
        bytes memory sig = _sign(artistPk, ts2);
        vm.prank(artist);
        reg.registerSong(
            SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, newPrice, ts2, sig
        );
        _fundAndApprove(buyer, newPrice);
        vm.prank(buyer);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH, newPrice);
        assertEq(usdc.balanceOf(treasury), newPrice, "treasury got the accepted higher price");
    }
}

contract ZeroManifestTest is Base {
    // AUDIT F2 — registerSong must reject manifestHash == 0, which would collide with the
    // bytes32(0) "no license" sentinel and break the AlreadyLicensed guard + snapshot.
    function test_register_rejectsZeroManifest() public {
        uint64 ts = 1000;
        bytes32 digest = reg.consentDigest(SONG_ID, artist, AUDIO_HASH, MODE, TERMS_HASH, true, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(artistPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(artist);
        vm.expectRevert(TortoiseRightsRegistry.ZeroManifest.selector);
        reg.registerSong(
            SONG_ID, artist, bytes32(0), AUDIO_HASH, MODE, TERMS_HASH, MANIFEST_BLOB, AUDIO_BLOB, PRICE, ts, sig
        );
    }
}

contract ConstructorTest is Base {
    function test_immutablesAndOwner() public view {
        assertEq(address(reg.USDC()), address(usdc));
        assertEq(reg.treasury(), treasury);
        assertEq(reg.owner(), owner);
    }

    function test_revertsOnZeroUSDC() public {
        vm.expectRevert(bytes("ZERO_ADDR"));
        new TortoiseRightsRegistry(IERC20(address(0)), treasury, owner);
    }

    function test_revertsOnZeroTreasury() public {
        vm.expectRevert(bytes("ZERO_ADDR"));
        new TortoiseRightsRegistry(IERC20(address(usdc)), address(0), owner);
    }
}
