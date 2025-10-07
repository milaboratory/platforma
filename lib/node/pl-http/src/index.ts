import type { Client, Dispatcher } from 'undici';
import { Agent, ProxyAgent, interceptors } from 'undici';

export type ProxySettings = {
  url?: string;
  /**
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Proxy-Authorization}.
   */
  auth?: string;
};

export function defaultHttpDispatcher(
  httpProxy?: string | ProxySettings,
): Dispatcher {
  const httpOptions: Client.Options = {
    // allowH2: true, // Turning this on makes downloads almost 10x as slow
    autoSelectFamily: false,
    headersTimeout: 15e3,
    bodyTimeout: 30e3, // Reset connection after 30 seconds of inactivity, better retry
    keepAliveTimeout: 15e3,
    keepAliveMaxTimeout: 60e3,
  };

  const proxy = typeof httpProxy === 'string' ? { url: httpProxy } : httpProxy;

  const dispatcher = proxy?.url
    ? new ProxyAgent({ uri: proxy.url, token: proxy.auth, ...httpOptions })
    : new Agent(httpOptions)
      .compose(
        interceptors.dns({
          maxTTL: 60e3, // Cache DNS results for 1 minute (default: 10 seconds)
          affinity: 4,
        }),
      );

  return dispatcher.compose(interceptors.retry());
}
