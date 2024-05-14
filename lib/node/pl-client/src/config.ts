export interface PlClientConfig {
  hostAndPort: string;

  /** If set, client will expose a nested object under a field with name `alternative_root_${alternativeRoot}` as a
   * client root. */
  alternativeRoot?: string;

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

type PlConfigOverrides = Partial<Pick<
  PlClientConfig,
  'ssl' | 'defaultRequestTimeout' | 'defaultTransactionTimeout' | 'httpProxy' | 'grpcProxy'
>>

function parseInt(s: string | null | undefined): number | undefined {
  if (!s)
    return undefined;
  return Number.parseInt(s);
}

export function plAddressToConfig(address: string, overrides: PlConfigOverrides = {}): PlClientConfig {
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
    alternativeRoot: url.searchParams.get('alternative-root') ?? undefined,
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

export interface AuthInformation {
  /** Absent token means anonymous access */
  jwtToken?: string;
}

export interface AuthOps {
  /** Initial authorization information */
  authInformation: AuthInformation,
  /** Will be executed after successful authorization information refresh */
  readonly onUpdate?: (newInfo: AuthInformation) => void,
  /** Will be executed if error encountered during token update */
  readonly onUpdateError?: (error: unknown) => void
}

export type PlConnectionStatus = 'OK' | 'Disconnected' | 'Unauthenticated'
export type PlConnectionStatusListener = (status: PlConnectionStatus) => void;
