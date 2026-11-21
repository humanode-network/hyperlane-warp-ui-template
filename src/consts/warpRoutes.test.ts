import { readFileSync } from 'fs';
import { join } from 'path';

import { expect, test } from 'vitest';
import { parse } from 'yaml';

import { warpRouteWhitelist } from './warpRouteWhitelist';

// An empty whitelist drops every registry route: without routes of our own the app fails to
// start ("No warp route configs provided").
test('an empty warpRouteWhitelist needs routes in warpRoutes.yaml', () => {
  if (warpRouteWhitelist?.length !== 0) return;
  const routes = parse(readFileSync(join(__dirname, 'warpRoutes.yaml'), 'utf8'));
  expect(routes?.tokens?.length).toBeGreaterThan(0);
});
