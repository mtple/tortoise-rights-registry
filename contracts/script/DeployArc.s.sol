// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TortoiseRightsRegistry} from "../src/TortoiseRightsRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys TortoiseRightsRegistry to ARC TESTNET (chainId 5042002) — the registry + USDC
///         payment chain for the Arc integration. Identical contract to the Base deploy (the source
///         is chain-agnostic, portable ERC-20); this script just reads ARC-SPECIFIC env so the Base
///         deploy (Deploy.s.sol) and its vars stay completely untouched — you can always go back to
///         Base without editing anything.
/// @dev    Env (ARC_* preferred, Base vars as fallback so you don't have to duplicate everything):
///           ARC_USDC_ADDRESS     (default: Arc system USDC 0x3600…0000, decimals()=6, confirmed on-chain)
///           ARC_TREASURY_ADDRESS (fallback: TREASURY_ADDRESS) — immutable (C9), triple-check
///           OWNER_ADDRESS        (default: broadcaster)
///         Reads env from contracts/ via the `.env` symlink (`ln -sf ../.env .env`). Sign with the
///         keystore — `--broadcast` alone won't sign:
///           forge script script/DeployArc.s.sol --rpc-url arc --broadcast --account tortoise-admin --sender <ADMIN_ADDR>
///         (Arc returns non-standard receipt fields → forge may print a cosmetic alloy parse error
///          AFTER the tx lands. The deploy still succeeded — verify with `cast code`/`cast call`,
///          and do NOT use --resume.)
///
///         ⚠️ The EIP-712 domain binds chainId 5042002 here — re-sign consent on Arc; any Base
///            signature is invalid against this contract (different domain). (C4)
contract DeployArc is Script {
    uint256 constant ARC_TESTNET = 5042002;
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000; // Arc testnet USDC ERC-20 (6 dec)

    function run() external returns (TortoiseRightsRegistry reg) {
        // Guard: this script is Arc-only. Stops an accidental `--rpc-url base` from deploying with
        // Arc params (and vice-versa — use Deploy.s.sol for Base).
        require(block.chainid == ARC_TESTNET, "DeployArc: not Arc testnet (chainid != 5042002)");

        // ARC_USDC_ADDRESS preferred; default to the known Arc system USDC if unset.
        address usdc = vm.envOr("ARC_USDC_ADDRESS", ARC_USDC);
        // ARC_TREASURY_ADDRESS preferred; fall back to the shared TREASURY_ADDRESS.
        address treasury = vm.envOr("ARC_TREASURY_ADDRESS", vm.envAddress("TREASURY_ADDRESS"));
        address owner = vm.envOr("OWNER_ADDRESS", address(0));

        require(usdc != address(0) && treasury != address(0), "DeployArc: zero usdc/treasury");

        vm.startBroadcast();
        if (owner == address(0)) owner = msg.sender;
        reg = new TortoiseRightsRegistry(IERC20(usdc), treasury, owner);
        vm.stopBroadcast();

        console.log("TortoiseRightsRegistry (Arc):", address(reg));
        console.log("  USDC:    ", usdc);
        console.log("  treasury:", treasury);
        console.log("  owner:   ", owner);
        console.log("  chainid: ", block.chainid);
        console.log("NEXT: set ARC_RIGHTS_REGISTRY_ADDRESS + REGISTRY_CHAIN_ID=5042002 in .env, then re-sign consent on Arc.");
    }
}
