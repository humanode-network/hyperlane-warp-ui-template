import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { toBase64 } from '@hyperlane-xyz/utils';

import { config } from '../consts/config';
import { links } from '../consts/links';
import { isPermissionlessChain } from '../features/chains/utils';

export function getHypExplorerLink(
  multiProvider: MultiProtocolProvider,
  chain: ChainName,
  msgId?: string,
) {
  if (!config.enableExplorerLink || !chain || !msgId) return null;
  const baseLink = `${links.explorer}/message/${msgId}`;

  if (!isPermissionlessChain(multiProvider, chain)) return baseLink;

  const chainMetadata = multiProvider.tryGetChainMetadata(chain);
  if (!chainMetadata) return baseLink;

  const serializedConfig = toBase64([chainMetadata]);
  if (!serializedConfig) return baseLink;

  const params = new URLSearchParams({ chains: serializedConfig });
  return `${baseLink}?${params.toString()}`;
}

// Chains without an EVM explorer: link to polkadot.js apps by block number, since it finds
// blocks, not EVM transaction hashes. On Humanode the EVM and Substrate block numbers match.
const POLKADOT_JS_RPC_BY_CHAIN: Record<ChainName, string> = {
  humanodetestnet5: 'wss://explorer-rpc-ws.testnet5.stages.humanode.io',
};

export function getTxExplorerUrl(
  multiProvider: MultiProtocolProvider,
  chain: ChainName,
  hash: string,
  blockNumber?: number,
): string | null {
  const polkadotJsRpc = POLKADOT_JS_RPC_BY_CHAIN[chain];
  if (polkadotJsRpc) {
    if (!blockNumber) return null;
    const rpc = encodeURIComponent(polkadotJsRpc);
    return `https://polkadot.js.org/apps/?rpc=${rpc}#/explorer/query/${blockNumber}`;
  }
  return multiProvider.tryGetExplorerTxUrl(chain, { hash });
}
