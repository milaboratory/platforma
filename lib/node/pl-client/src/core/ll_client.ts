import { PlatformClient } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api.client';
import type { ClientOptions, Interceptor } from '@grpc/grpc-js';
import {
  ChannelCredentials,
  InterceptingCall,
  status as GrpcStatus,
  compressionAlgorithms,
} from '@grpc/grpc-js';
import type {
  AuthInformation,
  AuthOps,
  PlClientConfig,
  PlConnectionStatus,
  PlConnectionStatusListener,
} from './config';
import { plAddressToConfig } from './config';
import type { GrpcOptions } from '@protobuf-ts/grpc-transport';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { LLPlTransaction } from './ll_transaction';
import { parsePlJwt } from '../util/pl';
import type { Dispatcher } from 'undici';
import { inferAuthRefreshTime } from './auth';
import { defaultHttpDispatcher } from '@milaboratories/pl-http';
import type { GrpcClientProvider, GrpcClientProviderFactory } from './grpc';
import { parseHttpAuth } from '@milaboratories/pl-model-common';

export interface PlCallOps {
  timeout?: number;
  abortSignal?: AbortSignal;
}

export interface PlConnectionInfo {
  transportInitialized: boolean;
  providerCount: number;
  hostAndPort: string;
  ssl: boolean;
  grpcProxy?: string;
  singleConnectionMode: boolean;
}

class GrpcClientProviderImpl<Client> implements GrpcClientProvider<Client> {
  private client: Client | undefined = undefined;

  constructor(private readonly grpcTransport: () => GrpcTransport, private readonly clientConstructor: (transport: GrpcTransport) => Client) {}

  public reset(): void {
    this.client = undefined;
  }

  public get(): Client {
    if (this.client === undefined)
      this.client = this.clientConstructor(this.grpcTransport());
    return this.client;
  }
}

/** Abstract out low level networking and authorization details */
export class LLPlClient implements GrpcClientProviderFactory {
  public readonly conf: PlClientConfig;

  /** Initial authorization information */
  private authInformation?: AuthInformation;
  /** Will be executed by the client when it is required */
  private readonly onAuthUpdate?: (newInfo: AuthInformation) => void;
  /** Will be executed if auth-related error happens during normal client operation */
  private readonly onAuthError?: () => void;
  /** Will be executed by the client when it is required */
  private readonly onAuthRefreshProblem?: (error: unknown) => void;
  /** Threshold after which auth info refresh is required */
  private refreshTimestamp?: number;

  private _status: PlConnectionStatus = 'OK';
  private readonly statusListener?: PlConnectionStatusListener;

  private readonly grpcInterceptors: Interceptor[];
  private _grpcTransport!: GrpcTransport;
  private readonly providers: WeakRef<GrpcClientProviderImpl<any>>[] = [];

  public readonly grpcPl: GrpcClientProvider<PlatformClient>;

  public readonly httpDispatcher: Dispatcher;

  constructor(
    configOrAddress: PlClientConfig | string,
    private readonly ops: {
      auth?: AuthOps;
      statusListener?: PlConnectionStatusListener;
      shouldUseGzip?: boolean;
      /**
       * Force single connection usage for MITM proxy compatibility.
       * When enabled, all gRPC calls will be multiplexed over a single HTTP/2 connection.
       * Default: true
       */
      singleConnection?: boolean;
    } = {},
  ) {
    this.conf = typeof configOrAddress === 'string'
      ? plAddressToConfig(configOrAddress)
      : configOrAddress;

    this.grpcInterceptors = [];

    const { auth, statusListener, shouldUseGzip, singleConnection = true } = ops;

    if (auth !== undefined) {
      this.refreshTimestamp = inferAuthRefreshTime(
        auth.authInformation,
        this.conf.authMaxRefreshSeconds,
      );
      this.grpcInterceptors.push(this.createAuthInterceptor());
      this.authInformation = auth.authInformation;
      this.onAuthUpdate = auth.onUpdate;
      this.onAuthRefreshProblem = auth.onUpdateError;
      this.onAuthError = auth.onAuthError;
    }

    this.grpcInterceptors.push(this.createErrorInterceptor());

    // initialize _grpcTransport and _grpcPl
    this.initGrpc(shouldUseGzip ?? false, singleConnection);

    this.httpDispatcher = defaultHttpDispatcher(this.conf.httpProxy);

    if (statusListener !== undefined) {
      this.statusListener = statusListener;
      statusListener(this._status);
    }

    this.grpcPl = this.createGrpcClientProvider((transport) => new PlatformClient(transport));
  }

  /**
   * Initializes (or reinitializes) _grpcTransport and _grpcPl
   * @param gzip - whether to enable gzip compression
   * @param singleConnection - whether to enforce single connection usage for MITM proxy compatibility
   */
  private initGrpc(gzip: boolean, singleConnection: boolean) {
    const clientOptions: ClientOptions = {
      'grpc.keepalive_time_ms': 30_000, // 30 seconds
      'interceptors': this.grpcInterceptors,
    };

    if (singleConnection) {
      // Configuration for MITM proxy compatibility - enforce single connection usage
      Object.assign(clientOptions, {
        'grpc.keepalive_timeout_ms': 5_000, // 5 seconds
        'grpc.keepalive_permit_without_calls': true,
        'grpc.http2.max_pings_without_data': 0,
        'grpc.http2.min_time_between_pings_ms': 10_000,
        'grpc.http2.min_ping_interval_without_data_ms': 300_000,
        // Enforce single connection by limiting subchannel pool
        'grpc.use_local_subchannel_pool': true,
        // Configure HTTP/2 settings for optimal multiplexing
        'grpc.http2.max_frame_size': 16777215, // 16MB max frame size
        'grpc.max_receive_message_length': 67108864, // 64MB max message size
        // Disable connection-level retry which might create additional connections
        'grpc.enable_retries': false,
      });
    }

    if (gzip) clientOptions['grpc.default_compression_algorithm'] = compressionAlgorithms.gzip;

    //
    // Configuration for MITM proxy compatibility:
    // All gRPC calls (unary & bidirectional streaming) will be multiplexed over a single HTTP/2 connection.
    // The above clientOptions ensure:
    // 1. Connection reuse through local subchannel pooling
    // 2. Proper HTTP/2 keepalive to maintain connection health
    // 3. Optimal frame sizes for multiplexing efficiency
    // 4. Disabled retries to prevent additional connection attempts
    //
    // Note: Original batching comment from https://github.com/grpc/grpc-node/issues/2788
    // We should implement message pooling algorithm to overcome hardcoded NO_DELAY behaviour
    // of HTTP/2 and allow our small messages to batch together.
    //
    const grpcOptions: GrpcOptions = {
      host: this.conf.hostAndPort,
      timeout: this.conf.defaultRequestTimeout,
      channelCredentials: this.conf.ssl
        ? ChannelCredentials.createSsl()
        : ChannelCredentials.createInsecure(),
      clientOptions,
    };

    const grpcProxy = typeof this.conf.grpcProxy === 'string'
      ? { url: this.conf.grpcProxy }
      : this.conf.grpcProxy;

    if (grpcProxy?.url) {
      const url = new URL(grpcProxy.url);
      if (grpcProxy.auth) {
        const parsed = parseHttpAuth(grpcProxy.auth);
        if (parsed.scheme !== 'Basic') {
          throw new Error(`Unsupported auth scheme: ${parsed.scheme as string}.`);
        }
        url.username = parsed.username;
        url.password = parsed.password;
      }
      process.env.grpc_proxy = url.toString();
    } else {
      delete process.env.grpc_proxy;
    }

    const oldTransport = this._grpcTransport;

    this._grpcTransport = new GrpcTransport(grpcOptions);

    // Reset all providers to let them reinitialize their clients
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i].deref();
      if (provider === undefined) {
        // at the same time we need to remove providers that are no longer valid
        this.providers.splice(i, 1);
        i--;
      } else {
        provider.reset();
      }
    }

    if (oldTransport !== undefined) oldTransport.close();
  }

  private providerCleanupCounter = 0;

  /**
   * Creates a provider for a grpc client. Returned provider will create fresh client whenever the underlying transport is reset.
   *
   * @param clientConstructor - a factory function that creates a grpc client
   */
  public createGrpcClientProvider<Client>(clientConstructor: (transport: GrpcTransport) => Client): GrpcClientProvider<Client> {
    // We need to cleanup providers periodically to avoid memory leaks.
    // This is a simple heuristic to avoid memory leaks.
    // We could use a more sophisticated algorithm, but this is good enough for now.
    this.providerCleanupCounter++;
    if (this.providerCleanupCounter >= 16) {
      for (let i = 0; i < this.providers.length; i++) {
        const provider = this.providers[i].deref();
        if (provider === undefined) {
          this.providers.splice(i, 1);
          i--;
        }
      }
      this.providerCleanupCounter = 0;
    }

    const provider = new GrpcClientProviderImpl<Client>(() => this._grpcTransport, clientConstructor);
    this.providers.push(new WeakRef(provider));
    return provider;
  }

  public get grpcTransport(): GrpcTransport {
    return this._grpcTransport;
  }

  /**
   * Get connection information for monitoring single connection usage.
   * This can be used to verify that all gRPC calls are multiplexed over a single HTTP/2 connection.
   */
  public getConnectionInfo(): PlConnectionInfo {
    return {
      transportInitialized: this._grpcTransport !== undefined,
      providerCount: this.providers.length,
      hostAndPort: this.conf.hostAndPort,
      ssl: this.conf.ssl,
      grpcProxy: typeof this.conf.grpcProxy === 'string'
        ? this.conf.grpcProxy
        : this.conf.grpcProxy?.url,
      singleConnectionMode: this.ops.singleConnection ?? true,
    };
  }

  /** Returns true if client is authenticated. Even with anonymous auth information
   * connection is considered authenticated. Unauthenticated clients are used for
   * login and similar tasks, see {@link UnauthenticatedPlClient}. */
  public get authenticated(): boolean {
    return this.authInformation !== undefined;
  }

  /** null means anonymous connection */
  public get authUser(): string | null {
    if (!this.authenticated) throw new Error('Client is not authenticated');
    if (this.authInformation?.jwtToken)
      return parsePlJwt(this.authInformation?.jwtToken).user.login;
    else return null;
  }

  private updateStatus(newStatus: PlConnectionStatus) {
    process.nextTick(() => {
      if (this._status !== newStatus) {
        this._status = newStatus;
        if (this.statusListener !== undefined) this.statusListener(this._status);
        if (this.onAuthError !== undefined) this.onAuthError();
      }
    });
  }

  public get status(): PlConnectionStatus {
    return this._status;
  }

  private authRefreshInProgress: boolean = false;

  private refreshAuthInformationIfNeeded(): void {
    if (
      this.refreshTimestamp === undefined
      || Date.now() < this.refreshTimestamp
      || this.authRefreshInProgress
      || this._status === 'Unauthenticated'
    )
      return;

    // Running refresh in background`
    this.authRefreshInProgress = true;
    void (async () => {
      try {
        const response = await this.grpcPl.get().getJWTToken({
          expiration: {
            seconds: BigInt(this.conf.authTTLSeconds),
            nanos: 0,
          },
        }).response;
        this.authInformation = { jwtToken: response.token };
        this.refreshTimestamp = inferAuthRefreshTime(
          this.authInformation,
          this.conf.authMaxRefreshSeconds,
        );
        if (this.onAuthUpdate) this.onAuthUpdate(this.authInformation);
      } catch (e: unknown) {
        if (this.onAuthRefreshProblem) this.onAuthRefreshProblem(e);
      } finally {
        this.authRefreshInProgress = false;
      }
    })();
  }

  /** Detects certain errors and update client status accordingly */
  private createErrorInterceptor(): Interceptor {
    return (options, nextCall) => {
      return new InterceptingCall(nextCall(options), {
        start: (metadata, listener, next) => {
          next(metadata, {
            onReceiveStatus: (status, next) => {
              if (status.code == GrpcStatus.UNAUTHENTICATED)
                // (!!!) don't change to "==="
                this.updateStatus('Unauthenticated');
              if (status.code == GrpcStatus.UNAVAILABLE)
                // (!!!) don't change to "==="
                this.updateStatus('Disconnected');
              next(status);
            },
          });
        },
      });
    };
  }

  /** Injects authentication information if needed */
  private createAuthInterceptor(): Interceptor {
    return (options, nextCall) => {
      return new InterceptingCall(nextCall(options), {
        start: (metadata, listener, next) => {
          if (this.authInformation?.jwtToken !== undefined) {
            metadata.set('authorization', 'Bearer ' + this.authInformation.jwtToken);
            this.refreshAuthInformationIfNeeded();
            next(metadata, listener);
          } else {
            next(metadata, listener);
          }
        },
      });
    };
  }

  createTx(rw: boolean, ops: PlCallOps = {}): LLPlTransaction {
    return new LLPlTransaction((abortSignal) => {
      let totalAbortSignal = abortSignal;
      if (ops.abortSignal) totalAbortSignal = AbortSignal.any([totalAbortSignal, ops.abortSignal]);
      return this.grpcPl.get().tx({
        abort: totalAbortSignal,
        timeout: ops.timeout
          ?? (rw ? this.conf.defaultRWTransactionTimeout : this.conf.defaultROTransactionTimeout),
      });
    });
  }

  /** Closes underlying transport */
  public async close() {
    this.grpcTransport.close();
    await this.httpDispatcher.destroy();
  }
}
