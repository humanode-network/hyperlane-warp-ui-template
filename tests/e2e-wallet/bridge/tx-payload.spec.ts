import { expect, test } from '@playwright/test';

import { onlyCustomRoutes } from '../../helpers/constants';
import {
  BASE_SEPOLIA_CHAIN_ID,
  bridgeRoutesConfigured,
  bridgeRpcMock,
  HMND_IGP_WEI,
  HMND_ROUTER,
  HUMANODE_CHAIN_ID,
  withFee,
} from '../helpers/bridgeRoutes';
import { MOCK_EVM_ADDRESS } from '../helpers/constants';
import { installEvmRpcMock } from '../helpers/evmRpc';
import { enterAmount } from '../helpers/formFlow';
import { openE2EApp } from '../helpers/page-setup';

// transferRemote overloads on Hyperlane TokenRouter / HypERC20.
const TRANSFER_REMOTE_SELECTORS = [
  '0x81b4e8b4', // transferRemote(uint32,bytes32,uint256)
  '0x51debffc', // transferRemote(uint32,bytes32,uint256,bytes,address)
  '0xb96da154', // transferRemote(uint32,bytes32,uint256,uint256)
];
const ONE_HMND = 10n ** 18n;

test.describe('Humanode bridge: HMND transferRemote payload', () => {
  // Full review + send flow needs extra time for fee resolution and tx confirmation.
  test.setTimeout(180_000);
  test('default Humanode→Base Sepolia HMND Send emits transferRemote with amount + fee + IGP as value', async ({
    page,
  }) => {
    // Runs with the bridge-only config (empty whitelist); there the bridge routes must exist.
    test.skip(!onlyCustomRoutes, 'needs the bridge-only route config');
    expect(bridgeRoutesConfigured, 'the bridge routes are missing from warpRoutes.yaml').toBe(true);
    const { txs } = await installEvmRpcMock(page, bridgeRpcMock());

    await openE2EApp(page);
    await expect(page.getByText('0xe2e...e2ee').first()).toBeVisible({ timeout: 20_000 });

    await enterAmount(page, '1');
    await page.getByRole('button', { name: /^Continue$/ }).click();

    // Review panel ready.
    await expect(page.locator('.transfer-review-panel').first()).toContainText(/Transfer Remote/i, {
      timeout: 45_000,
    });

    const sendButton = page.getByRole('button', { name: /^Send to/i });
    await sendButton.waitFor({ state: 'visible', timeout: 30_000 });
    await sendButton.click({ timeout: 30_000 });

    // eth_sendTransaction reaches the RPC mock.
    await expect.poll(() => txs.length, { timeout: 60_000, intervals: [500] }).toBeGreaterThan(0);

    // Native route: no approval, a single transferRemote on the HMND router.
    expect(txs).toHaveLength(1);
    const captured = txs[0];
    expect(captured.chainId).toBe(HUMANODE_CHAIN_ID);
    expect(captured.to?.toLowerCase()).toBe(HMND_ROUTER);
    expect(captured.data).toBeDefined();
    const data = captured.data!.toLowerCase();
    expect(TRANSFER_REMOTE_SELECTORS).toContain(data.slice(0, 10));
    // transferRemote(destination, recipient, amount): Base Sepolia domain,
    // the mock wallet as recipient, the entered amount (fee is not deducted).
    expect(BigInt('0x' + data.slice(10, 74))).toBe(BigInt(BASE_SEPOLIA_CHAIN_ID));
    expect(data.slice(74, 138)).toBe(
      MOCK_EVM_ADDRESS.toLowerCase().replace(/^0x/, '').padStart(64, '0'),
    );
    expect(BigInt('0x' + data.slice(138, 202))).toBe(ONE_HMND);
    // msg.value = amount + 0.3% warp fee + IGP.
    expect(BigInt(captured.value!)).toBe(withFee(ONE_HMND) + HMND_IGP_WEI);
  });
});
