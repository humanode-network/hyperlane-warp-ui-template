import { ethereum } from '@hyperlane-xyz/registry';
import { useEthereumAccount } from '@hyperlane-xyz/widgets/walletIntegrations/ethereum';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, isAddress } from 'viem';

import { useMultiProvider } from '../../chains/hooks';

// https://go.chainalysis.com/chainalysis-oracle-docs.html
const ORACLE_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'addr',
        type: 'address',
      },
    ],
    name: 'isSanctioned',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
const ORACLE_ADDRESS = '0x40C57923924B5c5c5455c48D93317139ADDaC8fb';

// The oracle lives on Ethereum. It is read over Ethereum's RPC from the registry, not through
// wagmi: wagmi only knows the chains of the app's routes, and Ethereum is not one of them for
// the Humanode bridge (a wagmi read on chain 1 failed and counted as "not sanctioned").
const ethereumRpcUrl = ethereum.rpcUrls[0].http;

export function useIsAccountChainalysisSanctioned() {
  const multiProvider = useMultiProvider();
  const evmAddress = useEthereumAccount(multiProvider).addresses[0]?.address;

  const sanctioned = useQuery({
    queryKey: ['chainalysisSanctioned', evmAddress],
    queryFn: () => readChainalysisSanctioned(evmAddress as `0x${string}`),
    enabled: !!evmAddress && isAddress(evmAddress),
  });

  return !!sanctioned.data;
}

export function readChainalysisSanctioned(address: `0x${string}`): Promise<boolean> {
  return createPublicClient({ transport: http(ethereumRpcUrl) }).readContract({
    abi: ORACLE_ABI,
    functionName: 'isSanctioned',
    args: [address],
    address: ORACLE_ADDRESS,
  });
}
