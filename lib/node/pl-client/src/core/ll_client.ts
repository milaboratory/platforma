import { PlatformClient } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api.client';
import type {
  Interceptor } from '@grpc/grpc-js';
import {
  ChannelCredentials,
  InterceptingCall,
  status as GrpcStatus,
} from '@grpc/grpc-js';
import type {
  AuthInformation,
  AuthOps,
  PlClientConfig,
  PlConnectionStatus,
  PlConnectionStatusListener,
} from './config';
import {
  plAddressToConfig,
} from './config';
import type { GrpcOptions } from '@protobuf-ts/grpc-transport';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { LLPlTransaction } from './ll_transaction';
import { parsePlJwt } from '../util/pl';
import type { Dispatcher } from 'undici';
import { inferAuthRefreshTime } from './auth';
import { defaultHttpDispatcher } from '@milaboratories/pl-http';

export interface PlCallOps {
  timeout?: number;
  abortSignal?: AbortSignal;
}

/** Abstract out low level networking and authorization details */
export class LLPlClient {
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

  public readonly grpcTransport: GrpcTransport;
  public readonly grpcPl: PlatformClient;

  public readonly httpDispatcher: Dispatcher;

  constructor(
    configOrAddress: PlClientConfig | string,
    ops: {
      auth?: AuthOps;
      statusListener?: PlConnectionStatusListener;
    } = {},
  ) {
    this.conf
      = typeof configOrAddress === 'string' ? plAddressToConfig(configOrAddress) : configOrAddress;

    const grpcInterceptors: Interceptor[] = [];

    const { auth, statusListener } = ops;

    if (auth !== undefined) {
      this.refreshTimestamp = inferAuthRefreshTime(
        auth.authInformation,
        this.conf.authMaxRefreshSeconds,
      );
      grpcInterceptors.push(this.createAuthInterceptor());
      this.authInformation = auth.authInformation;
      this.onAuthUpdate = auth.onUpdate;
      this.onAuthRefreshProblem = auth.onUpdateError;
      this.onAuthError = auth.onAuthError;
    }

    grpcInterceptors.push(this.createErrorInterceptor());

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
      clientOptions: {
        'grpc.keepalive_time_ms': 30_000, // 30 seconds
        'interceptors': grpcInterceptors,
      },
    };

    if (this.conf.grpcProxy) process.env.grpc_proxy = this.conf.grpcProxy;
    else delete process.env.grpc_proxy;

    this.grpcTransport = new GrpcTransport(grpcOptions);
    this.grpcPl = new PlatformClient(this.grpcTransport);

    this.httpDispatcher = defaultHttpDispatcher(this.conf.httpProxy);

    if (statusListener !== undefined) {
      this.statusListener = statusListener;
      statusListener(this._status);
    }
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
        const response = await this.grpcPl.getJWTToken({
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
      return this.grpcPl.tx({
        abort: totalAbortSignal,
        timeout:
          ops.timeout
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
