import type { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { type Hex, type PublicClient, isAddressEqual, parseAbi, parseEventLogs } from 'viem';

import { logger } from '../../utils/logger';
import { useStore } from '../store';
import { TransferStatus } from '../transfer/types';
import { readDelivery } from './useMessageDeliveryStatus';

// Humanode bridge: the history lives in the browser only, and the explorer that used to correct
// it is off. A reload while a transfer awaits its receipt marks it failed, and a closed modal
// leaves it "sent". The sidebar rechecks these transfers on chain by their origin tx hash.
const mailboxEvents = parseAbi(['event DispatchId(bytes32 indexed messageId)']);
const RECHECK_STATUSES = [TransferStatus.Failed, TransferStatus.ConfirmedTransfer];

type Client = Pick<PublicClient, 'getTransactionReceipt' | 'readContract' | 'getLogs'>;

export interface RecheckResult {
  status: TransferStatus;
  msgId?: string;
  originBlockNumber?: number;
  destinationTxHash?: string;
  destinationBlockNumber?: number;
}

/**
 * The transfer's state on chain: failed if the origin tx reverted, sent until the destination
 * Mailbox processes its message, then delivered. Null while the origin tx has no receipt.
 */
export async function recheckTransfer(
  origin: Client,
  destination: Client,
  originMailbox: Hex,
  destinationMailbox: Hex,
  originTxHash: Hex,
): Promise<RecheckResult | null> {
  let receipt;
  try {
    receipt = await origin.getTransactionReceipt({ hash: originTxHash });
  } catch (error) {
    // By name: the SDK's viem client may come from another viem copy than this module's
    if ((error as Error).name === 'TransactionReceiptNotFoundError') return null;
    throw error;
  }
  if (receipt.status === 'reverted') return { status: TransferStatus.Failed };

  const [dispatch] = parseEventLogs({
    abi: mailboxEvents,
    eventName: 'DispatchId',
    logs: receipt.logs.filter((log) => isAddressEqual(log.address, originMailbox)),
  });
  if (!dispatch) {
    logger.error('No DispatchId from the Mailbox in the transfer tx', originTxHash);
    return null;
  }
  const msgId = dispatch.args.messageId;
  const originBlockNumber = Number(receipt.blockNumber);

  const delivery = await readDelivery(destination, destinationMailbox, msgId);
  if (!delivery.isDelivered) {
    return { status: TransferStatus.ConfirmedTransfer, msgId, originBlockNumber };
  }
  return {
    status: TransferStatus.Delivered,
    msgId,
    originBlockNumber,
    destinationTxHash: delivery.destinationTxHash,
    destinationBlockNumber: delivery.destinationBlockNumber,
  };
}

/** Rechecks the stored failed and sent EVM transfers that have an origin tx hash. */
export async function recheckStoredTransfers(multiProvider: MultiProtocolProvider) {
  const { transfers, chainAddresses } = useStore.getState();
  for (const [index, transfer] of transfers.entries()) {
    const { origin, destination, originTxHash, status } = transfer;
    if (!originTxHash || !RECHECK_STATUSES.includes(status) || origin === destination) continue;
    if (
      multiProvider.tryGetProtocol(origin) !== ProtocolType.Ethereum ||
      multiProvider.tryGetProtocol(destination) !== ProtocolType.Ethereum
    )
      continue;
    const originMailbox = chainAddresses[origin]?.mailbox;
    const destinationMailbox = chainAddresses[destination]?.mailbox;
    if (!originMailbox || !destinationMailbox) {
      logger.error('No Mailbox address to recheck the transfer', origin, destination);
      continue;
    }
    let result: RecheckResult | null;
    try {
      result = await recheckTransfer(
        multiProvider.getViemProvider(origin),
        multiProvider.getViemProvider(destination),
        originMailbox as Hex,
        destinationMailbox as Hex,
        originTxHash as Hex,
      );
    } catch (error) {
      logger.warn('Failed to recheck the transfer', originTxHash, error);
      continue;
    }
    // Write only if the transfer did not change meanwhile: the open modal or another recheck
    // may have updated it
    const { transfers: current, updateTransferStatus } = useStore.getState();
    const now = current[index];
    if (!result || now?.originTxHash !== originTxHash || now.status !== status) continue;
    if (result.status !== status || (result.msgId && !now.msgId))
      updateTransferStatus(index, result.status, result);
  }
}
