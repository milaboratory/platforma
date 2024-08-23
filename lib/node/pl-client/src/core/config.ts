/** Base configuration structure for PL client */
export interface PlClientConfig {
  /** Port and host of remote pl server */
  hostAndPort: string;

  /** If set, client will expose a nested object under a field with name `alternative_root_${alternativeRoot}` as a
   * client root. */
  alternativeRoot?: string;

  /** If true, client will establish tls connection to the server, using default
   * CA of node instance. */
  // Not implementing custom ssl validation logic for now.
  // Implementing it in a correct way is really nontrivial thing,
  // real use-cases should be considered.
  ssl: boolean;

  /** Default timeout in milliseconds for unary calls, like ping and login. */
  defaultRequestTimeout: number;
  /** Default timeout in milliseconds for transaction, should be adjusted for
   * long round-trip connections. */
  defaultTransactionTimeout: number;

  /** Controls what TTL will be requested from the server, when new JWT token
   * is requested. */
  authTTLSeconds: number;
  /** If token is older than this time, it will be refreshed regardless of its
   * expiration time. */
  authMaxRefreshSeconds: number;

  /** Proxy server URL to use for pl connection. */
  grpcProxy?: string;
  /** Proxy server URL to use for http connections of pl drivers, like file
   * downloading. */
  httpProxy?: string;

  /** Username extracted from pl URL. Ignored by {@link PlClient}, picked up by {@link defaultPlClient}. */
  user?: string;
  /** Password extracted from pl URL. Ignored by {@link PlClient}, picked up by {@link defaultPlClient}. */
  password?: string;

  /** Artificial delay introduced after write transactions completion, to
   * somewhat throttle the load on pl. Delay introduced after sync, if requested. */
  txDelay: number;

  /** Last resort measure to solve complicated race conditions in pl. */
  forceSync: boolean;
}

export const DEFAULT_REQUEST_TIMEOUT = 1000;
export const DEFAULT_TX_TIMEOUT = 10_000;
export const DEFAULT_TOKEN_TTL_SECONDS = 31 * 24 * 60 * 60;
export const DEFAULT_AUTH_MAX_REFRESH = 12 * 24 * 60 * 60;

type PlConfigOverrides = Partial<
  Pick<
    PlClientConfig,
    'ssl' | 'defaultRequestTimeout' | 'defaultTransactionTimeout' | 'httpProxy' | 'grpcProxy'
  >
>;

function parseInt(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  return Number.parseInt(s);
}

/** Parses pl url and creates a config object that can be passed to
 * {@link PlClient} of {@link UnauthenticatedPlClient}. */
export function plAddressToConfig(
  address: string,
  overrides: PlConfigOverrides = {}
): PlClientConfig {
  if (address.indexOf('://') === -1)
    // non-url address
    return {
      hostAndPort: address,
      ssl: false,
      defaultRequestTimeout: DEFAULT_REQUEST_TIMEOUT,
      defaultTransactionTimeout: DEFAULT_TX_TIMEOUT,
      authTTLSeconds: DEFAULT_TOKEN_TTL_SECONDS,
      authMaxRefreshSeconds: DEFAULT_AUTH_MAX_REFRESH,
      txDelay: 0,
      forceSync: false,
      ...overrides
    };

  const url = new URL(address);

  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'http:' &&
    url.protocol !== 'grpc:' &&
    url.protocol !== 'tls:'
  )
    throw new Error(`Unexpected URL schema: ${url.protocol}`);

  if (url.pathname !== '/' && url.pathname !== '')
    throw new Error(`Unexpected URL path: ${url.pathname}`);

  return {
    hostAndPort: url.host, // this also includes port
    alternativeRoot: url.searchParams.get('alternative-root') ?? undefined,
    ssl: url.protocol === 'https:' || url.protocol === 'tls:',
    defaultRequestTimeout:
      parseInt(url.searchParams.get('request-timeout')) ?? DEFAULT_REQUEST_TIMEOUT,
    defaultTransactionTimeout: parseInt(url.searchParams.get('tx-timeout')) ?? DEFAULT_TX_TIMEOUT,
    authTTLSeconds: DEFAULT_TOKEN_TTL_SECONDS,
    authMaxRefreshSeconds: DEFAULT_AUTH_MAX_REFRESH,
    grpcProxy: url.searchParams.get('grpc-proxy') ?? undefined,
    httpProxy: url.searchParams.get('http-proxy') ?? undefined,
    user: url.username === '' ? undefined : url.username,
    password: url.password === '' ? undefined : url.password,
    txDelay: Number(url.searchParams.get('tx-delay')) ?? 0,
    forceSync: Boolean(url.searchParams.get('force-sync')) ?? false,
    ...overrides
  };
}

/**
 * Authorization data / JWT Token.
 * Absent JWT Token tells the client to connect as anonymous user.
 * */
export interface AuthInformation {
  /** Absent token means anonymous access */
  jwtToken?: string;
}

export const AnonymousAuthInformation: AuthInformation = {};

/** Authorization related settings to pass to {@link PlClient}. */
export interface AuthOps {
  /** Initial authorization information */
  authInformation: AuthInformation;
  /** Will be executed after successful authorization information refresh */
  readonly onUpdate?: (newInfo: AuthInformation) => void;
  /** Will be executed if auth-related error happens during normal client operation */
  readonly onAuthError?: () => void;
  /** Will be executed if error encountered during token update */
  readonly onUpdateError?: (error: unknown) => void;
}

/** Connection status. */
export type PlConnectionStatus = 'OK' | 'Disconnected' | 'Unauthenticated';

/** Listener that will be called each time connection status changes. */
export type PlConnectionStatusListener = (status: PlConnectionStatus) => void;
