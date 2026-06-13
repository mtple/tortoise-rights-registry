// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TortoiseRightsRegistry} from "../src/TortoiseRightsRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Proves purchaseSongLicense works against REAL USDC on Base mainnet (C14), not just the mock.
///      Only runs under a fork: `forge test --fork-url base --match-contract PurchaseForkTest`.
///      Skips cleanly (no fork) so the default `forge test` stays green offline.
contract PurchaseForkTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base mainnet
    // A well-known USDC-rich account on Base to source real tokens from (Base USDC bridge/treasury).
    // If this ever runs dry, swap for any address with USDC; the test deal()s as a fallback.
    address constant USDC_WHALE = 0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A;

    TortoiseRightsRegistry reg;
    uint256 artistPk = 0xA11CE;
    address artist;
    address treasury = makeAddr("treasury");
    address buyer = makeAddr("buyer");

    string constant SONG_ID = "fork-song";
    bytes32 constant MANIFEST_HASH = keccak256("m");
    bytes32 constant AUDIO_HASH = keccak256("a");
    bytes32 constant TERMS_HASH = keccak256("t");
    uint96 constant PRICE = 5_000_000;

    function _isFork() internal view returns (bool) {
        return USDC.code.length > 0;
    }

    function setUp() public {
        if (!_isFork()) return;
        artist = vm.addr(artistPk);
        reg = new TortoiseRightsRegistry(IERC20(USDC), treasury, makeAddr("owner"));

        bytes32 digest = reg.consentDigest(SONG_ID, artist, AUDIO_HASH, 0, TERMS_HASH, true, 1000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(artistPk, digest);
        vm.prank(artist);
        reg.registerSong(SONG_ID, artist, MANIFEST_HASH, AUDIO_HASH, 0, TERMS_HASH, "mb", "ab", PRICE, 1000, abi.encodePacked(r, s, v));
    }

    function test_purchase_realUSDC() public {
        if (!_isFork()) {
            emit log("skipping PurchaseForkTest (no fork; run with --fork-url base)");
            return;
        }
        // Give the buyer real USDC. Prefer a transfer from a whale; fall back to deal().
        if (IERC20(USDC).balanceOf(USDC_WHALE) >= PRICE) {
            vm.prank(USDC_WHALE);
            require(IERC20(USDC).transfer(buyer, PRICE), "whale transfer");
        } else {
            deal(USDC, buyer, PRICE);
        }

        vm.startPrank(buyer);
        IERC20(USDC).approve(address(reg), PRICE);
        reg.purchaseSongLicense(SONG_ID, MANIFEST_HASH);
        vm.stopPrank();

        assertEq(reg.licenses(reg.songKey(SONG_ID), buyer), MANIFEST_HASH, "license recorded");
        assertEq(IERC20(USDC).balanceOf(treasury), PRICE, "treasury received real USDC");
        assertEq(IERC20(USDC).balanceOf(buyer), 0, "buyer debited");
    }
}
