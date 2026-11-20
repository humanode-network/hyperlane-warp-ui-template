import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { getWagmiChainConfigs } from '@hyperlane-xyz/widgets/walletIntegrations/ethereum';
import { RainbowKitProvider, connectorsForWallets, lightTheme } from '@rainbow-me/rainbowkit';

import '@rainbow-me/rainbowkit/styles.css';
import {
  argentWallet,
  coinbaseWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { PropsWithChildren, useMemo } from 'react';
import { createClient, fallback, http } from 'viem';
import { WagmiProvider, createConfig, mock } from 'wagmi';

import { APP_NAME } from '../../../consts/app';
import { config } from '../../../consts/config';
import { Color } from '../../../styles/Color';
import { useMultiProvider } from '../../chains/hooks';
import { MOCK_EVM_ADDRESS } from '../_e2e/constants';
import { E2EAutoConnectEvm } from '../_e2e/E2EAutoConnectEvm';
import { isE2EMode } from '../_e2e/isE2E';

function initWagmi(multiProvider: MultiProtocolProvider, e2e: boolean) {
  const chains = getWagmiChainConfigs(multiProvider);

  const baseConnectors = connectorsForWallets(
    [
      {
        groupName: 'Recommended',
        // No injectedWallet either: it has the same window.ethereum fallback. EIP-6963 lists the
        // installed wallets.
        wallets: [metaMaskWallet, walletConnectWallet, ledgerWallet],
      },
      {
        groupName: 'More',
        // Humanode bridge: no binanceWallet. With the Binance extension installed and another
        // wallet (e.g. Rabby) owning window.ethereum, RainbowKit's Binance connector falls back to
        // window.ethereum, wraps that other wallet's provider and takes over its connection
        // ("Binance Wallet" shown after connecting Rabby). EIP-6963 still lists Binance Wallet.
        wallets: [coinbaseWallet, rainbowWallet, trustWallet, argentWallet],
      },
    ],
    { appName: APP_NAME, projectId: config.walletConnectProjectId },
  );

  const connectors = e2e
    ? [mock({ accounts: [MOCK_EVM_ADDRESS], features: { reconnect: true } })]
    : baseConnectors;

  const wagmiConfig = createConfig({
    // Splice to make annoying wagmi type happy
    chains: [chains[0], ...chains.splice(1)],
    connectors,
    client({ chain }) {
      const transport = fallback(chain.rpcUrls.default.http.map((chainHttp) => http(chainHttp)));
      return createClient({ chain, transport });
    },
  });

  return { wagmiConfig, chains };
}

export function EvmWalletContext({ children }: PropsWithChildren<unknown>) {
  const multiProvider = useMultiProvider();
  const e2e = isE2EMode();
  const { wagmiConfig } = useMemo(() => initWagmi(multiProvider, e2e), [multiProvider, e2e]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={lightTheme({
          accentColor: Color.primary['500'],
          borderRadius: 'small',
          fontStack: 'system',
        })}
      >
        {e2e && <E2EAutoConnectEvm />}
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
