import { describe, expect, it } from 'vitest';

import { config } from '../../consts/config';
import { PROTOCOL_OPTIONS } from './WalletProtocolModal';

describe('WalletProtocolModal', () => {
  it('has a modal option for every protocol enabled in config', () => {
    const options = PROTOCOL_OPTIONS.map((option) => option.protocol);
    for (const protocol of config.walletProtocols ?? []) expect(options).toContain(protocol);
  });
});
