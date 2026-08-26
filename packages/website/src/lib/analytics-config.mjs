import { privacyConfig } from './privacy-config.mjs';

// Build-time configuration only. An empty ID ships no analytics UI or runtime.
export function analyticsConfig(env = process.env) {
  const measurementId = (env.PUBLIC_GA_MEASUREMENT_ID || '').trim();
  if (measurementId && !/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error('PUBLIC_GA_MEASUREMENT_ID must be a GA4 measurement ID (G-…), not a GTM container ID.');
  }
  if (measurementId && !privacyConfig(env).ready) {
    throw new Error('Before enabling analytics, set PUBLIC_SITE_OPERATOR, PUBLIC_PRIVACY_EMAIL, and PUBLIC_ANALYTICS_RETENTION_MONTHS and review the privacy notice.');
  }
  return { measurementId };
}
