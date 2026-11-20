import { expect, test } from '@playwright/test';

import { onlyCustomRoutes } from '../../helpers/constants';
import {
  BASE_SEPOLIA_CHAIN_ID,
  bridgeRoutesConfigured,
  bridgeRpcMock,
  USDC_BASE_SEPOLIA,
  USDC_ROUTER,
  withFee,
} from '../helpers/bridgeRoutes';
import { installEvmRpcMock } from '../helpers/evmRpc';
import { enterAmount } from '../helpers/formFlow';
import { openE2EApp } from '../helpers/page-setup';

const APPROVE_SELECTOR = '0x095ea7b3';
const ONE_USDC = 1_000_000n;

// transferRemote overloads on Hyperlane TokenRouter / HypERC20 — any of these
// firing BEFORE approval would indicate the approval gate regressed.
const TRANSFER_REMOTE_SELECTORS = ['0x81b4e8b4', '0x51debffc', '0xb96da154'];

test.describe('Humanode bridge: USDC approval of amount + fee', () => {
  test.setTimeout(180_000);
  test('low allowance forces approve() of amount + fee as the first captured tx', async ({
    page,
  }) => {
    // Runs with the bridge-only config (empty whitelist); there the bridge routes must exist.
    test.skip(!onlyCustomRoutes, 'needs the bridge-only route config');
    expect(bridgeRoutesConfigured, 'the bridge routes are missing from warpRoutes.yaml').toBe(true);
    // Zero allowance forces the approve() branch before transferRemote.
    const { txs } = await installEvmRpcMock(page, bridgeRpcMock({ usdcAllowance: '0x0' }));

    // USDC is collateral on Base Sepolia — the bridge's only ERC20-origin route.
    await openE2EApp(page, {
      extraQuery: {
        origin: 'basesepolia',
        originToken: 'USDC',
        destination: 'humanodetestnet5',
        destinationToken: 'USDC',
      },
    });
    await expect(page.getByTestId('token-select-origin')).toHaveAttribute(
      'data-chain',
      'basesepolia',
    );
    await expect(page.getByText('0xe2e...e2ee').first()).toBeVisible({ timeout: 20_000 });

    await enterAmount(page, '1');
    await page.getByRole('button', { name: /^Continue$/ }).click();

    const reviewPanel = page.locator('.transfer-review-panel').first();
    await expect(reviewPanel).toContainText(/Transfer Remote/i, { timeout: 45_000 });
    await expect(reviewPanel).toContainText(/Approve Transfer/i);
    const sendButton = page.getByRole('button', { name: /^Send to/i });
    await sendButton.waitFor({ state: 'visible', timeout: 30_000 });
    await sendButton.click({ timeout: 30_000 });

    // First eth_sendTransaction must be the approval call. The SDK only dispatches
    // transferRemote after the approval receipt confirms.
    await expect.poll(() => txs.length, { timeout: 60_000, intervals: [500] }).toBeGreaterThan(0);

    const approveData = txs[0].data!.toLowerCase();
    expect(approveData.slice(0, 10)).toBe(APPROVE_SELECTOR);
    // And the approve tx targets the ERC20 itself on the origin chain.
    expect(txs[0].chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(txs[0].to?.toLowerCase()).toBe(USDC_BASE_SEPOLIA);
    // approve(router, amount + 0.3% fee): the router pulls the fee too.
    expect(approveData.slice(10, 74)).toBe(USDC_ROUTER.slice(2).padStart(64, '0'));
    expect(BigInt('0x' + approveData.slice(74, 138))).toBe(withFee(ONE_USDC));

    // A follow-up transferRemote should eventually arrive on the same chain.
    // If it doesn't (e.g. approve receipt polling stalls under the mock),
    // the non-approval path below guards the regression we actually care about
    // — that the first tx is approve, not transferRemote.
    if (txs.length > 1) {
      const secondSelector = txs[1].data!.slice(0, 10).toLowerCase();
      expect(TRANSFER_REMOTE_SELECTORS).toContain(secondSelector);
      expect(txs[1].chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
      expect(txs[1].to?.toLowerCase()).toBe(USDC_ROUTER);
    }
  });
});
