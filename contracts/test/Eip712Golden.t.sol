// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TortoiseRightsRegistry} from "../src/TortoiseRightsRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Golden-value test (plan §10.1): the contract's EIP-712 Consent digest MUST equal the
///      value computed by viem's `hashTypedData` for identical inputs. This is what guarantees a
///      signature produced off-chain by the app (viem) verifies on-chain. If this breaks, the
///      Consent typehash / domain / field order diverged from src/lib/eip712.ts.
///
///      The expected digest was produced by scripts/golden (viem) for:
///        domain  = { name:"TortoiseRightsRegistry", version:"1", chainId:8453,
///                    verifyingContract:0x1111111111111111111111111111111111111111 }
///        message = { songId:"song-123", artist:0x..A1, audioHash:keccak256("audio"),
///                    permissionMode:0, licenseTermsHash:keccak256("terms"),
///                    optIn:true, timestamp:1700000000 }
contract Eip712GoldenTest is Test {
    address constant PINNED = 0x1111111111111111111111111111111111111111;
    address constant ARTIST = 0x00000000000000000000000000000000000000A1;

    // From viem hashTypedData (see scripts/golden-eip712.mjs).
    bytes32 constant EXPECTED_DIGEST = 0xb33ec1a6fffaa5ef4f08a3704f7cc23cb3780cdca9ea5bdb98918e4a48b21179;

    function test_digest_matches_viem() public {
        vm.chainId(8453);
        // Pin the contract address so the EIP-712 domain (which binds verifyingContract) is reproducible.
        TortoiseRightsRegistry impl =
            new TortoiseRightsRegistry(IERC20(address(0xdead)), address(0xbeef), address(this));
        vm.etch(PINNED, address(impl).code);
        TortoiseRightsRegistry reg = TortoiseRightsRegistry(PINNED);

        bytes32 digest = reg.consentDigest(
            "song-123", ARTIST, keccak256("audio"), 0, keccak256("terms"), true, 1700000000
        );
        assertEq(digest, EXPECTED_DIGEST, "contract digest must equal viem hashTypedData");
    }

    // Sanity: the sub-hashes viem reported also match (catches a keccak/encoding drift early).
    function test_componentHashes() public pure {
        assertEq(keccak256("audio"), 0x9c6e946312c1ed1ff35f417af781df237ad04671cdb7c9b87430e63bb0c6fbc3);
        assertEq(keccak256("terms"), 0x9ff867f6592aa9d6d039e7aad6bd71f1659720cbc4dd9eae1554f6eab490098b);
    }
}
