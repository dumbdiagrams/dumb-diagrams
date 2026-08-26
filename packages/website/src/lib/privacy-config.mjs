export function privacyConfig(env = process.env) {
  const operator = (env.PUBLIC_SITE_OPERATOR || '').trim();
  const email = (env.PUBLIC_PRIVACY_EMAIL || '').trim();
  const retentionMonths = (env.PUBLIC_ANALYTICS_RETENTION_MONTHS || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('PUBLIC_PRIVACY_EMAIL must be a valid contact email.');
  if (retentionMonths && !['2', '14'].includes(retentionMonths)) throw new Error('PUBLIC_ANALYTICS_RETENTION_MONTHS must match the GA4 property: 2 or 14.');
  return { operator, email, retentionMonths, ready: Boolean(operator && email && retentionMonths) };
}
