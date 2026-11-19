// The SDK patch (patches/@hyperlane-xyz__sdk@39.1.0.patch) reports a native route's warp
// fee as tokenFeeQuote (zero address) instead of folding it into the IGP quote, so the fee
// shows as its own "Token Fee" line. The value sent with transferRemote is unchanged.
import {
  EvmHypNativeAdapter,
  EvmHypSyntheticAdapter,
  MultiProtocolProvider,
  TokenAmount,
  WarpCore,
} from '@hyperlane-xyz/sdk';
import { describe, expect, test } from 'vitest';

const ZERO = '0x0000000000000000000000000000000000000000';
const ROUTER = '0x4444444444444444444444444444444444444444';
const RECIPIENT = '0x0000000000000000000000005555555555555555555555555555555555555555';
const AMOUNT = 10n ** 18n; // 1 HMND
const FEE = 3n * 10n ** 15n; // 0.3%
const IGP = 3604168000000000000n;

const multiProvider = new MultiProtocolProvider({
  humanodetestnet5: {
    name: 'humanodetestnet5',
    chainId: 14853,
    domainId: 14853,
    protocol: 'ethereum',
    rpcUrls: [{ http: 'http://localhost' }],
  },
} as any);

// Quotes as the routers return them: [IGP, amount + fee, external fee].
function stub(adapter: any, quotes: [string, bigint][]) {
  adapter.getContractPackageVersion = async () => '12.3.0';
  adapter.contract = { 'quoteTransferRemote(uint32,bytes32,uint256)': async () => quotes };
  return adapter;
}

describe('quoteTransferRemoteGas with the 0.3% LinearFee', () => {
  test('native HMND on Humanode: fee reported apart from the IGP quote', async () => {
    const adapter = stub(
      new EvmHypNativeAdapter('humanodetestnet5', multiProvider, { token: ROUTER }),
      [
        [ZERO, IGP],
        [ZERO, AMOUNT + FEE],
        [ZERO, 0n],
      ],
    );
    const quote = await adapter.quoteTransferRemoteGas({
      destination: 84532,
      recipient: RECIPIENT,
      amount: AMOUNT,
    });
    expect(quote.igpQuote.amount).toBe(IGP);
    expect(quote.tokenFeeQuote).toEqual({ addressOrDenom: ZERO, amount: FEE });
  });

  test('synthetic ERC20 route: unchanged, fee in the router token', async () => {
    const adapter = stub(
      new EvmHypSyntheticAdapter('humanodetestnet5', multiProvider, { token: ROUTER }),
      [
        [ZERO, IGP],
        [ROUTER, AMOUNT + FEE],
        [ROUTER, 0n],
      ],
    );
    const quote = await adapter.quoteTransferRemoteGas({
      destination: 84532,
      recipient: RECIPIENT,
      amount: AMOUNT,
    });
    expect(quote.igpQuote.amount).toBe(IGP);
    expect(quote.tokenFeeQuote).toEqual({ addressOrDenom: ROUTER, amount: FEE });
  });
});

describe('WarpCore.validateTokenBalances on the native route (patched)', () => {
  // A 1000 HMND transfer needs amount + IGP + 0.3% fee + local gas. A balance that covers
  // everything but the fee must be rejected in the form, not in the wallet.
  const E = 10n ** 18n;
  const BIG = 1000n * E;
  const LOCAL = E / 100n;
  const twoChains = new MultiProtocolProvider({
    humanodetestnet5: {
      name: 'humanodetestnet5',
      chainId: 14853,
      domainId: 14853,
      protocol: 'ethereum',
      rpcUrls: [{ http: 'http://localhost' }],
      nativeToken: { name: 'Humanode', symbol: 'HMND', decimals: 18 },
    },
    basesepolia: {
      name: 'basesepolia',
      chainId: 84532,
      domainId: 84532,
      protocol: 'ethereum',
      rpcUrls: [{ http: 'http://localhost' }],
      nativeToken: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
  } as any);
  const warpCore = WarpCore.FromConfig(twoChains, {
    tokens: [
      {
        addressOrDenom: ROUTER,
        chainName: 'basesepolia',
        connections: [{ token: `ethereum|humanodetestnet5|${ROUTER}` }],
        decimals: 18,
        name: 'Humanode',
        standard: 'EvmHypSynthetic',
        symbol: 'HMND',
      },
      {
        addressOrDenom: ROUTER,
        chainName: 'humanodetestnet5',
        connections: [{ token: `ethereum|basesepolia|${ROUTER}` }],
        decimals: 18,
        name: 'Humanode',
        standard: 'EvmHypNative',
        symbol: 'HMND',
      },
    ],
  } as any);
  const token: any = warpCore.tokens.find((t) => t.chainName === 'humanodetestnet5');
  token.getHypAdapter = () => {
    const a: any = new EvmHypNativeAdapter('humanodetestnet5', twoChains, { token: ROUTER });
    a.getContractPackageVersion = async () => '12.3.0';
    a.contract = {
      'quoteTransferRemote(uint32,bytes32,uint256)': async (
        _d: unknown,
        _r: unknown,
        amt: string,
      ) => [
        [ZERO, IGP],
        [ZERO, BigInt(amt) + (BigInt(amt) * 3n) / 1000n],
        [ZERO, 0n],
      ],
    };
    return a;
  };
  (warpCore as any).getLocalTransferFeeAmount = async () => new TokenAmount(LOCAL, token);
  const sender = '0x5555555555555555555555555555555555555555';

  test('balance short by the fee only: rejected', async () => {
    token.getBalance = async () => new TokenAmount(BIG + IGP + LOCAL + E, token);
    const result = await (warpCore as any).validateTokenBalances(
      token.amount(BIG),
      'basesepolia',
      sender,
      sender,
    );
    expect(result).not.toBeNull();
  });

  test('balance covering amount, fee, IGP and gas: accepted', async () => {
    token.getBalance = async () => new TokenAmount(BIG + 3n * E + IGP + LOCAL + E, token);
    const result = await (warpCore as any).validateTokenBalances(
      token.amount(BIG),
      'basesepolia',
      sender,
      sender,
    );
    expect(result).toBeNull();
  });
});
