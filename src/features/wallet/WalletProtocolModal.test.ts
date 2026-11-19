import { ProtocolType } from '@hyperlane-xyz/utils';
import { describe, expect, it } from 'vitest';

import { config } from '../../consts/config';
import { PROTOCOL_OPTIONS } from './WalletProtocolModal';

describe('WalletProtocolModal', () => {
  // Humanode bridge: walletProtocols is EVM-only, so this applies only where Tron is enabled.
  it.skipIf(!config.walletProtocols?.includes(ProtocolType.Tron))(
    'includes tron in the modal options when tron is enabled in config',
    () => {
      expect(config.walletProtocols).toContain(ProtocolType.Tron);
      expect(PROTOCOL_OPTIONS.map((option) => option.protocol)).toContain(ProtocolType.Tron);
    },
  );
});
