import { useIsAccountOfacSanctioned } from './useIsAccountOfacSanctioned';

// Humanode bridge: only the OFAC list, which is downloaded whole and checked in the browser.
// The Chainalysis oracle check sent the wallet address to public Ethereum RPCs.
export function useIsAccountSanctioned() {
  return useIsAccountOfacSanctioned();
}
