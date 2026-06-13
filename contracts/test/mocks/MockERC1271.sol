// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Minimal ERC-1271 smart-contract wallet for tests: it "owns" an EOA signer and
///      returns the magic value iff the signature recovers to that signer. This is the
///      Base Account (Coinbase Smart Wallet) shape that consent verification must handle (R5).
contract MockERC1271 {
    using ECDSA for bytes32;

    bytes4 internal constant MAGIC = 0x1626ba7e; // bytes4(keccak256("isValidSignature(bytes32,bytes)"))
    address public immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = hash.tryRecover(signature);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) {
            return MAGIC;
        }
        return 0xffffffff;
    }
}
