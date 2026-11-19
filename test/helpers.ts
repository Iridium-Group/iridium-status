import { parseConfig, type ServiceConfig } from '../src/config.ts';

/** A validated service config with test-friendly defaults. */
export function service(overrides: Record<string, unknown> & { url: string }): ServiceConfig {
  const config = parseConfig({
    services: [{ id: 'svc', name: 'Service', timeoutMs: 1000, retries: 0, ...overrides }],
  });
  return config.services[0]!;
}
