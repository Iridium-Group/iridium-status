/** HTTP checks for a single service. */

import type { ServiceConfig } from './config.ts';

export type ServiceState = 'up' | 'degraded' | 'down';

export interface CheckResult {
  id: string;
  state: ServiceState;
  /** ISO 8601 time the check finished. */
  checkedAt: string;
  /** HTTP status code, or null when no response arrived. */
  status: number | null;
  /** Time to the final response, in milliseconds, or null when no response arrived. */
  latencyMs: number | null;
  /** Number of attempts made. */
  attempts: number;
  /** Why the check failed or was degraded. */
  error?: string;
}

export interface CheckOptions {
  /** Replaces the global fetch, for tests. */
  fetch?: typeof fetch;
  /** Clock, for tests. */
  now?: () => Date;
  userAgent?: string;
}

export const USER_AGENT = 'iridium-status/0.1 (+https://github.com/Iridium-Group/iridium-status)';

/** Largest response body read when looking for `expectText`. */
const MAX_BODY_BYTES = 1024 * 1024;

interface Attempt {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error?: string;
}

async function readText(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (read >= limit) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return `timed out after ${timeoutMs} ms`;
    }
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const code = (cause as Error & { code?: string }).code;
      return code ? `${code}: ${cause.message}` : cause.message;
    }
    return error.message;
  }
  return String(error);
}

async function attempt(service: ServiceConfig, options: CheckOptions): Promise<Attempt> {
  const doFetch = options.fetch ?? fetch;
  const started = performance.now();
  const signal = AbortSignal.timeout(service.timeoutMs);
  try {
    const response = await doFetch(service.url, {
      method: service.method,
      redirect: 'follow',
      signal,
      headers: {
        'user-agent': options.userAgent ?? USER_AGENT,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });
    const latencyMs = Math.round(performance.now() - started);
    const status = response.status;

    if (!service.expectStatus.includes(status)) {
      await response.body?.cancel().catch(() => {});
      return {
        ok: false,
        status,
        latencyMs,
        error: `expected status ${service.expectStatus.join(' or ')}, got ${status}`,
      };
    }
    if (service.expectText !== undefined) {
      const text = response.body ? await readText(response.body, MAX_BODY_BYTES) : '';
      if (!text.includes(service.expectText)) {
        return {
          ok: false,
          status,
          latencyMs,
          error: `response did not contain "${service.expectText}"`,
        };
      }
    } else {
      await response.body?.cancel().catch(() => {});
    }
    return { ok: true, status, latencyMs };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: null,
      error: describeError(error, service.timeoutMs),
    };
  }
}

/** Check one service, retrying failed attempts up to `service.retries` times. */
export async function checkService(
  service: ServiceConfig,
  options: CheckOptions = {},
): Promise<CheckResult> {
  const now = options.now ?? (() => new Date());
  let result: Attempt = { ok: false, status: null, latencyMs: null };
  let attempts = 0;
  while (attempts <= service.retries) {
    attempts++;
    result = await attempt(service, options);
    if (result.ok) break;
  }

  let state: ServiceState = 'down';
  let error = result.error;
  if (result.ok) {
    state = 'up';
    if (result.latencyMs !== null && result.latencyMs > service.degradedAfterMs) {
      state = 'degraded';
      error = `slow response: ${result.latencyMs} ms (limit ${service.degradedAfterMs} ms)`;
    }
  }

  const check: CheckResult = {
    id: service.id,
    state,
    checkedAt: now().toISOString(),
    status: result.status,
    latencyMs: result.latencyMs,
    attempts,
  };
  if (error !== undefined) check.error = error;
  return check;
}

/** Check every service concurrently. Results keep the order of `services`. */
export function checkAll(
  services: readonly ServiceConfig[],
  options: CheckOptions = {},
): Promise<CheckResult[]> {
  return Promise.all(services.map((service) => checkService(service, options)));
}
