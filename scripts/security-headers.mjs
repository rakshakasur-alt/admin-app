import { readFileSync } from 'node:fs';

const config = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
);
const headerRules = config.headers?.find((rule) => rule.source === '/(.*)')?.headers;

if (!headerRules) {
  throw new Error('Could not find the default security headers in vercel.json.');
}

export function securityHeaders() {
  return Object.fromEntries(headerRules.map(({ key, value }) => [key, value]));
}
