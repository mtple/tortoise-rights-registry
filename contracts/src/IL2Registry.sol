// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal interface to the Durin L2Registry needed by our registrar.
/// @dev Durin: github.com/namestonehq/durin. The registry inherits an ENS resolver
///      (TextResolver/AddrResolver), so `data` entries in createSubnode are ABI-encoded
///      calls to setText(bytes32,string,string) / setAddr(bytes32,uint256,bytes), executed
///      against the new node atomically at mint.
interface IL2Registry {
    /// @param node  the parent base node (registry.baseNode()).
    /// @param label the subname label (e.g. "flux" for flux.tortmusic.eth).
    /// @param owner the address that will own the new subname.
    /// @param data  pre-encoded resolver setter calldata (setText/setAddr) run on the new node.
    function createSubnode(bytes32 node, string calldata label, address owner, bytes[] calldata data)
        external
        returns (bytes32);

    function baseNode() external view returns (bytes32);

    function makeNode(bytes32 node, string calldata label) external view returns (bytes32);

    /// @notice True if the label is available (Durin requires 3+ char labels).
    function available(string calldata label) external view returns (bool);
}
