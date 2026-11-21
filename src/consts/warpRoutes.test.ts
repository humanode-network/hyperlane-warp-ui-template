import { existsSync, readFileSync } from 'fs';
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

// Registry logos are served from public/ (links.imgPath is empty): each chain and relative token
// logo of the bridge's routes needs its file there.
test('the logos of warpRoutes.yaml are in public/', () => {
  const routes = parse(readFileSync(join(__dirname, 'warpRoutes.yaml'), 'utf8'));
  const ownChains = Object.keys(parse(readFileSync(join(__dirname, 'chains.yaml'), 'utf8')) ?? {});
  const publicDir = join(__dirname, '../../public');
  for (const token of routes?.tokens ?? []) {
    const files: string[] = [];
    if (token.logoURI?.startsWith('/')) files.push(token.logoURI);
    if (!ownChains.includes(token.chainName)) files.push(`/chains/${token.chainName}/logo.svg`);
    for (const file of files) expect(existsSync(join(publicDir, file)), file).toBe(true);
  }
});
