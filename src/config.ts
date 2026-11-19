/** Loading and validation for services.json. */

import { readFile } from 'node:fs/promises';

export type HttpMethod = 'GET' | 'HEAD';

export interface ServiceConfig {
  /** Stable identifier, used as the history key. Lowercase letters, digits and dashes. */
  id: string;
  /** Display name. */
  name: string;
  /** URL to check. Must be http or https. */
  url: string;
  /** Short description shown under the name. */
  description?: string;
  /** Link shown on the page. Defaults to `url`. */
  link?: string;
  method: HttpMethod;
  /** Accepted response status codes. */
  expectStatus: number[];
  /** Optional text the response body must contain (GET only). */
  expectText?: string;
  /** Abort the request after this many milliseconds. */
  timeoutMs: number;
  /** Responses slower than this are reported as degraded. */
  degradedAfterMs: number;
  /** Extra attempts after a failed check before reporting it down. */
  retries: number;
}

export interface StatusConfig {
  title: string;
  /** Maximum number of history entries kept per service. */
  historyLimit: number;
  /** Number of days shown in each uptime bar. */
  days: number;
  services: ServiceConfig[];
}

export const DEFAULTS = {
  title: 'Iridium Status',
  historyLimit: 2880,
  days: 30,
  method: 'GET' as HttpMethod,
  expectStatus: [200],
  timeoutMs: 10_000,
  degradedAfterMs: 3_000,
  retries: 1,
} as const;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown, where: string, fallback: number, allowZero = false): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new ConfigError(`${where} must be a ${allowZero ? 'non-negative' : 'positive'} integer`);
  }
  return value;
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${where} must be a non-empty string`);
  }
  return value;
}

function httpUrl(value: unknown, where: string): string {
  const raw = optionalString(value, where);
  if (raw === undefined) throw new ConfigError(`${where} is required`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${where} is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${where} must use http or https`);
  }
  return raw;
}

function statusList(value: unknown, where: string, fallback: readonly number[]): number[] {
  if (value === undefined) return [...fallback];
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) throw new ConfigError(`${where} must not be empty`);
  for (const code of list) {
    if (typeof code !== 'number' || !Number.isInteger(code) || code < 100 || code > 599) {
      throw new ConfigError(`${where} must contain HTTP status codes between 100 and 599`);
    }
  }
  return list as number[];
}

/** Validate a parsed services.json document and fill in defaults. */
export function parseConfig(input: unknown): StatusConfig {
  if (!isObject(input)) throw new ConfigError('config must be a JSON object');
  const defaults = input.defaults === undefined ? {} : input.defaults;
  if (!isObject(defaults)) throw new ConfigError('defaults must be an object');
  if (!Array.isArray(input.services) || input.services.length === 0) {
    throw new ConfigError('services must be a non-empty array');
  }

  const seen = new Set<string>();
  const services = input.services.map((raw, i): ServiceConfig => {
    const at = `services[${i}]`;
    if (!isObject(raw)) throw new ConfigError(`${at} must be an object`);
    const id = optionalString(raw.id, `${at}.id`);
    if (id === undefined || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new ConfigError(`${at}.id must be lowercase letters, digits and dashes`);
    }
    if (seen.has(id)) throw new ConfigError(`duplicate service id "${id}"`);
    seen.add(id);

    const method = raw.method ?? defaults.method ?? DEFAULTS.method;
    if (method !== 'GET' && method !== 'HEAD') {
      throw new ConfigError(`${at}.method must be GET or HEAD`);
    }
    const expectText = optionalString(raw.expectText, `${at}.expectText`);
    if (expectText !== undefined && method === 'HEAD') {
      throw new ConfigError(`${at}.expectText needs method GET`);
    }
    const name = optionalString(raw.name, `${at}.name`);
    if (name === undefined) throw new ConfigError(`${at}.name is required`);
    const url = httpUrl(raw.url, `${at}.url`);

    const service: ServiceConfig = {
      id,
      name,
      url,
      method,
      expectStatus: statusList(
        raw.expectStatus ?? defaults.expectStatus,
        `${at}.expectStatus`,
        DEFAULTS.expectStatus,
      ),
      timeoutMs: positiveInt(
        raw.timeoutMs ?? defaults.timeoutMs,
        `${at}.timeoutMs`,
        DEFAULTS.timeoutMs,
      ),
      degradedAfterMs: positiveInt(
        raw.degradedAfterMs ?? defaults.degradedAfterMs,
        `${at}.degradedAfterMs`,
        DEFAULTS.degradedAfterMs,
      ),
      retries: positiveInt(
        raw.retries ?? defaults.retries,
        `${at}.retries`,
        DEFAULTS.retries,
        true,
      ),
    };
    const description = optionalString(raw.description, `${at}.description`);
    if (description !== undefined) service.description = description;
    if (raw.link !== undefined) service.link = httpUrl(raw.link, `${at}.link`);
    if (expectText !== undefined) service.expectText = expectText;
    return service;
  });

  return {
    title: optionalString(input.title, 'title') ?? DEFAULTS.title,
    historyLimit: positiveInt(input.historyLimit, 'historyLimit', DEFAULTS.historyLimit),
    days: positiveInt(input.days, 'days', DEFAULTS.days),
    services,
  };
}

/** Read and validate a services.json file. */
export async function loadConfig(path: string): Promise<StatusConfig> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new ConfigError(`cannot read ${path}: ${(error as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${path} is not valid JSON: ${(error as Error).message}`);
  }
  return parseConfig(json);
}
