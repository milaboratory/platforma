import type { AuthInformation, PlClientConfig } from "./config";
import {
  type AuthAPI_ListMethods_Response,
  type MaintenanceAPI_Ping_Response,
  AuthAPI_ListMethods_SSOAuthMethod_FlowType,
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
  id: string;
  title: string;
  description: string;
  issuer: string;
  clientId: string;
  scopes: string;
  resource: string;
  prompt: string;
  redirectPorts: number[];
  subjectTokenSource: string;
  userIdClaim: string;
  groupsClaim: string;
  flowType: SSOFlowType;
  /** OIDC `access_type` auth-request param ("online" | "offline"). Google-specific:
   * "offline" makes Google issue a refresh token; other IdPs ignore it. Absent when
   * the server does not set it — never send an empty string to the IdP. */
  accessType?: string;
};

/** Server-issued material returned by {@link UnauthenticatedPlClient.beginSSOLogin}.
 * Discriminated on `flow`; future flow variants extend the union. */
export type SSOLoginAttempt = {
  flow: "public_pkce";
  nonce: string;
  expiresAt: Date;
  /** Confidential-client secret for the IdP token exchange; absent for public clients.
   * Google's OIDC has no public-client mode — it requires a client_secret at the token
   * endpoint even with PKCE — so for Google the backend forwards its secret here and the
   * desktop exchanges the code as a confidential client. */
  clientSecret?: string;
};

/** One login method the backend advertises, of any kind. Every advertised method keeps its own
 * `id`, `title`, `description` and kind. Two same-kind methods, such as two LDAP directories, are
 * two entries a caller can name apart and never collapsed into one. See {@link UnauthenticatedPlClient.loginMethods}. */
export type LoginMethod =
  | { kind: "basic"; id: string; title: string; description: string }
  | { kind: "token"; id: string; title: string; description: string }
  | ({ kind: "sso" } & SSOAuthMethod);

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
   * which uses the legacy GetJWTToken path.
   * @deprecated collapses every basic-kind method into one boolean; use {@link loginMethods} to
   * see each advertised method's own id. `login()` still reads this to choose the credential path. */
  public get supportedAuthSchemes(): { basic: boolean; token: boolean } {
    const result = { basic: false, token: false };
    for (const m of this.ll.authMethodsSync.methods) {
      if (m.method.oneofKind === "basic") result.basic = true;
      else if (m.method.oneofKind === "token") result.token = true;
    }
    return result;
  }

  /** Builds the {@link SSOAuthMethod} projection an advertised SSO entry carries, or `undefined`
   * for a flow no client here can drive. Shared by {@link ssoConfig} and {@link loginMethods},
   * which each apply their own rule for an unsupported flow. */
  private toSSOAuthMethod(
    method: AuthAPI_ListMethods_Response["methods"][number],
  ): SSOAuthMethod | undefined {
    if (method.method.oneofKind !== "sso") return undefined;
    const sso = method.method.sso;
    if (sso.flowType !== AuthAPI_ListMethods_SSOAuthMethod_FlowType.PUBLIC_PKCE) return undefined;
    return {
      id: method.id,
      title: method.title || method.description || method.id,
      description: method.description,
      issuer: sso.issuer,
      clientId: sso.clientId,
      scopes: sso.scopes,
      resource: sso.resource,
      prompt: sso.prompt,
      redirectPorts: sso.redirectPorts,
      subjectTokenSource: sso.subjectTokenSource,
      userIdClaim: sso.userIdClaim,
      groupsClaim: sso.groupsClaim,
      accessType: sso.accessType || undefined,
      flowType: "public_pkce",
    };
  }

  /** Projection of the first advertised SSO method, derived from {@link authMethodsSync}.
   * v1: at most one SSO method per deployment, so callers do not need to discriminate.
   * @deprecated surfaces only the first advertised SSO method; use {@link loginMethods} to see
   * every advertised method, of every kind. */
  public ssoConfig(): SSOAuthMethod | undefined {
    for (const method of this.ll.authMethodsSync.methods) {
      if (method.method.oneofKind !== "sso") continue;
      const sso = method.method.sso;
      if (sso.flowType !== AuthAPI_ListMethods_SSOAuthMethod_FlowType.PUBLIC_PKCE) {
        throw new Error(`ssoConfig: unsupported SSO flow type ${sso.flowType}`);
      }
      return this.toSSOAuthMethod(method);
    }
    return undefined;
  }

  /** Every login method the backend advertises, of every kind, in advertised order, each
   * keeping its own `id`, `title`, `description` and kind. An entry with no usable method arm, or an
   * SSO entry whose flow no client here can drive, is dropped rather than failing the whole
   * list, which is why this accessor skips where {@link ssoConfig} throws. */
  public loginMethods(): LoginMethod[] {
    const picked: LoginMethod[] = [];
    for (const method of this.ll.authMethodsSync.methods) {
      switch (method.method.oneofKind) {
        case "basic":
        case "token":
          picked.push({
            kind: method.method.oneofKind,
            id: method.id,
            title: method.title || method.description || method.id,
            description: method.description,
          });
          break;
        case "sso": {
          const sso = this.toSSOAuthMethod(method);
          if (sso !== undefined) picked.push({ kind: "sso", ...sso });
          break;
        }
        default:
          // No arm at all — a legacy backend advertising nothing pickable.
          break;
      }
    }
    return picked;
  }

  /** Login with username and password.
   *
   * Routes to {@link LLPlClient.loginBasic} or {@link LLPlClient.loginWithToken} based on
   * advertised auth methods. On legacy backends, uses GetJWTToken with Basic header.
   *
   * `idP` names the advertised method — basic branch only. Token and legacy branches ignore it
   * and keep today's first-match behavior. */
  public async login(user: string, password: string, idP?: string): Promise<AuthInformation> {
    try {
      let token: string;
      if (this.ll.hasCapability("auth:v2")) {
        const schemes = this.supportedAuthSchemes;
        if (schemes.basic) {
          token =
            idP === undefined
              ? await this.ll.loginBasic(user, password)
              : await this.ll.loginBasic(user, password, { idP });
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
   * desktop MUST place the returned `nonce` verbatim into the OIDC auth-request. `idP` names
   * the advertised SSO method to route to; omitted, the backend keeps its current first-match
   * behaviour. */
  public async beginSSOLogin(idP?: string): Promise<SSOLoginAttempt> {
    const attempt =
      idP === undefined ? await this.ll.beginSSOLogin() : await this.ll.beginSSOLogin(idP);
    return {
      flow: "public_pkce",
      nonce: attempt.nonce,
      expiresAt: attempt.expiresAt,
      clientSecret: attempt.clientSecret,
    };
  }

  /** Forward the verbatim IdP `/token` response body and receive a Platforma JWT. `idP` names
   * the advertised SSO method to route to; omitted, the backend keeps its current first-match
   * behaviour. */
  public async loginSSO(payload: {
    tokenResponse: Uint8Array;
    idP?: string;
  }): Promise<AuthInformation> {
    try {
      const jwtToken =
        payload.idP === undefined
          ? await this.ll.loginSSO(payload.tokenResponse)
          : await this.ll.loginSSO(payload.tokenResponse, payload.idP);
      if (jwtToken === "") throw new Error("empty token");
      return { jwtToken };
    } catch (e: any) {
      if (e.code === "UNAUTHENTICATED") throw new UnauthenticatedError(e.message);
      throw new Error(e);
    }
  }
}
