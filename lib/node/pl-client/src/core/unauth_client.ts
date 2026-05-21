import type { AuthInformation, PlClientConfig } from "./config";
import type {
  AuthAPI_ListMethods_Response,
  MaintenanceAPI_Ping_Response,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import { LLPlClient } from "./ll_client";
import { type MiLogger, notEmpty } from "@milaboratories/ts-helpers";
import { UnauthenticatedError } from "./errors";
import type { BackendCapability } from "./capabilities";

/** Login-flow shape advertised by the backend for a given SSO method. Extension
 * point: future flow variants (e.g. backend-driven) sit alongside `public_pkce`. */
export type SSOFlowType = "public_pkce";

/** Typed projection of `AuthAPI.ListMethods.SSOAuthMethod` for desktop consumption.
 * Carries everything needed to drive the PKCE flow + diagnostics fields the renderer
 * may surface (`userIdClaim`, `groupsClaim`). */
export type SSOAuthMethod = {
  /** `MethodInfo.id` — machine-readable, unique per server. */
  id: string;
  /** `MethodInfo.description` — human-readable label. */
  description: string;
  issuer: string;
  clientId: string;
  scopes: string;
  resource: string;
  prompt: string;
  redirectPorts: number[];
  subjectTokenSource: "access_token" | "id_token";
  userIdClaim: string;
  groupsClaim: string;
  flowType: SSOFlowType;
};

/** Server-issued material returned by {@link UnauthenticatedPlClient.beginSSOLogin}.
 * Discriminated on `flow`; future flow variants extend the union. */
export type SSOLoginAttempt = {
  flow: "public_pkce";
  nonce: string;
  expiresAt: Date;
};

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

  public hasCapability(capability: BackendCapability): boolean {
    return this.ll.hasCapability(capability);
  }

  /** Classifies the advertised authentication methods by credential scheme.
   * On legacy backends (no auth:v2) the typed oneof is empty; callers fall through to {@link login}
   * which uses the legacy GetJWTToken path. SSO is surfaced via {@link ssoConfig}, not here. */
  public get supportedAuthSchemes(): { basic: boolean; token: boolean } {
    const result = { basic: false, token: false };
    for (const m of this.ll.authMethodsSync.methods) {
      if (m.method.oneofKind === "basic") result.basic = true;
      else if (m.method.oneofKind === "token") result.token = true;
    }
    return result;
  }

  /** Projection of the first advertised SSO method, derived from {@link authMethodsSync}.
   * v1: at most one SSO method per deployment, so callers do not need to discriminate. */
  public ssoConfig(): SSOAuthMethod | undefined {
    for (const method of this.ll.authMethodsSync.methods) {
      if (method.method.oneofKind !== "sso") continue;
      const sso = method.method.sso;
      return {
        id: method.id,
        description: method.description,
        issuer: sso.issuer,
        clientId: sso.clientId,
        scopes: sso.scopes,
        resource: sso.resource,
        prompt: sso.prompt,
        redirectPorts: sso.redirectPorts,
        subjectTokenSource: sso.subjectTokenSource === "id_token" ? "id_token" : "access_token",
        userIdClaim: sso.userIdClaim,
        groupsClaim: sso.groupsClaim,
        flowType: "public_pkce",
      };
    }
    return undefined;
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
      if (this.ll.hasCapability("auth:v2")) {
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

  /** Request fresh server-issued login material. v1 only emits the public-PKCE flow;
   * desktop MUST place the returned `nonce` verbatim into the OIDC auth-request. */
  public async beginSSOLogin(): Promise<SSOLoginAttempt> {
    const { nonce, expiresAt } = await this.ll.beginSSOLogin();
    return { flow: "public_pkce", nonce, expiresAt };
  }

  /** Forward the verbatim IdP `/token` response body and receive a Platforma JWT. */
  public async loginSSO(payload: { tokenResponse: Uint8Array }): Promise<AuthInformation> {
    try {
      const jwtToken = await this.ll.loginSSO(payload.tokenResponse);
      if (jwtToken === "") throw new Error("empty token");
      return { jwtToken };
    } catch (e: any) {
      if (e.code === "UNAUTHENTICATED") throw new UnauthenticatedError(e.message);
      throw new Error(e);
    }
  }
}
