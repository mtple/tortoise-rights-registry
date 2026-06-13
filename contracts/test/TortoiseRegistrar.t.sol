// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TortoiseRegistrar} from "../src/TortoiseRegistrar.sol";
import {IL2Registry} from "../src/IL2Registry.sol";
import {MockL2Registry} from "./mocks/MockL2Registry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TortoiseRegistrarTest is Test {
    MockL2Registry registry;
    TortoiseRegistrar registrar;
    address owner = makeAddr("owner");
    address artist = makeAddr("artist");
    address stranger = makeAddr("stranger");

    function setUp() public {
        registry = new MockL2Registry();
        registrar = new TortoiseRegistrar(IL2Registry(address(registry)), owner);
    }

    // Pre-encode setText(subnode, key, value) the way the admin CLI does — records MUST embed the
    // real subnode (the mock enforces Durin's [4:36]==subnode check), so callers pass nodeFor(label).
    function _records(bytes32 node) internal pure returns (bytes[] memory data) {
        data = new bytes[](2);
        data[0] = abi.encodeWithSignature("setText(bytes32,string,string)", node, "manifest.hash", "0xabc");
        data[1] = abi.encodeWithSignature("setText(bytes32,string,string)", node, "url", "https://example/song/flux");
    }

    function test_register_onlyOwner() public {
        bytes[] memory data = _records(registrar.nodeFor("flux"));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registrar.register("flux", artist, data);
    }

    function test_register_mintsSubnodeAndRecords() public {
        bytes32 expectedNode = registrar.nodeFor("flux");
        bytes[] memory data = _records(expectedNode);

        vm.prank(owner);
        vm.expectEmit(false, true, true, true, address(registrar));
        emit TortoiseRegistrar.SongNameRegistered("flux", artist, expectedNode);
        bytes32 node = registrar.register("flux", artist, data);

        assertEq(node, expectedNode, "node");
        assertEq(registry.owners(node), artist, "subname owner");
        assertEq(registry.lastDataLen(), 2, "records forwarded");
        // Records were encoded for the real subnode and the mock enforces the node-check, so they land here.
        assertEq(registry.texts(expectedNode, "manifest.hash"), "0xabc", "text record applied");
    }

    // A record encoded for the WRONG node is rejected (mirrors Durin's Multicallable node-check).
    function test_register_revertsOnWrongNodeRecord() public {
        bytes[] memory bad = new bytes[](1);
        bad[0] = abi.encodeWithSignature("setText(bytes32,string,string)", bytes32(uint256(1)), "k", "v");
        vm.prank(owner);
        vm.expectRevert(bytes("NODE_MISMATCH"));
        registrar.register("flux", artist, bad);
    }

    // A duplicate label can't be minted twice — the revert comes from the registry's createSubnode
    // (Durin's subname is an ERC-721), not from a pre-check in our registrar.
    function test_register_revertsOnDuplicate() public {
        bytes[] memory data = _records(registrar.nodeFor("flux"));
        vm.prank(owner);
        registrar.register("flux", artist, data); // takes it
        vm.prank(owner);
        vm.expectRevert(MockL2Registry.AlreadyMinted.selector);
        registrar.register("flux", artist, data); // second time reverts at createSubnode
    }
}
