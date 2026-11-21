import { beforeEach, describe, expect, test, vi } from 'vitest';

import { readDelivery } from './useMessageDeliveryStatus';

const readContract = vi.fn();
const getLogs = vi.fn();

const client = { readContract, getLogs } as unknown as Parameters<typeof readDelivery>[0];

const MAILBOX = '0x1111111111111111111111111111111111111111';
const MSG_ID = '0x2222222222222222222222222222222222222222222222222222222222222222';
const DEST_TX = '0x3333333333333333333333333333333333333333333333333333333333333333';

describe('readDelivery', () => {
  beforeEach(() => {
    readContract.mockReset();
    getLogs.mockReset();
  });

  test('undelivered: processedAt is 0, no log query', async () => {
    readContract.mockResolvedValue(0);
    expect(await readDelivery(client, MAILBOX, MSG_ID)).toEqual({
      isDelivered: false,
    });
    expect(getLogs).not.toHaveBeenCalled();
  });

  test('delivered: reads ProcessId in the one delivery block', async () => {
    readContract.mockResolvedValue(1234567);
    getLogs.mockResolvedValue([{ transactionHash: DEST_TX }]);
    expect(await readDelivery(client, MAILBOX, MSG_ID)).toEqual({
      isDelivered: true,
      destinationTxHash: DEST_TX,
      destinationBlockNumber: 1234567,
    });
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MAILBOX,
        functionName: 'processedAt',
        args: [MSG_ID],
      }),
    );
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MAILBOX,
        args: { messageId: MSG_ID },
        fromBlock: 1234567n,
        toBlock: 1234567n,
      }),
    );
  });

  test('delivered but the log read fails: throws, the hook polls again', async () => {
    readContract.mockResolvedValue(1234567);
    getLogs.mockRejectedValue(new Error('rpc down'));
    await expect(readDelivery(client, MAILBOX, MSG_ID)).rejects.toThrow('rpc down');
  });

  test('delivered but no log returned: delivered, no hash', async () => {
    readContract.mockResolvedValue(1234567);
    getLogs.mockResolvedValue([]);
    const result = await readDelivery(client, MAILBOX, MSG_ID);
    expect(result.isDelivered).toBe(true);
    expect(result.destinationTxHash).toBeUndefined();
  });
});
