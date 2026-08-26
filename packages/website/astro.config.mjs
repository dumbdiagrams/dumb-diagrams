import { defineConfig } from 'astro/config';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import { dgmLanguage } from './src/lib/dgm-language.mjs';

const site = process.env.SITE_URL;
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    ...(site ? [sitemap()] : []),
    // No worker or third-party requests until tracking is deliberately added.
    ...(process.env.ENABLE_PARTYTOWN === 'true'
      ? [partytown({ config: { forward: ['dataLayer.push'], lib: `${base.replace(/\/$/, '')}/~partytown/` } })]
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
