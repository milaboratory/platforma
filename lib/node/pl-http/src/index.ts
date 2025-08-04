import type { Client, Dispatcher } from 'undici';
import { Agent, ProxyAgent } from 'undici';

export function defaultHttpDispatcher(httpProxy?: string): Dispatcher {
  const httpOptions: Client.Options = {
    allowH2: true,
    headersTimeout: 15e3,
    keepAliveTimeout: 15e3,
    keepAliveMaxTimeout: 60e3,
  };

  const dispatcher = httpProxy !== undefined ? new ProxyAgent({ uri: httpProxy, ...httpOptions }) : new Agent(httpOptions);
  return dispatcher; // .compose(interceptors.dns())
}
