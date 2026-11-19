/** A local HTTP server on 127.0.0.1 for checker tests. Never touches the real network. */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Fixture {
  url: (path: string) => string;
  /** Requests received, as "METHOD /path". */
  requests: string[];
  close: () => Promise<void>;
}

/**
 * Routes:
 *   /ok            200 "hello iridium"
 *   /status/:code  that status code
 *   /slow/:ms      200 after a delay
 *   /hang          never answers
 *   /flaky         503 on the first request, 200 after
 *   /redirect      302 to /ok
 */
export async function startFixture(): Promise<Fixture> {
  const requests: string[] = [];
  let flakyCount = 0;
  const hanging = new Set<ServerResponse>();

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url ?? '/';
    requests.push(`${req.method} ${path}`);
    const [, route, arg] = path.split('/');
    if (route === 'ok') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('hello iridium');
    } else if (route === 'status') {
      res.writeHead(Number(arg)).end(`status ${arg}`);
    } else if (route === 'slow') {
      setTimeout(() => res.writeHead(200).end('slow'), Number(arg));
    } else if (route === 'hang') {
      hanging.add(res);
    } else if (route === 'flaky') {
      flakyCount++;
      res.writeHead(flakyCount === 1 ? 503 : 200).end();
    } else if (route === 'redirect') {
      res.writeHead(302, { location: '/ok' }).end();
    } else {
      res.writeHead(404).end('not found');
    }
  };

  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    requests,
    close: async () => {
      for (const res of hanging) res.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A free port with nothing listening on it. */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}/`;
}
