import { ProtocolType } from '@hyperlane-xyz/utils';
import { AccountProvider } from '@hyperlane-xyz/widgets/walletIntegrations/radix/AccountContext';
import '@interchain-ui/react/styles';
import {
  GatewayApiProvider,
  PopupProvider,
  RdtProvider,
} from '@hyperlane-xyz/widgets/walletIntegrations/radix/RadixProviders';
import { type PropsWithChildren } from 'react';

import { config } from '../../../consts/config';
import { E2EAutoConnectRadix } from '../_e2e/E2EAutoConnectRadix';
import { isE2EMode } from '../_e2e/isE2E';
import { getRadixClients } from './radixClients';

export function RadixWalletContext({ children }: PropsWithChildren<unknown>) {
  // Humanode bridge: without Radix in walletProtocols the toolkit is not created, so the page
  // does not contact the Radix gateway. The widgets' Radix hooks fall back to empty contexts.
  if (!config.walletProtocols?.includes(ProtocolType.Radix)) return <>{children}</>;
  const { gatewayApi, rdt } = getRadixClients();

  return (
    <RdtProvider value={rdt}>
      <GatewayApiProvider value={gatewayApi}>
        <AccountProvider>
          <PopupProvider>
            {isE2EMode() && <E2EAutoConnectRadix />}
            {children}
          </PopupProvider>
        </AccountProvider>
      </GatewayApiProvider>
    </RdtProvider>
  );
}
