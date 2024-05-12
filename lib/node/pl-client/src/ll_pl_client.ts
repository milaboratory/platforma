import { PlatformClient } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api.client';
import {
  ChannelCredentials,
  InterceptingCall,
  Interceptor
} from '@grpc/grpc-js';
import { parsePlJwt } from './util/jwt';
import { plAddressToConfig, PlConnectionConfig } from './config';
import { GrpcOptions, GrpcTransport } from '@protobuf-ts/grpc-transport';
import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response
} from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { LLPlTransaction } from './ll_pl_transaction';

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

/** Returns a timestamp when current authorization information should be refreshed.
 * Compare the value with Date.now(). */
export function inferAuthRefreshTime(info: AuthInformation, maxRefreshSeconds: number): number | undefined {
  if (info.jwtToken === undefined)
    return undefined;

  const { exp, iat } = parsePlJwt(info.jwtToken);

  return Math.min(
    // in the middle between issue and expiration time points
    (iat + exp) / 2,
    iat + maxRefreshSeconds
  ) * 1000;
}

export type PlConnectionStatus = 'OK' | 'Disconnected' | 'Unauthenticated'
export type PlConnectionStatusListener = (status: PlConnectionStatus) => void;

export interface PlCallOps {
  timeout?: number;
  abortSignal?: AbortSignal;
}

/** Abstract out low level networking and authorization details */
export class LLPlClient {
  public readonly conf: PlConnectionConfig;

  /** Initial authorization information */
  private authInformation?: AuthInformation;
  /** Will be executed by the client when it is required */
  private readonly onAuthUpdate?: (newInfo: AuthInformation) => void;
  /** Will be executed by the client when it is required */
  private readonly onAuthRefreshProblem?: (error: unknown) => void;
  /** Threshold after which auth info refresh is required */
  private refreshTimestamp?: number;

  private _status: PlConnectionStatus = 'OK';
  private readonly statusListener?: PlConnectionStatusListener;

  private readonly grpcTransport: GrpcTransport;
  public readonly grpcPl: PlatformClient;

  constructor(configOrAddress: PlConnectionConfig | string,
              ops: {
                plAuthOptions?: AuthOps,
                statusListener?: PlConnectionStatusListener
              } = {}) {
    this.conf = typeof configOrAddress === 'string'
      ? plAddressToConfig(configOrAddress)
      : configOrAddress;

    const grpcInterceptors: Interceptor[] = [];

    const { plAuthOptions, statusListener } = ops;

    if (plAuthOptions !== undefined) {
      this.refreshTimestamp = inferAuthRefreshTime(plAuthOptions.authInformation, this.conf.authMaxRefreshSeconds);
      grpcInterceptors.push(this.createAuthInterceptor());
      this.authInformation = plAuthOptions.authInformation;
      this.onAuthUpdate = plAuthOptions.onUpdate;
      this.onAuthRefreshProblem = plAuthOptions.onUpdateError;
    }

    grpcInterceptors.push(this.createErrorInterceptor());

    const grpcOptions: GrpcOptions = {
      host: this.conf.hostAndPort,
      timeout: this.conf.defaultRequestTimeout,
      channelCredentials: this.conf.ssl
        ? ChannelCredentials.createSsl()
        : ChannelCredentials.createInsecure(),
      clientOptions: { interceptors: grpcInterceptors }
    };

    if (this.conf.grpcProxy)
      process.env.grpc_proxy = this.conf.grpcProxy;
    else
      delete process.env.grpc_proxy;

    this.grpcTransport = new GrpcTransport(grpcOptions);
    this.grpcPl = new PlatformClient(this.grpcTransport);

    if (statusListener !== undefined) {
      this.statusListener = statusListener;
      statusListener(this._status);
    }
  }

  private updateStatus(newStatus: PlConnectionStatus) {
    if (this._status !== newStatus) {
      this._status = newStatus;
      if (this.statusListener)
        this.statusListener(this._status);
    }
  }

  public get status(): PlConnectionStatus {
    return this._status;
  }

  private authRefreshInProgress: boolean = false;

  private refreshAuthInformationIfNeeded(): void {
    if (this.refreshTimestamp === undefined
      || Date.now() < this.refreshTimestamp
      || this.authRefreshInProgress
      || this._status === 'Unauthenticated')
      return;

    // Running refresh in background
    this.authRefreshInProgress = true;
    (async () => {
      try {
        const response = await this.grpcPl.getJWTToken({
          expiration: {
            seconds: BigInt(this.conf.authTTLSeconds),
            nanos: 0
          }
        }).response;
        this.authInformation = { jwtToken: response.token };
        this.refreshTimestamp = inferAuthRefreshTime(this.authInformation, this.conf.authMaxRefreshSeconds);
        if (this.onAuthUpdate)
          this.onAuthUpdate(this.authInformation);
      } catch (e: unknown) {
        if (this.onAuthRefreshProblem)
          this.onAuthRefreshProblem(e);
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
              if (status.code === GrpcStatus.UNAUTHENTICATED)
                this.updateStatus('Unauthenticated');
              next(status);
            }
          });
        }
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
        }
      });
    };
  }

  createTx(ops: PlCallOps = {}): LLPlTransaction {
    return new LLPlTransaction((abortSignal) => {
      let totalAbortSignal = abortSignal;
      if (ops.abortSignal)
        // this will be fixed in typescript 5.5.0
        // see this https://github.com/microsoft/TypeScript/issues/58026
        // and this https://github.com/microsoft/TypeScript/pull/58211
        totalAbortSignal = (AbortSignal as any).any([totalAbortSignal, ops.abortSignal]);
      return this.grpcPl.tx({
        abort: totalAbortSignal,
        timeout: ops.timeout ?? this.conf.defaultTransactionTimeout
      });
    });
  }
}

export class UnauthenticatedPlClient {
  public readonly ll: LLPlClient;

  constructor(configOrAddress: PlConnectionConfig | string) {
    this.ll = new LLPlClient(configOrAddress);
  }

  public async ping(): Promise<MaintenanceAPI_Ping_Response> {
    return (await this.ll.grpcPl.ping({})).response;
  }

  public async authMethods(): Promise<AuthAPI_ListMethods_Response> {
    return (await this.ll.grpcPl.authMethods({})).response;
  }

  public async requireAuth(): Promise<boolean> {
    return (await this.authMethods()).methods.length > 0;
  }

  public async login(user: string, password: string): Promise<AuthInformation> {
    const response = await this.ll.grpcPl.getJWTToken(
      { expiration: { seconds: BigInt(this.ll.conf.authTTLSeconds), nanos: 0 } },
      {
        meta: {
          'authorization':
            'Basic ' + Buffer.from(user + ':' + password).toString('base64')
        }
      }
    );
    return { jwtToken: response.response.token };
  }
}
