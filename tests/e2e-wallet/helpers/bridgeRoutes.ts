import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

import { MOCK_EVM_ADDRESS } from './constants';
import { ROUTER_COLLATERAL_SEED, type InstallEvmRpcMockOptions } from './evmRpc';

// The Humanode bridge's routes, read from src/consts/warpRoutes.yaml: HMND native on
// humanodetestnet5 <-> synthetic on basesepolia, and USDC collateral on basesepolia <->
// synthetic on humanodetestnet5. Both charge a 0.3% LinearFee. The routes are added to
// warpRoutes.yaml once the bridge is deployed; until then `bridgeRoutesConfigured` is false
// and the bridge tests skip.
export const HUMANODE_CHAIN_ID = 14853;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

interface RouteToken {
  chainName: string;
  symbol: string;
  standard: string;
  addressOrDenom: string;
  collateralAddressOrDenom?: string;
}
const routeTokens: RouteToken[] =
  parse(readFileSync(join(__dirname, '../../../src/consts/warpRoutes.yaml'), 'utf8'))?.tokens ??
  [];
const find = (chainName: string, symbol: string) =>
  routeTokens.find((t) => t.chainName === chainName && t.symbol === symbol);
const hmndHumanode = find('humanodetestnet5', 'eHMND'); // eHMND on Humanode, HMND on Base
const hmndBase = find('basesepolia', 'HMND');
const usdcBase = find('basesepolia', 'USDC');
const usdcHumanode = find('humanodetestnet5', 'USDC');

export const bridgeRoutesConfigured = !!(hmndHumanode && hmndBase && usdcBase && usdcHumanode);
const lower = (address?: string) => (address ?? '').toLowerCase();
// Origin routers used by the tests: HMND from Humanode, USDC from Base Sepolia.
export const HMND_ROUTER = lower(hmndHumanode?.addressOrDenom);
const HMND_ROUTER_BASE = lower(hmndBase?.addressOrDenom);
export const USDC_ROUTER = lower(usdcBase?.addressOrDenom);
const USDC_ROUTER_HUMANODE = lower(usdcHumanode?.addressOrDenom);
// The USDC route's collateral on Base Sepolia (Circle's test USDC).
export const USDC_BASE_SEPOLIA = lower(usdcBase?.collateralAddressOrDenom);
export const ZERO_ADDRESS = '0x' + '0'.repeat(40);
export const FEE_BPS = 30;

// IGP quotes (wei of the origin's native token) for the mock: realistic magnitudes, as the
// testnet routers returned on the experimental stand.
export const HMND_IGP_WEI = 0x320493b2df2231e0n;
export const USDC_IGP_WEI = 0x11aec2316a0n;

const MOCK_OWNER = MOCK_EVM_ADDRESS.toLowerCase();

// Mock RPC config for both bridge chains. `usdcAllowance` overrides the mock
// wallet's USDC allowance on Base Sepolia (default: max → no approval).
export function bridgeRpcMock(
  opts: { usdcAllowance?: string; usdcBalance?: string } = {},
): InstallEvmRpcMockOptions {
  return {
    chainUrlMap: [
      { chainId: HUMANODE_CHAIN_ID, urlMatch: /testnet5\.stages\.humanode\.io/i },
      { chainId: BASE_SEPOLIA_CHAIN_ID, urlMatch: /sepolia\.base\.org|base-sepolia/i },
    ],
    // 1000 HMND / ETH for the mock wallet, enough for amount + fee + IGP.
    nativeBalances: { [MOCK_OWNER]: '0x3635c9adc5dea00000' },
    erc20: {
      [`${BASE_SEPOLIA_CHAIN_ID}:${USDC_BASE_SEPOLIA}`]: {
        decimals: 6,
        symbol: 'USDC',
        // Router collateral must cover any Humanode → Base USDC transfer.
        defaultBalance: ROUTER_COLLATERAL_SEED,
        balances: { [MOCK_OWNER]: opts.usdcBalance ?? '0x3b9aca00' }, // 1000 USDC
        allowance: opts.usdcAllowance,
      },
      // Synthetic USDC on Humanode (the router is the ERC20).
      [`${HUMANODE_CHAIN_ID}:${USDC_ROUTER_HUMANODE}`]: {
        decimals: 6,
        symbol: 'USDC',
        balances: { [MOCK_OWNER]: '0x3b9aca00' },
      },
      // Synthetic HMND on Base Sepolia.
      [`${BASE_SEPOLIA_CHAIN_ID}:${HMND_ROUTER_BASE}`]: {
        decimals: 18,
        symbol: 'HMND',
        balances: { [MOCK_OWNER]: '0x3635c9adc5dea00000' },
      },
    },
    // The deployed routers report 12.3.0, which makes the SDK quote fees
    // through quoteTransferRemote.
    packageVersion: '12.3.0',
    // HypCollateral.wrappedToken() — only the USDC router on Base Sepolia is
    // a collateral router.
    wrappedTokenByChainId: { [BASE_SEPOLIA_CHAIN_ID]: USDC_BASE_SEPOLIA },
    transferQuotes: {
      [`${HUMANODE_CHAIN_ID}:${HMND_ROUTER}`]: {
        igp: '0x' + HMND_IGP_WEI.toString(16),
        feeToken: ZERO_ADDRESS,
        feeBps: FEE_BPS,
      },
      [`${BASE_SEPOLIA_CHAIN_ID}:${HMND_ROUTER_BASE}`]: {
        igp: '0x' + HMND_IGP_WEI.toString(16),
        feeToken: HMND_ROUTER_BASE,
        feeBps: FEE_BPS,
      },
      [`${BASE_SEPOLIA_CHAIN_ID}:${USDC_ROUTER}`]: {
        igp: '0x' + USDC_IGP_WEI.toString(16),
        feeToken: USDC_BASE_SEPOLIA,
        feeBps: FEE_BPS,
      },
      [`${HUMANODE_CHAIN_ID}:${USDC_ROUTER_HUMANODE}`]: {
        igp: '0x' + USDC_IGP_WEI.toString(16),
        feeToken: USDC_ROUTER_HUMANODE,
        feeBps: FEE_BPS,
      },
    },
  };
}

// Amount the warp fee adds on top of `amount` (raw units).
export function withFee(amount: bigint): bigint {
  return amount + (amount * BigInt(FEE_BPS)) / 10_000n;
}
