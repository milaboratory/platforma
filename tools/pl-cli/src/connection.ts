import {
  PlClient,
  UnauthenticatedPlClient,
  plAddressToConfig,
  type AuthInformation,
  type PlClientConfig,
} from "@milaboratories/pl-client";

export interface PlConnectionOptions {
  address: string;
  user?: string;
  password?: string;
}

/** Creates an authenticated PlClient from address + credentials. */
export async function createPlConnection(opts: PlConnectionOptions): Promise<PlClient> {
  const config: PlClientConfig = plAddressToConfig(opts.address);

  if (opts.user !== undefined) config.user = opts.user;
  if (opts.password !== undefined) config.password = opts.password;

  const unauth = await UnauthenticatedPlClient.build(config);
  let authInformation: AuthInformation;

  if (await unauth.requireAuth()) {
    if (config.user === undefined || config.password === undefined) {
      throw new Error(
        "Server requires authentication but no credentials provided. " +
          "Use --user/--password flags or PL_USER/PL_PASSWORD env vars.",
      );
    }
    authInformation = await unauth.login(config.user, config.password);
  } else {
    authInformation = {};
  }

  return await PlClient.init(config, { authInformation });
}
