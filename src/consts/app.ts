import { Color } from '../styles/Color';

export type UiThemeMode = 'light' | 'dark';

export const APP_NAME = 'Humanode Bridge';
export const APP_DESCRIPTION = 'Bridge eHMND and USDC between Humanode and Base';
// The site's public https origin, for link previews (og:url, og:image); set at build time.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
export const BRAND_COLOR = Color.primary['500'];

export const UI_THEME_STORAGE_KEY = 'warp-ui-theme';
export const DEFAULT_UI_THEME_MODE: UiThemeMode = 'light';
