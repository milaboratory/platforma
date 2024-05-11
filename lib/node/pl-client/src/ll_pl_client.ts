import { PlatformClient } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api.client';
import { InterceptingCall, Interceptor, InterceptorOptions, NextCall } from '@grpc/grpc-js';
import { parsePlJwt } from './util/jwt';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { PlClientConfig } from './config';

export interface AuthorizationInformation {
  jwtToken?: string;

  // to be removed after new security model will be implemented
  rootIdentifier: string;
}

export interface AuthorizationOps {
  /** Initial authorization information */
  authInformation: AuthorizationInformation,
  /** Will be executed after successful authorization information refresh */
  readonly onUpdate: (newInfo: AuthorizationInformation) => void,
  /** Will be executed if error encountered during token update */
  readonly onRefreshProblem?: (error: Error) => void
}

/** Returns a timestamp when current authorization information should be refreshed.
 * Compare the value with Date.now(). */
function refreshTimestamp(info: AuthorizationInformation): number | undefined {
  if (info.jwtToken === undefined)
    return undefined;

  const { exp, iat } = parsePlJwt(info.jwtToken);

  // in the middle between issue and expiration time points
  return (exp + iat) * 1000 / 2;
}

class Authorization {


  constructor(llClient: LLPlClient, authorizationOps: AuthorizationOps) {
    this.authInformation = authorizationOps.authInformation;
    this.onUpdate = authorizationOps.onUpdate;
    this.onTokenRefreshProblem = authorizationOps.onRefreshProblem;
    this.refreshTimestamp = refreshTimestamp(authorizationOps.authInformation);
  }

  interceptor: Interceptor = (options, nextCall) => {
    return new InterceptingCall(nextCall(options), {
      start: (metadata, listener, next) => {
        if (this.authInformation.jwtToken !== undefined) {
          metadata.set('authorization', 'Bearer ' + this.authInformation.jwtToken);
          next(metadata, listener);
          this.resolveToken().catch(err => {
            this.logger.error('resolveToken error: ' + err);
          });
        } else {
          next(metadata, listener);
        }
      }
    });
  };
}

export class LLPlClient {
  /** Initial authorization information */
  private authInformation: AuthorizationInformation;
  /** Will be executed by the client when it is required */
  private readonly onAuthUpdate: (newInfo: AuthorizationInformation) => void;
  /** Will be executed by the client when it is required */
  private readonly onAuthRefreshProblem?: (error: Error) => void;

  /** For locking */
  private refreshTokenResponse: Promise<AuthorizationInformation> | undefined = undefined;
  /** Threshold after which auth info refresh is required */
  private refreshTimestamp?: number;

  private unauthorizedClient: PlatformClient;

  constructor(authInfo?: AuthorizationInformation) {

  }
}

function createGrpcOptions(config: PlClientConfig, ...interceptors: Interceptor[]) {

}

export class UnauthorizedPlClient {
  private readonly client: PlatformClient;

  constructor(config: PlClientConfig) {


  }

}
