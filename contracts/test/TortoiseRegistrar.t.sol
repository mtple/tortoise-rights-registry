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

    function _records() internal pure returns (bytes[] memory data) {
        // Pre-encode setText(node placeholder, key, value) the way the admin CLI would.
        // node arg is ignored by the mock's setText routing in this shape; we encode a representative call.
        data = new bytes[](2);
        data[0] = abi.encodeWithSignature(
            "setText(bytes32,string,string)", bytes32(0), "manifest.hash", "0xabc"
        );
        data[1] = abi.encodeWithSignature(
            "setText(bytes32,string,string)", bytes32(0), "url", "https://example/song/flux"
        );
    }

    function test_register_onlyOwner() public {
        bytes[] memory data = _records();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registrar.register("flux", artist, data);
    }

    function test_register_mintsSubnodeAndRecords() public {
        bytes[] memory data = _records();
        bytes32 expectedNode = registrar.nodeFor("flux");

        vm.prank(owner);
        vm.expectEmit(false, true, true, true, address(registrar));
        emit TortoiseRegistrar.SongNameRegistered("flux", artist, expectedNode);
        bytes32 node = registrar.register("flux", artist, data);

        assertEq(node, expectedNode, "node");
        assertEq(registry.owners(node), artist, "subname owner");
        assertEq(registry.lastDataLen(), 2, "records forwarded");
        // The setText calls in data used bytes32(0) as node, so check there.
        assertEq(registry.texts(bytes32(0), "manifest.hash"), "0xabc", "text record applied");
    }

    function test_register_revertsIfUnavailable() public {
        bytes[] memory data = _records();
        vm.prank(owner);
        registrar.register("flux", artist, data); // takes it
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TortoiseRegistrar.LabelUnavailable.selector, "flux"));
        registrar.register("flux", artist, data); // second time unavailable
    }

    function test_register_revertsOnShortLabel() public {
        bytes[] memory data = _records();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TortoiseRegistrar.LabelUnavailable.selector, "ab"));
        registrar.register("ab", artist, data); // < 3 chars -> unavailable
    }
}
