import type { Client, Dispatcher } from 'undici';
import { Agent, ProxyAgent, interceptors } from 'undici';

export type ProxySettings = {
  url?: string;
  /**
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Proxy-Authorization}.
   */
  auth?: string;
};

/**
 * Creates default HTTP dispatcher that uses given proxy settings.
 * @param httpProxy - Proxy settings to use for HTTP requests.
 * @param firstInterceptors - list of interceptors to be applied before retry interceptor.
 * @returns Dispatcher for HTTP requests.
 * @see {@link https://undici.nodejs.org/#/docs/api/Dispatcher?id=dispatchercomposeinterceptors-interceptor}
 */
export function defaultHttpDispatcher(
  httpProxy?: string | ProxySettings,
  customInterceptors?: Dispatcher.DispatcherComposeInterceptor[],
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

  const defaultInterceptors: Dispatcher.DispatcherComposeInterceptor[] = [interceptors.retry()];
  const appliedInterceptors = customInterceptors ?? defaultInterceptors;

  // Interceptors are called in reverse order for response and in reversed order for request.
  // See https://undici.nodejs.org/#/docs/api/Dispatcher?id=dispatchercomposeinterceptors-interceptor
  return dispatcher.compose(...appliedInterceptors);
}
