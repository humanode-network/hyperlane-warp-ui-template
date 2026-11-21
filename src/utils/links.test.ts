import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { expect, test } from 'vitest';

import { getTxExplorerUrl } from './links';

const HASH = '0x82d0275dd4fe789d24c0936c5c3b749e3740307b7649f5de948cfd0e5cc54a07';

const multiProvider = new MultiProtocolProvider({
  humanode: {
    name: 'humanode',
    chainId: 5234,
    domainId: 5234,
    protocol: 'ethereum',
    rpcUrls: [{ http: 'https://explorer-rpc-http.mainnet.stages.humanode.io' }],
    blockExplorers: [
      {
        name: 'Subscan',
        url: 'https://humanode.subscan.io',
        apiUrl: 'https://humanode.api.subscan.io',
        family: 'other',
      },
    ],
  },
} as any);

test('Humanode mainnet links to the Subscan EVM transaction', () => {
  expect(getTxExplorerUrl(multiProvider, 'humanode', HASH)).toBe(
    `https://humanode.subscan.io/tx/${HASH}`,
  );
});

test('Humanode testnet5 links to the block in polkadot.js apps', () => {
  expect(getTxExplorerUrl(multiProvider, 'humanodetestnet5', HASH, 17143518)).toBe(
    'https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fexplorer-rpc-ws.testnet5.stages.humanode.io#/explorer/query/17143518',
  );
  expect(getTxExplorerUrl(multiProvider, 'humanodetestnet5', HASH)).toBeNull();
});
