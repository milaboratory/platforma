import { Agent, Client, Dispatcher, ProxyAgent } from 'undici';
import CacheableLookup from 'cacheable-lookup';
import { Resolver } from 'node:dns/promises';

export function defaultHttpDispatcher(httpProxy?: string): Dispatcher {
  const cacheableLookup = new CacheableLookup({
    resolver: new Resolver({ timeout: 1500, tries: 4 })
  });

  const httpOptions: Client.Options = {
    allowH2: true,
    headersTimeout: 5e3,
    keepAliveTimeout: 3e3,
    keepAliveMaxTimeout: 60e3,
    maxRedirections: 6,
    connect: {
      lookup: cacheableLookup.lookup.bind(cacheableLookup) as any
    }
  };

  if (httpProxy !== undefined) return new ProxyAgent({ uri: httpProxy, ...httpOptions });
  else return new Agent(httpOptions);
}