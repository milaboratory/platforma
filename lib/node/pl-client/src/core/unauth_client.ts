import type { AuthInformation, PlClientConfig } from './config';
import type {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response,
} from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { LLPlClient } from './ll_client';
import { notEmpty } from '@milaboratories/ts-helpers';
import { UnauthenticatedError } from './errors';

/**
 * Primarily used for initial authentication (login).
 * Creates ephemeral connections for each request to prevent hanging connections.
 */
export class UnauthenticatedPlClient {
  private readonly config: PlClientConfig | string;

  constructor(configOrAddress: PlClientConfig | string) {
    this.config = configOrAddress;
  }

  /**
   * Creates an ephemeral LLPlClient for a single request.
   * The client should be closed after use to prevent hanging connections.
   */
  private createEphemeralClient(): LLPlClient {
    return new LLPlClient(this.config, {
      singleConnection: true, // Ensure single connection for ephemeral usage
    });
  }

  public async ping(): Promise<MaintenanceAPI_Ping_Response> {
    const client = this.createEphemeralClient();
    try {
      return (await client.grpcPl.get().ping({})).response;
    } finally {
      await client.close();
    }
  }

  public async authMethods(): Promise<AuthAPI_ListMethods_Response> {
    const client = this.createEphemeralClient();
    try {
      return (await client.grpcPl.get().authMethods({})).response;
    } finally {
      await client.close();
    }
  }

  public async requireAuth(): Promise<boolean> {
    const authMethods = await this.authMethods();
    return authMethods.methods.length > 0;
  }

  public async login(user: string, password: string): Promise<AuthInformation> {
    const client = this.createEphemeralClient();
    try {
      const response = await client.grpcPl.get().getJWTToken(
        { expiration: { seconds: BigInt(client.conf.authTTLSeconds), nanos: 0 } },
        {
          meta: {
            authorization: 'Basic ' + Buffer.from(user + ':' + password).toString('base64'),
          },
        },
      ).response;
      const jwtToken = notEmpty(response.token);
      if (jwtToken === '') throw new Error('empty token');
      return { jwtToken };
    } catch (e: any) {
      if (e.code === 'UNAUTHENTICATED') throw new UnauthenticatedError(e.message);
      throw new Error(e);
    } finally {
      await client.close();
    }
  }
}
