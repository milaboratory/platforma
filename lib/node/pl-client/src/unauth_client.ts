import { AuthInformation, PlConnectionConfig } from './config';
import {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response
} from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { LLPlClient } from './ll_client';

/** Primarily used for initial authentication (login) */
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
