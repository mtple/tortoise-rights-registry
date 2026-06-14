// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TortoiseRegistrar, IRightsRegistry} from "../src/TortoiseRegistrar.sol";
import {IL2Registry} from "../src/IL2Registry.sol";

/// @notice Deploys the TortoiseRegistrar against the deployed Durin L2Registry + rights registry.
/// @dev After this, the registry owner must call `L2Registry.addRegistrar(<this registrar>)`
///      (separate tx, owner-only on the registry) before the registrar can mint. (plan §7.0 item 8)
///        forge script script/DeployRegistrar.s.sol --rpc-url base --broadcast --verify --account tortoise-admin --sender <ADMIN_ADDR>
contract DeployRegistrar is Script {
    function run() external returns (TortoiseRegistrar registrar) {
        address l2Registry = vm.envAddress("L2_REGISTRY_ADDRESS");
        address rights = vm.envAddress("RIGHTS_REGISTRY_ADDRESS");
        address owner = vm.envOr("OWNER_ADDRESS", address(0));

        vm.startBroadcast();
        if (owner == address(0)) owner = msg.sender;
        registrar = new TortoiseRegistrar(IL2Registry(l2Registry), IRightsRegistry(rights), owner);
        vm.stopBroadcast();

        console.log("TortoiseRegistrar:", address(registrar));
        console.log("  L2Registry:", l2Registry);
        console.log("  rights:    ", rights);
        console.log("  owner:     ", owner);
        console.log("NEXT: call L2Registry.addRegistrar(%s) from the registry owner.", address(registrar));
    }
}
