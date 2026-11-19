import { ethereum } from '@hyperlane-xyz/registry';
import { expect, test, vi } from 'vitest';

const readContract = vi.fn();
const transports: string[] = [];

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    http: (url: string) => {
      transports.push(url);
      return actual.http(url);
    },
    createPublicClient: () => ({ readContract }),
  };
});

const { readChainalysisSanctioned } = await import('./useIsAccountChainalysisSanctioned');

// The bridge's wagmi config has no Ethereum, so the oracle must not be read through wagmi.
test('reads the Chainalysis oracle over the registry Ethereum RPC', async () => {
  readContract.mockResolvedValue(true);
  const address = '0x7F367cC41522cE07553e823bf3be79A889DEbe1B';
  expect(await readChainalysisSanctioned(address)).toBe(true);
  expect(transports).toContain(ethereum.rpcUrls[0].http);
  expect(readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      address: '0x40C57923924B5c5c5455c48D93317139ADDaC8fb',
      functionName: 'isSanctioned',
      args: [address],
    }),
  );
});
