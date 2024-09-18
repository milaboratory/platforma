import { AuthInformation, PlClientConfig } from './config';
import {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response
} from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { LLPlClient } from './ll_client';
import { notEmpty } from '@milaboratories/ts-helpers';
import { UnauthenticatedError } from './errors';

/** Primarily used for initial authentication (login) */
export class UnauthenticatedPlClient {
  public readonly ll: LLPlClient;

  constructor(configOrAddress: PlClientConfig | string) {
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
    try {
      const response = await this.ll.grpcPl.getJWTToken(
        { expiration: { seconds: BigInt(this.ll.conf.authTTLSeconds), nanos: 0 } },
        {
          meta: {
            authorization: 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
          }
        }
      ).response;
      const jwtToken = notEmpty(response.token);
      if (jwtToken === '') throw new Error('empty token');
      return { jwtToken };
    } catch (e: any) {
      if (e.code === 'UNAUTHENTICATED') throw new UnauthenticatedError(e.message);
      throw new Error(e);
    }
  }
}
