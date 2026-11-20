import { ProtocolType } from '@hyperlane-xyz/utils';
import { TransactionReceiptNotFoundError, encodeEventTopics, parseAbi } from 'viem';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useStore } from '../store';
import { type TransferContext, TransferStatus } from '../transfer/types';
import { recheckStoredTransfers, recheckTransfer } from './recheckTransfers';

const ORIGIN_MAILBOX = '0x1111111111111111111111111111111111111111';
const DEST_MAILBOX = '0x2222222222222222222222222222222222222222';
const TX = '0x3333333333333333333333333333333333333333333333333333333333333333';
const MSG_ID = '0x4444444444444444444444444444444444444444444444444444444444444444';
const DEST_TX = '0x5555555555555555555555555555555555555555555555555555555555555555';

const dispatchTopics = encodeEventTopics({
  abi: parseAbi(['event DispatchId(bytes32 indexed messageId)']),
  eventName: 'DispatchId',
  args: { messageId: MSG_ID },
});
const dispatchLog = (address: string) => ({ address, topics: dispatchTopics, data: '0x' });

const origin = { getTransactionReceipt: vi.fn(), readContract: vi.fn(), getLogs: vi.fn() };
const destination = { getTransactionReceipt: vi.fn(), readContract: vi.fn(), getLogs: vi.fn() };
const recheck = () =>
  recheckTransfer(origin as any, destination as any, ORIGIN_MAILBOX, DEST_MAILBOX, TX);

describe('recheckTransfer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('no receipt yet: no change', async () => {
    origin.getTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: TX }),
    );
    expect(await recheck()).toBeNull();
  });

  test('reverted origin tx: failed', async () => {
    origin.getTransactionReceipt.mockResolvedValue({ status: 'reverted', logs: [] });
    expect(await recheck()).toEqual({ status: TransferStatus.Failed });
  });

  test('sent, not delivered yet: confirmed with the message id', async () => {
    origin.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [dispatchLog(ORIGIN_MAILBOX)],
    });
    destination.readContract.mockResolvedValue(0);
    expect(await recheck()).toEqual({
      status: TransferStatus.ConfirmedTransfer,
      msgId: MSG_ID,
      originBlockNumber: 100,
    });
    expect(destination.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: DEST_MAILBOX, args: [MSG_ID] }),
    );
  });

  test('delivered: delivered with the delivery tx', async () => {
    origin.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [dispatchLog(ORIGIN_MAILBOX)],
    });
    destination.readContract.mockResolvedValue(555);
    destination.getLogs.mockResolvedValue([{ transactionHash: DEST_TX }]);
    expect(await recheck()).toEqual({
      status: TransferStatus.Delivered,
      msgId: MSG_ID,
      originBlockNumber: 100,
      destinationTxHash: DEST_TX,
      destinationBlockNumber: 555,
    });
  });

  test('a DispatchId from another contract does not count', async () => {
    origin.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [dispatchLog('0x9999999999999999999999999999999999999999')],
    });
    expect(await recheck()).toBeNull();
  });
});

describe('recheckStoredTransfers', () => {
  const transfer = (over: Partial<TransferContext>): TransferContext => ({
    status: TransferStatus.Failed,
    origin: 'humanodetestnet5',
    destination: 'basesepolia',
    originTokenAddressOrDenom: '0x01',
    destTokenAddressOrDenom: '0x02',
    sender: '0x03',
    recipient: '0x04',
    amount: '1',
    timestamp: 1,
    originTxHash: TX,
    ...over,
  });
  const multiProvider = {
    tryGetProtocol: () => ProtocolType.Ethereum,
    getViemProvider: (chain: string) => (chain === 'humanodetestnet5' ? origin : destination),
  } as any;
  const delivered = () => {
    origin.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [dispatchLog(ORIGIN_MAILBOX)],
    });
    destination.readContract.mockResolvedValue(555);
    destination.getLogs.mockResolvedValue([{ transactionHash: DEST_TX }]);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    useStore.setState({
      chainAddresses: {
        humanodetestnet5: { mailbox: ORIGIN_MAILBOX },
        basesepolia: { mailbox: DEST_MAILBOX },
      } as any,
    });
  });

  test('a failed transfer that went through becomes delivered', async () => {
    useStore.setState({ transfers: [transfer({})] });
    delivered();
    await recheckStoredTransfers(multiProvider);
    expect(useStore.getState().transfers[0]).toMatchObject({
      status: TransferStatus.Delivered,
      msgId: MSG_ID,
      destinationTxHash: DEST_TX,
    });
  });

  test('a sent transfer without a message id gets one', async () => {
    useStore.setState({ transfers: [transfer({ status: TransferStatus.ConfirmedTransfer })] });
    origin.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [dispatchLog(ORIGIN_MAILBOX)],
    });
    destination.readContract.mockResolvedValue(0);
    await recheckStoredTransfers(multiProvider);
    expect(useStore.getState().transfers[0]).toMatchObject({
      status: TransferStatus.ConfirmedTransfer,
      msgId: MSG_ID,
    });
  });

  test('skips delivered, hashless and same-chain transfers', async () => {
    useStore.setState({
      transfers: [
        transfer({ status: TransferStatus.Delivered }),
        transfer({ originTxHash: undefined }),
        transfer({ destination: 'humanodetestnet5' }),
      ],
    });
    await recheckStoredTransfers(multiProvider);
    expect(origin.getTransactionReceipt).not.toHaveBeenCalled();
  });

  test('does not overwrite a transfer that changed during the recheck', async () => {
    useStore.setState({ transfers: [transfer({})] });
    delivered();
    origin.getTransactionReceipt.mockImplementation(async () => {
      useStore.setState({ transfers: [transfer({ status: TransferStatus.ConfirmedTransfer })] });
      return { status: 'reverted', logs: [] };
    });
    await recheckStoredTransfers(multiProvider);
    expect(useStore.getState().transfers[0].status).toBe(TransferStatus.ConfirmedTransfer);
  });
});
