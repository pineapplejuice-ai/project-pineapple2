/** Central, validated runtime configuration. Secrets only ever come from the environment. */
const env = process.env;
const isProd = env.NODE_ENV === 'production';

function secret(name: string, devDefault: string): string {
  const v = env[name];
  if (v && v.length >= 32) return v;
  if (isProd) throw new Error(`${name} must be set to a random value of at least 32 characters in production`);
  return v ?? devDefault;
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgresql://nexbill_app:nexbill_app@localhost:5432/nexbill?schema=public',
  jwtSecret: secret('JWT_SECRET', 'dev-only-jwt-secret-change-me-dev-only-jwt-secret'),
  accessTokenTtlSec: Number(env.ACCESS_TOKEN_TTL_SEC ?? 900),
  refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  webOrigin: (env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
  publicWebUrl: env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
  /** expose one-time tokens in API responses so flows are testable without a mail provider */
  exposeDevTokens: !isProd && env.EXPOSE_DEV_TOKENS !== 'false',
  rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 600),
  authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE ?? 20),
  /** GSTR-1 B2C-large threshold (invoice value). Verify against the current notification. */
  b2cLargeThreshold: Number(env.GST_B2CL_THRESHOLD ?? 100000),
};
