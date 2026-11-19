import { warpRouteWhitelist } from '../../src/consts/warpRouteWhitelist';

// Picks known-good warp route IDs for embed ?routes= tests.
// Prefers whitelist entries on prod branches; falls back to registry routes on main.
export function resolveTestRoutes(): { primary: string; secondary: string; skip: boolean } {
  if (warpRouteWhitelist === null) {
    return { primary: 'USDC/aleo', secondary: 'ETH/aleo', skip: false };
  }
  if (warpRouteWhitelist.length === 0) {
    return { primary: '', secondary: '', skip: true };
  }
  return {
    primary: warpRouteWhitelist[0],
    secondary: warpRouteWhitelist[1] ?? warpRouteWhitelist[0],
    skip: false,
  };
}

// Forks with an empty whitelist (e.g. the Humanode bridge) drop every canonical
// registry route and ship only their own EVM routes, so tests that need
// non-EVM chains/wallets or specific canonical routes are skipped there.
export const onlyCustomRoutes = resolveTestRoutes().skip;
