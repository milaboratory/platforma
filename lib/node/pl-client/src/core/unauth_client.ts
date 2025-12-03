import type { AuthInformation, PlClientConfig } from './config';
import type {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response,
} from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';
import { LLPlClient } from './ll_client';
import { notEmpty } from '@milaboratories/ts-helpers';
import { UnauthenticatedError } from './errors';

/** Primarily used for initial authentication (login) */
export class UnauthenticatedPlClient {
  public readonly ll: LLPlClient;

  private constructor(ll: LLPlClient) {
    this.ll = ll;
  }

  public static async build(configOrAddress: PlClientConfig | string): Promise<UnauthenticatedPlClient> {
    const ll = await LLPlClient.build(configOrAddress);
    return new UnauthenticatedPlClient(ll);
  }

  public async ping(): Promise<MaintenanceAPI_Ping_Response> {
    return await this.ll.ping();
  }

  public async authMethods(): Promise<AuthAPI_ListMethods_Response> {
    return await this.ll.authMethods();
  }

  public async requireAuth(): Promise<boolean> {
    return (await this.authMethods()).methods.length > 0;
  }

  public async login(user: string, password: string): Promise<AuthInformation> {
    try {
      const token = await this.ll.getJwtToken(
        BigInt(this.ll.conf.authTTLSeconds),
        { authorization: 'Basic ' + Buffer.from(user + ':' + password).toString('base64') },
      );
      const jwtToken = notEmpty(token);
      if (jwtToken === '') throw new Error('empty token');
      return { jwtToken };
    } catch (e: any) {
      if (e.code === 'UNAUTHENTICATED') throw new UnauthenticatedError(e.message);
      throw new Error(e);
    }
  }
}
