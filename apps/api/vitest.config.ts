import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false, globalSetup: ['test/global-setup.ts'],
    env: {
      DATABASE_URL: 'postgresql://nexbill_app:nexbill_app@localhost:5432/nexbill_test?schema=public',
      AUTH_RATE_LIMIT_PER_MINUTE: '100000', RATE_LIMIT_PER_MINUTE: '1000000', NODE_ENV: 'test',
    } },
  plugins: [swc.vite({ jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' } })],
});
