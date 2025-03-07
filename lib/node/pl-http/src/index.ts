import { Agent, Client, Dispatcher, ProxyAgent, interceptors } from 'undici';

export function defaultHttpDispatcher(httpProxy?: string): Dispatcher {
  const httpOptions: Client.Options = {
    allowH2: true,
    headersTimeout: 15e3,
    keepAliveTimeout: 15e3,
    keepAliveMaxTimeout: 60e3,
    maxRedirections: 10
  };

  const dispatcher = httpProxy !== undefined ? new ProxyAgent({ uri: httpProxy, ...httpOptions }) : new Agent(httpOptions);
  return dispatcher; //.compose(interceptors.dns())
}
