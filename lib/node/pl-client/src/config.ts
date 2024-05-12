export interface PlConnectionConfig {
  hostAndPort: string;
  // Not implementing custom ssl validation logic for now.
  // Implementing it in a correct way is really a nontrivial thing, real use-cases should be considered.
  ssl: boolean;
  defaultRequestTimeout: number;
  defaultTransactionTimeout: number;

  authTTLSeconds: number;
  authMaxRefreshSeconds: number;

  grpcProxy?: string;
  httpProxy?: string;
}

export const DEFAULT_REQUEST_TIMEOUT = 1000;
export const DEFAULT_TX_TIMEOUT = 10_000;
export const DEFAULT_TOKEN_TTL_SECONDS = 31 * 24 * 60 * 60;
export const DEFAULT_AUTH_MAX_REFRESH = 12 * 24 * 60 * 60;

export type ConnectionDataOverrides = Partial<Pick<
  PlConnectionConfig,
  'ssl' | 'defaultRequestTimeout' | 'defaultTransactionTimeout' | 'httpProxy' | 'grpcProxy'
>>

function parseInt(s: string | null | undefined): number | undefined {
  if (!s)
    return undefined;
  return Number.parseInt(s);
}

export function plAddressToConfig(address: string, overrides: ConnectionDataOverrides = {}): PlConnectionConfig {
  if (address.indexOf('://') === -1)
    // non-url address
    return {
      hostAndPort: address,
      ssl: false,
      defaultRequestTimeout: DEFAULT_REQUEST_TIMEOUT,
      defaultTransactionTimeout: DEFAULT_TX_TIMEOUT,
      authTTLSeconds: DEFAULT_TOKEN_TTL_SECONDS,
      authMaxRefreshSeconds: DEFAULT_AUTH_MAX_REFRESH,
      ...overrides
    };

  const url = new URL(address);

  if (url.protocol !== 'https:'
    && url.protocol !== 'http:'
    && url.protocol !== 'grpc:'
    && url.protocol !== 'tls:')
    throw new Error(`Unexpected URL schema: ${url.protocol}`);

  if (url.pathname !== '/' && url.pathname !== '')
    throw new Error(`Unexpected URL path: ${url.pathname}`);

  return {
    hostAndPort: url.host, // this also includes port
    ssl: url.protocol === 'https:' || url.protocol === 'tls:',
    defaultRequestTimeout: parseInt(url.searchParams.get('request-timeout')) ?? DEFAULT_REQUEST_TIMEOUT,
    defaultTransactionTimeout: parseInt(url.searchParams.get('tx-timeout')) ?? DEFAULT_TX_TIMEOUT,
    authTTLSeconds: DEFAULT_TOKEN_TTL_SECONDS,
    authMaxRefreshSeconds: DEFAULT_AUTH_MAX_REFRESH,
    grpcProxy: url.searchParams.get('grpc-proxy') ?? undefined,
    httpProxy: url.searchParams.get('http-proxy') ?? undefined,
    ...overrides
  };
}
