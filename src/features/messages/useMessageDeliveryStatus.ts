import type { ChainName, MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type Hex, type PublicClient, parseAbi, parseAbiItem } from 'viem';

import { logger } from '../../utils/logger';
import { useStore } from '../store';

// Humanode bridge: delivery is read from the destination chain's Mailbox, not the Hyperlane
// explorer API, which does not index the bridge's chains. processedAt is not in the SDK's
// IMailbox interface, hence the local ABI.
const mailboxAbi = parseAbi(['function processedAt(bytes32 messageId) view returns (uint48)']);
const processIdEvent = parseAbiItem('event ProcessId(bytes32 indexed messageId)');

const POLL_INTERVAL_MS = 10_000;

export interface MessageDeliveryResult {
  /** Whether the message has been delivered on destination */
  isDelivered: boolean;
  /** Destination transaction hash (only when delivered) */
  destinationTxHash?: string;
  /** Destination block number (only when delivered) */
  destinationBlockNumber?: number;
  /** Origin timestamp in ms */
  originTimestamp?: number;
  /** Origin block height from GraphQL (fallback for page refresh) */
  originBlockHeight?: number;
  /** Loading state */
  isLoading: boolean;
}

/**
 * Reads a message's delivery from the destination Mailbox (see readDelivery).
 * Polls while the modal is open and message is not yet delivered.
 */
export function useMessageDeliveryStatus(
  msgId: string | undefined,
  destination: ChainName | undefined,
  isOpen: boolean,
  multiProvider: MultiProtocolProvider,
): MessageDeliveryResult {
  const mailbox = useStore((s) =>
    destination ? s.chainAddresses[destination]?.mailbox : undefined,
  );
  useEffect(() => {
    if (msgId && destination && !mailbox)
      logger.error(
        'No Mailbox address for the destination chain, cannot track delivery',
        destination,
      );
  }, [msgId, destination, mailbox]);
  const { data, isLoading } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- multiProvider is stable, adding it causes unnecessary refetches
    queryKey: ['messageDelivery', msgId, destination, mailbox],
    queryFn: async () => {
      if (!msgId || !destination || !mailbox) return null;
      try {
        return await readDelivery(
          multiProvider.getViemProvider(destination),
          mailbox as Hex,
          msgId as Hex,
        );
      } catch (error) {
        logger.error('Failed to read message delivery status', error);
        return null;
      }
    },
    enabled: !!msgId && !!mailbox && isOpen,
    staleTime: 30_000,
    refetchInterval: (query) => {
      // Stop polling once delivered and the delivery transaction is known
      if (query.state.data?.isDelivered && query.state.data.destinationTxHash) return false;
      return POLL_INTERVAL_MS;
    },
    refetchOnWindowFocus: false,
  });

  return {
    isDelivered: data?.isDelivered ?? false,
    destinationTxHash: data?.destinationTxHash,
    destinationBlockNumber: data?.destinationBlockNumber,
    originTimestamp: data?.originTimestamp,
    originBlockHeight: data?.originBlockHeight,
    isLoading,
  };
}

/**
 * Mailbox.processedAt(msgId) gives the delivery block (0 while undelivered); the ProcessId log
 * in that one block gives the delivery transaction. A failed or empty log read still reports
 * the delivery, without the hash, and the hook polls again for it.
 */
export async function readDelivery(
  client: Pick<PublicClient, 'readContract' | 'getLogs'>,
  mailbox: Hex,
  msgId: Hex,
): Promise<Omit<MessageDeliveryResult, 'isLoading'>> {
  const block = await client.readContract({
    address: mailbox,
    abi: mailboxAbi,
    functionName: 'processedAt',
    args: [msgId],
  });
  if (!block) return { isDelivered: false };
  const blockNumber = BigInt(block);
  let destinationTxHash: string | undefined;
  try {
    const logs = await client.getLogs({
      address: mailbox,
      event: processIdEvent,
      args: { messageId: msgId },
      fromBlock: blockNumber,
      toBlock: blockNumber,
    });
    destinationTxHash = logs[0]?.transactionHash;
  } catch (error) {
    logger.warn('Delivered, but the ProcessId log could not be read yet', error);
  }
  return {
    isDelivered: true,
    destinationTxHash,
    destinationBlockNumber: Number(blockNumber),
  };
}
