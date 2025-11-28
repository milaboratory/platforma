import { PlatformClient as GrpcPlApiClient } from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api.client';
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
import { plAddressToConfig, type wireProtocol, SUPPORTED_WIRE_PROTOCOLS } from './config';
import type { GrpcOptions } from '@protobuf-ts/grpc-transport';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { LLPlTransaction } from './ll_transaction';
import { parsePlJwt } from '../util/pl';
import { type Dispatcher, interceptors } from 'undici';
import type { Middleware } from 'openapi-fetch';
import { inferAuthRefreshTime } from './auth';
import { defaultHttpDispatcher } from '@milaboratories/pl-http';
import type { WireClientProvider, WireClientProviderFactory, WireConnection } from './wire';
import { parseHttpAuth } from '@milaboratories/pl-model-common';
import type * as grpcTypes from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';
import { type PlApiPaths, type PlRestClientType, createClient, parseResponseError } from '../proto-rest';
import { notEmpty } from '@milaboratories/ts-helpers';
import { Code } from '../proto-grpc/google/rpc/code';
import { WebSocketBiDiStream } from './websocket_stream';

export interface PlCallOps {
  timeout?: number;
  abortSignal?: AbortSignal;
}

class WireClientProviderImpl<Client> implements WireClientProvider<Client> {
  private client: Client | undefined = undefined;

  constructor(private readonly wireOpts: () => WireConnection, private readonly clientConstructor: (wireOpts: WireConnection) => Client) {}

  public reset(): void {
    this.client = undefined;
  }

  public get(): Client {
    if (this.client === undefined)
      this.client = this.clientConstructor(this.wireOpts());
    return this.client;
  }
}

/** Abstract out low level networking and authorization details */
export class LLPlClient implements WireClientProviderFactory {
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

  private _wireProto: wireProtocol | undefined = undefined;
  private _wireConn!: WireConnection;

  private readonly _restInterceptors: Dispatcher.DispatcherComposeInterceptor[];
  private readonly _restMiddlewares: Middleware[];
  private readonly _grpcInterceptors: Interceptor[];
  private readonly providers: WeakRef<WireClientProviderImpl<any>>[] = [];

  public readonly clientProvider: WireClientProvider<PlRestClientType | GrpcPlApiClient>;

  public readonly httpDispatcher: Dispatcher;

  constructor(
    configOrAddress: PlClientConfig | string,
    private readonly ops: {
      auth?: AuthOps;
      statusListener?: PlConnectionStatusListener;
      shouldUseGzip?: boolean;
    } = {},
  ) {
    this.conf = typeof configOrAddress === 'string'
      ? plAddressToConfig(configOrAddress)
      : configOrAddress;

    const { auth, statusListener } = ops;

    if (auth !== undefined) {
      this.refreshTimestamp = inferAuthRefreshTime(
        auth.authInformation,
        this.conf.authMaxRefreshSeconds,
      );
      this.authInformation = auth.authInformation;
      this.onAuthUpdate = auth.onUpdate;
      this.onAuthRefreshProblem = auth.onUpdateError;
      this.onAuthError = auth.onAuthError;
    }

    this._restInterceptors = [];
    this._restMiddlewares = [];
    this._grpcInterceptors = [];

    if (auth !== undefined) {
      this._restInterceptors.push(this.createRestAuthInterceptor());
      this._grpcInterceptors.push(this.createGrpcAuthInterceptor());
    }
    this._restInterceptors.push(interceptors.retry({ statusCodes: [] })); // Handle errors with openapi-fetch middleware.
    this._restMiddlewares.push(this.createRestErrorMiddleware());
    this._grpcInterceptors.push(this.createGrpcErrorInterceptor());

    this.httpDispatcher = defaultHttpDispatcher(this.conf.httpProxy);

    this.initWireConnection();

    if (statusListener !== undefined) {
      this.statusListener = statusListener;
      statusListener(this._status);
    }

    this.clientProvider = this.createWireClientProvider((wireConn) => {
      if (wireConn.type === 'grpc') {
        return new GrpcPlApiClient(wireConn.Transport);
      } else {
        return createClient<PlApiPaths>({
          hostAndPort: wireConn.Config.hostAndPort,
          ssl: wireConn.Config.ssl,
          dispatcher: wireConn.Dispatcher,
          middlewares: wireConn.Middlewares,
        });
      }
    });
  }

  private initWireConnection() {
    if (this._wireProto === undefined) {
      // TODO: implement automatic server mode detection
      this._wireProto = this.conf.wireProtocol ?? 'grpc';
    }

    switch (this._wireProto) {
      case 'rest':
        this.initRestConnection();
        return;
      case 'grpc':
        this.initGrpcConnection(this.ops.shouldUseGzip ?? false);
        return;
      default:
        ((v: never) => {
          throw new Error(`Unsupported wire protocol '${v as string}'. Use one of: ${SUPPORTED_WIRE_PROTOCOLS.join(', ')}`);
        })(this._wireProto);
    }
  }

  private initRestConnection(): void {
    const dispatcher = defaultHttpDispatcher(this.conf.httpProxy, this._restInterceptors);
    this._replaceWireConnection({ type: 'rest', Config: this.conf, Dispatcher: dispatcher, Middlewares: this._restMiddlewares });
  }

  /**
   * Initializes (or reinitializes) _grpcTransport
   * @param gzip - whether to enable gzip compression
   */
  private initGrpcConnection(gzip: boolean) {
    const clientOptions: ClientOptions = {
      'grpc.keepalive_time_ms': 30_000, // 30 seconds
      'interceptors': this._grpcInterceptors,
    };

    if (gzip) clientOptions['grpc.default_compression_algorithm'] = compressionAlgorithms.gzip;

    //
    // Leaving it here for now
    // https://github.com/grpc/grpc-node/issues/2788
    //
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

    this._replaceWireConnection({ type: 'grpc', Transport: new GrpcTransport(grpcOptions) });
  }

  private _replaceWireConnection(newConn: WireConnection): void {
    const oldConn = this._wireConn;
    this._wireConn = newConn;

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

    if (oldConn !== undefined && oldConn.type === 'grpc') oldConn.Transport.close();
  }

  private providerCleanupCounter = 0;

  /**
   * Creates a provider for a grpc client. Returned provider will create fresh client whenever the underlying transport is reset.
   *
   * @param clientConstructor - a factory function that creates a grpc client
   */
  public createWireClientProvider<Client>(clientConstructor: (transport: WireConnection) => Client): WireClientProvider<Client> {
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

    const provider = new WireClientProviderImpl<Client>(() => this._wireConn, clientConstructor);
    this.providers.push(new WeakRef(provider));
    return provider;
  }

  public get wireConnection(): WireConnection {
    return this._wireConn;
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
        const token = await this.getJwtToken(BigInt(this.conf.authTTLSeconds));
        this.authInformation = { jwtToken: token };
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

  /**
   * Creates middleware that parses error responses and handles them centrally.
   * This middleware runs before openapi-fetch parses the response, so we need to
   * manually parse the response body for error responses.
   */
  private createRestErrorMiddleware(): Middleware {
    return {
      onResponse: async ({ request: _request, response, options: _options }) => {
        const { body: body, ...resOptions } = response;

        if ([502, 503, 504].includes(response.status)) {
          // Service unavailable, bad gateway, gateway timeout
          this.updateStatus('Disconnected');
          return new Response(body, { ...resOptions, status: response.status });
        }

        const respErr = await parseResponseError(response);
        if (!respErr.error) {
          // No error: nice!
          return new Response(respErr.origBody ?? body, { ...resOptions, status: response.status });
        }

        if (typeof respErr.error === 'string') {
          // Non-standard error or normal response: let later middleware to deal wit it.
          return new Response(respErr.error, { ...resOptions, status: response.status });
        }

        if (respErr.error.code === Code.UNAUTHENTICATED) {
          this.updateStatus('Unauthenticated');
        }

        // Let later middleware to deal with standard gRPC error.
        return new Response(respErr.origBody, { ...resOptions, status: response.status });
      },
    };
  }

  /** Detects certain errors and update client status accordingly when using GRPC wire connection */
  private createGrpcErrorInterceptor(): Interceptor {
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

  private createRestAuthInterceptor(): Dispatcher.DispatcherComposeInterceptor {
    return (dispatch) => {
      return (options, handler) => {
        if (this.authInformation?.jwtToken !== undefined) {
          // TODO: check this magic really works and gets called
          options.headers = { ...options.headers, authorization: 'Bearer ' + this.authInformation.jwtToken };
          this.refreshAuthInformationIfNeeded();
        }

        return dispatch(options, handler);
      };
    };
  }

  /** Injects authentication information if needed */
  private createGrpcAuthInterceptor(): Interceptor {
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

  public async getJwtToken(ttlSeconds: bigint, options?: { authorization?: string }): Promise<string> {
    const cl = this.clientProvider.get();

    if (cl instanceof GrpcPlApiClient) {
      const meta: Record<string, string> = {};
      if (options?.authorization) meta.authorization = options.authorization;
      return (await cl.getJWTToken({ expiration: { seconds: ttlSeconds, nanos: 0 } }, { meta }).response).token;
    } else {
      const headers: Record<string, string> = {};
      if (options?.authorization) headers.authorization = options.authorization;
      const resp = cl.POST('/v1/auth/jwt-token', {
        body: { expiration: `${ttlSeconds}s` },
        headers,
      });
      return notEmpty((await resp).data).token;
    }
  }

  public async ping(): Promise<grpcTypes.MaintenanceAPI_Ping_Response> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      return (await cl.ping({})).response;
    } else {
      return notEmpty((await cl.GET('/v1/ping')).data);
    }
  }

  public async license(): Promise<grpcTypes.MaintenanceAPI_License_Response> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      return (await cl.license({})).response;
    } else {
      const resp = notEmpty((await cl.GET('/v1/license')).data);
      return {
        status: resp.status,
        isOk: resp.isOk,
        responseBody: Uint8Array.from(Buffer.from(resp.responseBody)),
      };
    }
  }

  public async authMethods(): Promise<grpcTypes.AuthAPI_ListMethods_Response> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      return (await cl.authMethods({})).response;
    } else {
      return notEmpty((await cl.GET('/v1/auth/methods')).data);
    }
  }

  public async txSync(txId: bigint): Promise<void> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      await cl.txSync({ txId: BigInt(txId) });
    } else {
      (await cl.POST('/v1/tx-sync', { body: { txId: txId.toString() } }));
    }
  }

  createTx(rw: boolean, ops: PlCallOps = {}): LLPlTransaction {
    return new LLPlTransaction((abortSignal) => {
      let totalAbortSignal = abortSignal;
      if (ops.abortSignal) totalAbortSignal = AbortSignal.any([totalAbortSignal, ops.abortSignal]);

      const timeout = ops.timeout ?? (rw ? this.conf.defaultRWTransactionTimeout : this.conf.defaultROTransactionTimeout);

      const cl = this.clientProvider.get();
      if (cl instanceof GrpcPlApiClient) {
        return cl.tx({
          abort: totalAbortSignal,
          timeout,
        });
      }

      if (this._wireProto === 'rest') {
        // For REST/WebSocket protocol, timeout needs to be converted to AbortSignal
        if (timeout !== undefined) {
          totalAbortSignal = AbortSignal.any([totalAbortSignal, AbortSignal.timeout(timeout)]);
        }
        const wsUrl = this.conf.ssl
          ? `wss://${this.conf.hostAndPort}/v1/ws/tx`
          : `ws://${this.conf.hostAndPort}/v1/ws/tx`;

        this.refreshAuthInformationIfNeeded();
        const jwtToken = this.authInformation?.jwtToken;

        return new WebSocketBiDiStream(wsUrl, totalAbortSignal, jwtToken);
      }
      throw new Error('tx is not supported for this wire protocol');
    });
  }

  /** Closes underlying transport */
  public async close() {
    if (this.wireConnection.type === 'grpc') {
      this.wireConnection.Transport.close();
    } else {
      // TODO: close all WS connections
    }
    await this.httpDispatcher.destroy();
  }
}
