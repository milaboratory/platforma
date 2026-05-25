import { PlatformClient as GrpcPlApiClient } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api.client";
import type { ClientOptions, Interceptor } from "@grpc/grpc-js";
import {
  ChannelCredentials,
  InterceptingCall,
  status as GrpcStatus,
  compressionAlgorithms,
} from "@grpc/grpc-js";
import type {
  AuthInformation,
  AuthOps,
  PlClientConfig,
  PlConnectionStatus,
  PlConnectionStatusListener,
} from "./config";
import { plAddressToConfig, type wireProtocol, SUPPORTED_WIRE_PROTOCOLS } from "./config";
import type { GrpcOptions } from "@protobuf-ts/grpc-transport";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { LLPlTransaction } from "./ll_transaction";
import { parsePlJwt } from "../util/pl";
import { type Dispatcher, interceptors } from "undici";
import type { Middleware } from "openapi-fetch";
import { inferAuthRefreshTime } from "./auth";
import { hasCapability, type BackendCapability } from "./capabilities";
import { defaultHttpDispatcher } from "@milaboratories/pl-http";
import type { WireClientProvider, WireClientProviderFactory, WireConnection } from "./wire";
import { parseHttpAuth } from "@milaboratories/pl-model-common";
import type * as grpcTypes from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import {
  type PlApiPaths,
  type PlRestClientType,
  createClient,
  parseResponseError,
} from "../proto-rest";
import { notEmpty, retry, withTimeout, type RetryOptions } from "@milaboratories/ts-helpers";
import { Code } from "../proto-grpc/google/rpc/code";
import { WebSocketBiDiStream } from "./websocket_stream";
import {
  AuthAPI_Role,
  TxAPI_ClientMessage,
  TxAPI_ServerMessage,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { isAbortedError } from "./errors";

export interface PlCallOps {
  timeout?: number;
  abortSignal?: AbortSignal;
}

// Parses leading "<major>.<minor>.<patch>" from a version string like
// "3.1.1" or "3.1.1-rc1" and returns true if the parsed version is >= target.
// Returns false for unparseable versions (safer to assume an old backend).
function isVersionAtLeast(version: string, target: [number, number, number]): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const parsed: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < 3; i++) {
    if (parsed[i] !== target[i]) return parsed[i] > target[i];
  }
  return true;
}

// Returns true iff `version` is strictly after the release tag `target`. Dev
// builds (`git describe`-style, e.g. "3.5.0-224-g0ca182") are considered
// AFTER the matching release tag — they include commits past the tag and so
// have any change merged after it. Released versions with the same triplet
// return false (we want the tag itself to be excluded).
//
// Examples for target [3,5,0]:
//   "3.5.0"              → false (the tagged release)
//   "3.5.0-224-g0ca182"  → true  (dev build past the tag)
//   "3.5.1"              → true
//   "3.4.9"              → false
// Returns false for unparseable versions.
function isAfterVersion(version: string, target: [number, number, number]): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!match) return false;
  const parsed: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const suffix = match[4];
  for (let i = 0; i < 3; i++) {
    if (parsed[i] !== target[i]) return parsed[i] > target[i];
  }
  return suffix !== "";
}

class WireClientProviderImpl<Client> implements WireClientProvider<Client> {
  private client: Client | undefined = undefined;

  constructor(
    private readonly wireOpts: () => WireConnection,
    private readonly clientConstructor: (wireOpts: WireConnection) => Client,
  ) {}

  public reset(): void {
    this.client = undefined;
  }

  public get(): Client {
    if (this.client === undefined) this.client = this.clientConstructor(this.wireOpts());
    return this.client;
  }
}

/** Abstract out low level networking and authorization details */
export class LLPlClient implements WireClientProviderFactory {
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

  /** Cached Ping response. Populated by build() before it returns; refreshed by every later ping(). */
  private _serverInfo?: grpcTypes.MaintenanceAPI_Ping_Response;
  private _authMethodsSync?: grpcTypes.AuthAPI_ListMethods_Response;

  private _status: PlConnectionStatus = "OK";
  private readonly statusListener?: PlConnectionStatusListener;

  private _wireProto: wireProtocol = "grpc";
  private _wireConn!: WireConnection;

  private readonly _restInterceptors: Dispatcher.DispatcherComposeInterceptor[];
  private readonly _restMiddlewares: Middleware[];
  private readonly _grpcInterceptors: Interceptor[];
  private readonly providers: WeakRef<WireClientProviderImpl<any>>[] = [];

  public readonly clientProvider: WireClientProvider<PlRestClientType | GrpcPlApiClient>;

  public readonly httpDispatcher: Dispatcher;

  public static async build(
    configOrAddress: PlClientConfig | string,
    ops: {
      auth?: AuthOps;
      statusListener?: PlConnectionStatusListener;
      shouldUseGzip?: boolean;
      logger?: MiLogger;
      useAutoDetectWireProtocol?: boolean;
    } = {},
  ) {
    const conf =
      typeof configOrAddress === "string" ? plAddressToConfig(configOrAddress) : configOrAddress;

    const pl = new LLPlClient(conf, ops);

    // FIXME(rfiskov)[MILAB-5275]: Investigate why autodetect randomly fails; temporary turn it off.
    if (ops.useAutoDetectWireProtocol) {
      await pl.detectOptimalWireProtocol();
    }

    // Guarantee a ping happened so capability-gated paths (login, refresh) can branch synchronously.
    // In the autodetect path the loop's last successful ping already populated _serverInfo via the
    // side-effect in ping(); this fallback covers the path where autodetect is disabled.
    if (!pl._serverInfo) await pl.ping();

    // Guarantee authMethods happened so client can make weighted decision on which auth method to use.
    if (!pl._authMethodsSync) await pl.authMethods();

    return pl;
  }

  private constructor(
    public readonly conf: PlClientConfig,
    private readonly ops: {
      auth?: AuthOps;
      statusListener?: PlConnectionStatusListener;
      shouldUseGzip?: boolean;
      logger?: MiLogger;
    } = {},
  ) {
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
    if (this.conf.wireProtocol) {
      this._wireProto = this.conf.wireProtocol;
    }

    this.initWireConnection(this._wireProto);

    if (statusListener !== undefined) {
      this.statusListener = statusListener;
      statusListener(this._status);
    }

    this.clientProvider = this.createWireClientProvider((wireConn) => {
      if (wireConn.type === "grpc") {
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

  private initWireConnection(protocol: wireProtocol) {
    switch (protocol) {
      case "rest":
        this.initRestConnection();
        return;
      case "grpc":
        this.initGrpcConnection(this.ops.shouldUseGzip ?? false);
        return;
      default:
        ((v: never) => {
          throw new Error(
            `Unsupported wire protocol '${v as string}'. Use one of: ${SUPPORTED_WIRE_PROTOCOLS.join(", ")}`,
          );
        })(protocol);
    }
  }

  private initRestConnection(): void {
    const dispatcher = defaultHttpDispatcher(this.conf.grpcProxy, this._restInterceptors);
    this._replaceWireConnection({
      type: "rest",
      Config: this.conf,
      Dispatcher: dispatcher,
      Middlewares: this._restMiddlewares,
    });
  }

  /**
   * Initializes (or reinitializes) _grpcTransport
   * @param gzip - whether to enable gzip compression
   */
  private initGrpcConnection(gzip: boolean) {
    const clientOptions: ClientOptions = {
      "grpc.keepalive_time_ms": 30_000, // 30 seconds
      "grpc.service_config_disable_resolution": 1, // Disable DNS TXT lookups for service config
      interceptors: this._grpcInterceptors,
    };

    if (gzip) clientOptions["grpc.default_compression_algorithm"] = compressionAlgorithms.gzip;

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

    const grpcProxy =
      typeof this.conf.grpcProxy === "string" ? { url: this.conf.grpcProxy } : this.conf.grpcProxy;

    if (grpcProxy?.url) {
      const url = new URL(grpcProxy.url);
      if (grpcProxy.auth) {
        const parsed = parseHttpAuth(grpcProxy.auth);
        if (parsed.scheme !== "Basic") {
          throw new Error(`Unsupported auth scheme: ${parsed.scheme as string}.`);
        }
        url.username = parsed.username;
        url.password = parsed.password;
      }
      process.env.grpc_proxy = url.toString();
    } else {
      delete process.env.grpc_proxy;
    }

    this._replaceWireConnection({ type: "grpc", Transport: new GrpcTransport(grpcOptions) });
  }

  private _replaceWireConnection(newConn: WireConnection): void {
    const oldConn = this._wireConn;
    this._wireConn = newConn;
    this._wireProto = newConn.type;

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

    if (oldConn !== undefined && oldConn.type === "grpc") oldConn.Transport.close();
  }

  private providerCleanupCounter = 0;

  /**
   * Creates a provider for a grpc client. Returned provider will create fresh client whenever the underlying transport is reset.
   *
   * @param clientConstructor - a factory function that creates a grpc client
   */
  public createWireClientProvider<Client>(
    clientConstructor: (transport: WireConnection) => Client,
  ): WireClientProvider<Client> {
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

  public get wireProtocol(): wireProtocol | undefined {
    return this._wireProto;
  }

  /** Returns true if client is authenticated. Even with anonymous auth information
   * connection is considered authenticated. Unauthenticated clients are used for
   * login and similar tasks, see {@link UnauthenticatedPlClient}. */
  public get authenticated(): boolean {
    return this.authInformation !== undefined;
  }

  /** null means anonymous connection */
  public get authUser(): string | null {
    if (!this.authenticated) throw new Error("Client is not authenticated");
    if (this.authInformation?.jwtToken) {
      if (this.hasCapability("auth:v2")) {
        return parsePlJwt(this.authInformation?.jwtToken).sub;
      }
      return parsePlJwt(this.authInformation?.jwtToken).user.login;
    } else return null;
  }

  private updateStatus(newStatus: PlConnectionStatus) {
    process.nextTick(() => {
      if (this._status !== newStatus) {
        this._status = newStatus;
        if (this.statusListener !== undefined) this.statusListener(this._status);
        if (newStatus === "Unauthenticated" && this.onAuthError !== undefined) this.onAuthError();
      }
    });
  }

  public get status(): PlConnectionStatus {
    return this._status;
  }

  private authRefreshInProgress: boolean = false;

  private refreshAuthInformationIfNeeded(): void {
    if (
      this.refreshTimestamp === undefined ||
      Date.now() < this.refreshTimestamp ||
      this.authRefreshInProgress ||
      this._status === "Unauthenticated"
    )
      return;

    // Running refresh in background`
    this.authRefreshInProgress = true;
    void (async () => {
      try {
        const ttl = BigInt(this.conf.authTTLSeconds);
        const token = this.hasCapability("auth:v2")
          ? await this.refreshToken({ ttlSeconds: ttl })
          : await this.getJwtToken(ttl);
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
        const { body, ...resOptions } = response;

        if ([502, 503, 504].includes(response.status)) {
          // Service unavailable, bad gateway, gateway timeout
          this.updateStatus("Disconnected");
          return new Response(body, { ...resOptions, status: response.status });
        }

        const respErr = await parseResponseError(response);
        if (!respErr.error) {
          // No error: nice!
          return new Response(respErr.origBody ?? body, { ...resOptions, status: response.status });
        }

        if (typeof respErr.error === "string") {
          // Non-standard error or normal response: let later middleware to deal wit it.
          return new Response(respErr.error, { ...resOptions, status: response.status });
        }

        if (respErr.error.code === Code.UNAUTHENTICATED) {
          this.updateStatus("Unauthenticated");
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
                this.updateStatus("Unauthenticated");
              if (status.code == GrpcStatus.UNAVAILABLE)
                // (!!!) don't change to "==="
                this.updateStatus("Disconnected");
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
          options.headers = {
            ...options.headers,
            authorization: "Bearer " + this.authInformation.jwtToken,
          };
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
            metadata.set("authorization", "Bearer " + this.authInformation.jwtToken);
            this.refreshAuthInformationIfNeeded();
            next(metadata, listener);
          } else {
            next(metadata, listener);
          }
        },
      });
    };
  }

  public async getJwtToken(
    ttlSeconds: bigint,
    options?: { authorization?: string; role?: AuthAPI_Role },
  ): Promise<string> {
    const cl = this.clientProvider.get();
    const role = options?.role ?? AuthAPI_Role.UNSPECIFIED;

    if (cl instanceof GrpcPlApiClient) {
      const meta: Record<string, string> = {};
      if (options?.authorization) meta.authorization = options.authorization;
      return (
        await cl.getJWTToken(
          {
            expiration: { seconds: ttlSeconds, nanos: 0 },
            requestedRole: role,
          },
          { meta },
        ).response
      ).token;
    } else {
      const headers: Record<string, string> = {};
      if (options?.authorization) headers.authorization = options.authorization;
      const resp = cl.POST("/v1/auth/jwt-token", {
        body: { expiration: `${ttlSeconds}s`, requestedRole: role },
        headers,
      });
      return notEmpty((await resp).data, "REST: empty response for JWT token request").token;
    }
  }

  /** Login via username/password. Returns a fresh JWT. Backend creates a new session per call. */
  public async loginBasic(
    user: string,
    password: string,
    opts: { ttlSeconds?: bigint; role?: AuthAPI_Role } = {},
  ): Promise<string> {
    const cl = this.clientProvider.get();
    const ttl = opts.ttlSeconds ?? BigInt(this.conf.authTTLSeconds);
    const role = opts.role ?? AuthAPI_Role.UNSPECIFIED;

    if (cl instanceof GrpcPlApiClient) {
      return (
        await cl.login({
          credentials: {
            oneofKind: "basic",
            basic: { login: user, password },
          },
          expiration: { seconds: ttl, nanos: 0 },
          requestedRole: role,
        }).response
      ).token;
    } else {
      const resp = cl.POST("/v1/auth/login", {
        // openapi-typescript generated all body fields as required, but Login.Request
        // has a credentials oneof — only one of `basic`/`token` is sent. Cast around it.
        body: {
          basic: { login: user, password },
          expiration: `${ttl}s`,
          requestedRole: role,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      return notEmpty((await resp).data, "REST: empty response for login request").token;
    }
  }

  /** Login via opaque bearer token (controller pre-shared secret, OIDC id-token, etc.).
   * String input is UTF-8 encoded. Returns a fresh Platforma JWT. */
  public async loginWithToken(
    token: Uint8Array | string,
    opts: { ttlSeconds?: bigint; role?: AuthAPI_Role } = {},
  ): Promise<string> {
    const cl = this.clientProvider.get();
    const ttl = opts.ttlSeconds ?? BigInt(this.conf.authTTLSeconds);
    const role = opts.role ?? AuthAPI_Role.UNSPECIFIED;
    const bytes = typeof token === "string" ? Buffer.from(token, "utf8") : token;

    if (cl instanceof GrpcPlApiClient) {
      return (
        await cl.login({
          credentials: {
            oneofKind: "token",
            token: { token: bytes },
          },
          expiration: { seconds: ttl, nanos: 0 },
          requestedRole: role,
        }).response
      ).token;
    } else {
      const resp = cl.POST("/v1/auth/login", {
        // openapi-typescript marks all body fields as required, but Login.Request has a oneof.
        // REST encodes `bytes` as a base64 string.
        body: {
          token: { token: Buffer.from(bytes).toString("base64") },
          expiration: `${ttl}s`,
          requestedRole: role,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      return notEmpty((await resp).data, "REST: empty response for login request").token;
    }
  }

  /** Refresh the current JWT, preserving session id and role. */
  public async refreshToken(opts: { ttlSeconds?: bigint } = {}): Promise<string> {
    const cl = this.clientProvider.get();
    const ttl = opts.ttlSeconds ?? BigInt(this.conf.authTTLSeconds);
    const currentToken = notEmpty(
      this.authInformation?.jwtToken,
      "refreshToken called without a current JWT",
    );

    if (cl instanceof GrpcPlApiClient) {
      return (
        await cl.refreshToken({
          token: currentToken,
          expiration: { seconds: ttl, nanos: 0 },
        }).response
      ).token;
    } else {
      const resp = cl.POST("/v1/auth/refresh", {
        body: { token: currentToken, expiration: `${ttl}s` },
      });
      return notEmpty((await resp).data, "REST: empty response for refresh request").token;
    }
  }

  public async ping(): Promise<grpcTypes.MaintenanceAPI_Ping_Response> {
    const cl = this.clientProvider.get();
    let resp: grpcTypes.MaintenanceAPI_Ping_Response;
    if (cl instanceof GrpcPlApiClient) {
      resp = (await cl.ping({})).response;
    } else {
      // The REST ping response predates the `capabilities` field (proto field 9).
      // Old servers omit it; treat absence as empty capability list.
      const pingData = notEmpty(
        (await cl.GET("/v1/ping")).data,
        "REST: empty response for ping request",
      );
      resp = {
        ...(pingData as unknown as grpcTypes.MaintenanceAPI_Ping_Response),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capabilities: (pingData as any).capabilities ?? [],
      };
    }
    this._serverInfo = resp;
    return resp;
  }

  /** Cached Ping response. Always populated post-build(); throws if accessed earlier. */
  public get serverInfo(): grpcTypes.MaintenanceAPI_Ping_Response {
    if (!this._serverInfo) {
      throw new Error("LLPlClient.serverInfo accessed before build() completed");
    }
    return this._serverInfo;
  }

  /** Synchronous capability check against the cached Ping response. */
  public hasCapability(capability: BackendCapability): boolean {
    return hasCapability(this.serverInfo.capabilities, capability);
  }

  /** True if the backend implements the setDefaultColor TX request. */
  public get supportsSetDefaultColor(): boolean {
    return isVersionAtLeast(this.serverInfo.coreVersion, [3, 3, 0]);
  }

  /**
   * True if the backend honors per-file `permissions` on workdir fill rules
   * (PR #1830 in milaboratory/pl). Backends before this change ignore the
   * requested mode and always land files at the canonical archive perm,
   * making `exec.builder().writeFile/addFile({ writable: true })` a no-op.
   *
   * Tagged at 3.5.0 cut without the change, so [3, 5, 0] excludes the tagged
   * release but includes dev builds past the tag (e.g. "3.5.0-224-g0ca182").
   */
  public get supportsWritableWorkdirFiles(): boolean {
    return isAfterVersion(this.serverInfo.coreVersion, [3, 5, 0]);
  }

  /**
   * Detects the best available wire protocol.
   * If wireProtocol is explicitly configured, does nothing.
   * Otherwise probes the current protocol via ping; if it fails, switches to the alternative.
   */
  private async detectOptimalWireProtocol() {
    if (this.conf.wireProtocol) {
      return;
    }

    // Each retry is:
    //  - ping request timeout (100 to 3_000ms)
    //  - backoff delay (30 to 500ms)
    //
    // 30 attempts are ~43 seconds of overall waiting time.
    // Think twice on overall time this thing takes to complete when changing these parameters.
    // It may block UI when connecting to the server and loading projects list.
    const pingTimeoutFactor = 1.3;
    const maxPingTimeoutMs = 3_000;
    const retryOptions: RetryOptions = {
      type: "exponentialBackoff",
      maxAttempts: 30,
      initialDelay: 30,
      backoffMultiplier: 1.3,
      jitter: 0.2,
      maxDelay: 500,
    };

    let attempt = 1;
    let pingTimeoutMs = 100;
    await retry(
      () => withTimeout(this.ping(), pingTimeoutMs),
      retryOptions,
      (e: unknown) => {
        if (isAbortedError(e)) {
          this.ops.logger?.info(
            `Wire proto autodetect: ping timed out after ${pingTimeoutMs}ms: attempt=${attempt}, wire=${this._wireProto}`,
          );

          if (attempt % 2 === 0) {
            // We have 2 wire protocols to check. Increase timeout each 2 attempts.
            pingTimeoutMs = Math.min(
              Math.round(pingTimeoutMs * pingTimeoutFactor),
              maxPingTimeoutMs,
            );
          }
        } else {
          this.ops.logger?.info(
            `Wire proto autodetect: ping failed: attempt=${attempt}, wire=${this._wireProto}, err=${String(e)}`,
          );
        }

        attempt++;
        const protocol = this._wireProto === "grpc" ? "rest" : "grpc";
        this.ops.logger?.info(
          `Wire protocol autodetect next attempt: will try wire '${protocol}' with timeout ${pingTimeoutMs}ms`,
        );
        this.initWireConnection(protocol);
        return true;
      },
    );
  }

  public async license(): Promise<grpcTypes.MaintenanceAPI_License_Response> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      return (await cl.license({})).response;
    } else {
      const resp = notEmpty(
        (await cl.GET("/v1/license")).data,
        "REST: empty response for license request",
      );
      return {
        status: resp.status,
        isOk: resp.isOk,
        responseBody: Uint8Array.from(Buffer.from(resp.responseBody)),
      };
    }
  }

  public async authMethods(): Promise<grpcTypes.AuthAPI_ListMethods_Response> {
    const cl = this.clientProvider.get();
    let resp: grpcTypes.AuthAPI_ListMethods_Response;
    if (cl instanceof GrpcPlApiClient) {
      resp = (await cl.authMethods({})).response;
    } else {
      const wsResponse = notEmpty(
        (await cl.GET("/v1/auth/methods")).data,
        "REST: empty response for auth methods request",
      );
      // OpenAPI schema flattens the protobuf oneof into `{ basic?, token? }`,
      // while protobuf-ts models it as a discriminated union. Reshape per item.
      resp = {
        methods: (wsResponse.methods ?? []).map((m): grpcTypes.AuthAPI_ListMethods_MethodInfo => {
          const base = { id: m.id, description: m.description };
          if (m.basic !== undefined) {
            return { ...base, method: { oneofKind: "basic", basic: m.basic } };
          }
          if (m.token !== undefined) {
            return { ...base, method: { oneofKind: "token", token: m.token } };
          }
          if (m.sso !== undefined) {
            return { ...base, method: { oneofKind: "sso", sso: m.sso } };
          }
          return { ...base, method: { oneofKind: undefined } };
        }),
      };
    }

    this._authMethodsSync = resp;
    return resp;
  }

  public get authMethodsSync(): grpcTypes.AuthAPI_ListMethods_Response {
    if (!this._authMethodsSync) {
      throw new Error("LLPlClient.authMethodsSync accessed before build() completed");
    }
    return this._authMethodsSync;
  }

  public async getUserRoot(
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<grpcTypes.AuthAPI_GetUserRoot_Response> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      return (
        await cl.getUserRoot({
          login: opts.login ?? "",
          createIfNotExists: opts.createIfNotExists ?? false,
        })
      ).response;
    } else {
      const resp = notEmpty(
        (
          await cl.POST("/v1/auth/user-root", {
            body: {
              login: opts.login ?? "",
              createIfNotExists: opts.createIfNotExists ?? false,
            },
          })
        ).data,
        "REST: empty response for getUserRoot request",
      );
      return {
        userRoot: resp.userRoot
          ? {
              resourceId: BigInt(resp.userRoot.resourceId),
              resourceSignature: Uint8Array.from(
                Buffer.from(resp.userRoot.resourceSignature, "base64"),
              ),
            }
          : undefined,
      };
    }
  }

  public async listUserResources(
    opts: { login?: string; startFrom?: bigint; limit?: number } = {},
  ): Promise<grpcTypes.AuthAPI_ListUserResources_Response[]> {
    const cl = this.clientProvider.get();

    if (!(cl instanceof GrpcPlApiClient)) {
      throw new Error("ListUserResources requires gRPC wire protocol; REST is not supported");
    }

    const call = cl.listUserResources({
      login: opts.login ?? "",
      startFrom: opts.startFrom ?? 0n,
      limit: opts.limit ?? 0,
    });
    const responses: grpcTypes.AuthAPI_ListUserResources_Response[] = [];
    for await (const msg of call.responses) {
      responses.push(msg);
    }
    return responses;
  }

  public async txSync(txId: bigint): Promise<void> {
    const cl = this.clientProvider.get();
    if (cl instanceof GrpcPlApiClient) {
      await cl.txSync({ txId: BigInt(txId) });
    } else {
      await cl.POST("/v1/tx-sync", { body: { txId: txId.toString() } });
    }
  }

  createTx(rw: boolean, ops: PlCallOps = {}): LLPlTransaction {
    return new LLPlTransaction((abortSignal) => {
      let totalAbortSignal = abortSignal;
      if (ops.abortSignal) totalAbortSignal = AbortSignal.any([totalAbortSignal, ops.abortSignal]);

      const timeout =
        ops.timeout ??
        (rw ? this.conf.defaultRWTransactionTimeout : this.conf.defaultROTransactionTimeout);

      const cl = this.clientProvider.get();
      if (cl instanceof GrpcPlApiClient) {
        return cl.tx({
          abort: totalAbortSignal,
          timeout,
        });
      }

      const wireConn = this.wireConnection;
      if (wireConn.type === "rest") {
        // For REST/WebSocket protocol, timeout needs to be converted to AbortSignal
        if (timeout !== undefined) {
          totalAbortSignal = AbortSignal.any([totalAbortSignal, AbortSignal.timeout(timeout)]);
        }

        // The gRPC transport has the auth interceptor that already handles it, but here we need to refresh the auth information to be safe.
        this.refreshAuthInformationIfNeeded();

        const wsUrl = this.conf.ssl
          ? `wss://${this.conf.hostAndPort}/v1/ws/tx`
          : `ws://${this.conf.hostAndPort}/v1/ws/tx`;

        return new WebSocketBiDiStream(
          wsUrl,
          (msg) => TxAPI_ClientMessage.toBinary(msg),
          (data) => TxAPI_ServerMessage.fromBinary(new Uint8Array(data)),
          {
            abortSignal: totalAbortSignal,
            jwtToken: this.authInformation?.jwtToken,
            dispatcher: wireConn.Dispatcher,

            onComplete: async (stream) =>
              stream.requests.send({
                // Ask server to gracefully close the stream on its side, if not done yet.
                requestId: 0,
                request: { oneofKind: "streamClose", streamClose: {} },
              }),
          },
        );
      }

      throw new Error(`transactions are not supported for wire protocol ${this._wireProto}`);
    });
  }

  /** Closes underlying transport */
  public async close() {
    if (this.wireConnection.type === "grpc") {
      this.wireConnection.Transport.close();
    } else {
      // TODO: close all WS connections
    }
    await this.httpDispatcher.destroy();
  }
}
