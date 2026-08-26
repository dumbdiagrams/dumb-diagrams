import { defineConfig } from 'astro/config';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import { dgmLanguage } from './src/lib/dgm-language.mjs';
import { analyticsConfig } from './src/lib/analytics-config.mjs';
import { privacyConfig } from './src/lib/privacy-config.mjs';

const site = process.env.SITE_URL;
const base = process.env.BASE_PATH || '/';
const { measurementId } = analyticsConfig();

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  // Keep shared scripts cacheable across documentation navigations instead of
  // duplicating them inline in every HTML response.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    ...(site ? [sitemap({ filter: page => privacyConfig().ready || !page.endsWith('/privacy/') })] : []),
    // Let the integration derive the public base URL and copy files to the
    // dist root; overriding `lib` also changes its on-disk destination.
    ...(measurementId || process.env.ENABLE_PARTYTOWN === 'true'
      ? [partytown({ config: { debug: false, forward: ['dataLayer.push'] } })]
      : []),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      langs: [dgmLanguage],
    },
  },
  server: { port: 4321 },
  devToolbar: { enabled: false },
});
