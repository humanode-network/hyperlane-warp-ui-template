import { readFileSync } from 'fs';
import { join } from 'path';

import { expect, test } from 'vitest';
import { parse } from 'yaml';

const read = (file: string) => parse(readFileSync(join(__dirname, file), 'utf8'));

// Delivery status and message ids are read from our own Mailbox on each chain of a route.
// A chain without one would show transfers as pending forever. The routes and Mailbox are
// added once the bridge is deployed; with no routes there is nothing to check.
test('every chain of the bridge routes has our Mailbox', () => {
  const routes = read('warpRoutes.yaml');
  const addresses = read('chainAddresses.yaml');
  const chains = new Set<string>(routes.tokens.map((t: { chainName: string }) => t.chainName));
  for (const chain of chains) {
    expect(addresses[chain]?.mailbox, chain).toMatch(/^0x[0-9a-fA-F]{40}$/);
  }
});
