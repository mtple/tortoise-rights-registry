// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TortoiseRightsRegistry} from "../src/TortoiseRightsRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys TortoiseRightsRegistry. Constructor args come from env so no secrets are in code.
/// @dev forge reads env from contracts/, so first: `ln -sf ../.env .env` (gitignored) to expose
///      BASE_RPC_URL / USDC_ADDRESS / TREASURY_ADDRESS / ETHERSCAN_API_KEY.
///      Dry-run on a local Base fork first:
///        anvil --fork-url "$BASE_RPC_URL"    # in another shell
///        forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --sender <ADMIN_ADDR>
///      Real broadcast (admin runs this; sign with a keystore — `--broadcast` alone will NOT sign):
///        forge script script/Deploy.s.sol --rpc-url base --broadcast --verify --account tortoise-admin --sender <ADMIN_ADDR>
///
///      ⚠️ The EIP-712 domain binds this contract's address — deploy BEFORE collecting any
///         opt-in signature; a redeploy invalidates every signature (C4).
///      ⚠️ treasury is immutable (C9) — triple-check TREASURY_ADDRESS before broadcasting.
contract Deploy is Script {
    function run() external returns (TortoiseRightsRegistry reg) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        // Owner defaults to the broadcaster if OWNER_ADDRESS is unset.
        address owner = vm.envOr("OWNER_ADDRESS", address(0));

        vm.startBroadcast();
        if (owner == address(0)) owner = msg.sender;
        reg = new TortoiseRightsRegistry(IERC20(usdc), treasury, owner);
        vm.stopBroadcast();

        console.log("TortoiseRightsRegistry:", address(reg));
        console.log("  USDC:    ", usdc);
        console.log("  treasury:", treasury);
        console.log("  owner:   ", owner);
        console.log("  chainid: ", block.chainid);
    }
}
