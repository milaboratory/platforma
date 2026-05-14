import type { AuthInformation, PlClientConfig } from "./config";
import type {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import { LLPlClient } from "./ll_client";
import { type MiLogger, notEmpty } from "@milaboratories/ts-helpers";
import { UnauthenticatedError } from "./errors";
import { CapabilityAuthV2 } from "./capabilities";

/** Primarily used for initial authentication (login) */
export class UnauthenticatedPlClient {
  public readonly ll: LLPlClient;

  private constructor(ll: LLPlClient) {
    this.ll = ll;
  }

  public static async build(
    configOrAddress: PlClientConfig | string,
    ops?: { logger?: MiLogger },
  ): Promise<UnauthenticatedPlClient> {
    const ll = await LLPlClient.build(configOrAddress, ops);
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

  public hasCapability(name: string): boolean {
    return this.ll.hasCapability(name);
  }

  /** Classifies the advertised authentication methods by credential scheme.
   * On legacy backends (no auth:v2) the typed oneof is empty; callers fall through to {@link login}
   * which uses the legacy GetJWTToken path. */
  public get supportedAuthSchemes(): { basic: boolean; token: boolean } {
    const result = { basic: false, token: false };
    for (const m of this.ll.authMethodsSync.methods) {
      if (m.method.oneofKind === "basic") result.basic = true;
      else if (m.method.oneofKind === "token") result.token = true;
    }
    return result;
  }

  /** Login with username+password.
   *
   * On auth:v2 backends the client inspects the advertised AuthMethods:
   *   - if basic auth is offered, sends {@link LLPlClient.loginBasic};
   *   - if only token auth is offered, treats `password` as an opaque bearer token and
   *     sends {@link LLPlClient.loginWithToken} (so deployments configured for static-token
   *     auth still log in without the caller switching methods).
   *
   * On legacy backends (no auth:v2) it falls through to GetJWTToken with the Basic header,
   * preserving original behavior. */
  public async login(user: string, password: string): Promise<AuthInformation> {
    try {
      let token: string;
      if (this.ll.hasCapability(CapabilityAuthV2)) {
        const schemes = this.supportedAuthSchemes;
        if (schemes.basic) {
          token = await this.ll.loginBasic(user, password);
        } else if (schemes.token) {
          token = await this.ll.loginWithToken(password);
        } else {
          throw new Error("backend advertises no supported authentication methods");
        }
      } else {
        token = await this.ll.getJwtToken(BigInt(this.ll.conf.authTTLSeconds), {
          authorization: "Basic " + Buffer.from(user + ":" + password).toString("base64"),
        });
      }
      const jwtToken = notEmpty(token);
      if (jwtToken === "") throw new Error("empty token");
      return { jwtToken };
    } catch (e: any) {
      if (e.code === "UNAUTHENTICATED") throw new UnauthenticatedError(e.message);
      throw new Error(e);
    }
  }
}
