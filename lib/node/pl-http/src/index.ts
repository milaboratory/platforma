import type { Client, Dispatcher } from 'undici';
import { Agent, ProxyAgent, interceptors } from 'undici';

export function defaultHttpDispatcher(httpProxy?: string): Dispatcher {
  const httpOptions: Client.Options = {
    allowH2: true,
    autoSelectFamily: false,
    headersTimeout: 15e3,
    bodyTimeout: 30e3, // Reset connection after 30 seconds of inactivity, better retry
    keepAliveTimeout: 15e3,
    keepAliveMaxTimeout: 60e3,
  };

  const dispatcher = httpProxy !== undefined
    ? new ProxyAgent({ uri: httpProxy, ...httpOptions })
    : new Agent(httpOptions);

  return dispatcher
    .compose(
      interceptors.dns({
        maxTTL: 60e3, // Cache DNS results for 1 minute (default: 10 seconds)
        affinity: 4,
      }),
      interceptors.retry(),
    );
}
