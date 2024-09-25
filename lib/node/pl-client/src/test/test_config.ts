import * as fs from 'node:fs';
import { LLPlClient } from '../core/ll_client';
import type { AuthInformation, AuthOps, PlClientConfig } from '../core/config';
import { plAddressToConfig } from '../core/config';
import { UnauthenticatedPlClient } from '../core/unauth_client';
import { PlClient } from '../core/client';
import { randomUUID } from 'crypto';
import type { OptionalResourceId} from '../core/types';
import { NullResourceId, ResourceId, resourceIdToString } from '../core/types';
import { inferAuthRefreshTime } from '../core/auth';
import * as path from 'node:path';

export interface TestConfig {
  address: string;
  test_proxy?: string;
  test_user?: string;
  test_password?: string;
}

const CONFIG_FILE = 'test_config.json';
// const AUTH_DATA_FILE = '.test_auth.json';

let authDataFilePath: string | undefined;

function getFullAuthDataFilePath() {
  if (authDataFilePath === undefined) authDataFilePath = path.resolve('.test_auth.json');
  return authDataFilePath;
}

export function getTestConfig(): TestConfig {
  let conf: Partial<TestConfig> = {};
  if (fs.existsSync(CONFIG_FILE))
    conf = JSON.parse(fs.readFileSync(CONFIG_FILE, { encoding: 'utf-8' }));

  if (process.env.PL_ADDRESS !== undefined) conf.address = process.env.PL_ADDRESS;

  if (process.env.PL_TEST_USER !== undefined) conf.test_user = process.env.PL_TEST_USER;

  if (process.env.PL_TEST_PASSWORD !== undefined) conf.test_password = process.env.PL_TEST_PASSWORD;

  if (process.env.PL_TEST_PROXY !== undefined) conf.test_proxy = process.env.PL_TEST_PROXY;

  if (conf.address === undefined)
    throw new Error(
      `can't resolve platform address (checked ${CONFIG_FILE} file and PL_ADDRESS environment var)`
    );

  return conf as TestConfig;
}

interface AuthCache {
  /** To check if config changed */
  conf: TestConfig;
  expiration: number;
  authInformation: AuthInformation;
}

function saveAuthInfoCallback(tConf: TestConfig): (authInformation: AuthInformation) => void {
  return (authInformation) => {
    const dst = getFullAuthDataFilePath();
    const tmpDst = getFullAuthDataFilePath() + randomUUID();
    fs.writeFileSync(
      tmpDst,
      Buffer.from(
        JSON.stringify({
          conf: tConf,
          authInformation,
          expiration: inferAuthRefreshTime(authInformation, 24 * 60 * 60)
        } as AuthCache)
      ),
      'utf8'
    );
    fs.renameSync(tmpDst, dst);
  };
}

const cleanAuthInfoCallback = () => {
  console.warn(`Removing: ${getFullAuthDataFilePath()}`);
  fs.rmSync(getFullAuthDataFilePath());
};

export async function getTestClientConf(): Promise<{ conf: PlClientConfig; auth: AuthOps }> {
  const tConf = getTestConfig();

  let authInformation: AuthInformation | undefined = undefined;

  // try recover from cache
  if (fs.existsSync(getFullAuthDataFilePath())) {
    try {
      const cache: AuthCache = JSON.parse(
        fs.readFileSync(getFullAuthDataFilePath(), { encoding: 'utf-8' })
      );
      if (
        cache.conf.address === tConf.address &&
        cache.conf.test_user === tConf.test_user &&
        cache.conf.test_password === tConf.test_password &&
        cache.expiration > Date.now()
      )
        authInformation = cache.authInformation;
    } catch (e: any) {
      // removing cache file on any error
      fs.rmSync(getFullAuthDataFilePath());
    }
  }

  const plConf = plAddressToConfig(tConf.address);

  const uClient = new UnauthenticatedPlClient(plConf);

  const requireAuth = await uClient.requireAuth();

  if (!requireAuth && (tConf.test_user !== undefined || tConf.test_password !== undefined))
    throw new Error(
      `Server require no auth, but test user name or test password are provided via (${CONFIG_FILE}) or env variables: PL_TEST_USER and PL_TEST_PASSWORD`
    );

  if (requireAuth && (tConf.test_user === undefined || tConf.test_password === undefined))
    throw new Error(
      `No auth information found in config (${CONFIG_FILE}) or env variables: PL_TEST_USER and PL_TEST_PASSWORD`
    );

  if (authInformation === undefined) {
    if (requireAuth) authInformation = await uClient.login(tConf.test_user!, tConf.test_password!);
    // No authorization is required
    else authInformation = {};

    // saving cache
    saveAuthInfoCallback(tConf)(authInformation);
  }

  return {
    conf: plConf,
    auth: {
      authInformation,
      onUpdate: saveAuthInfoCallback(tConf),
      onAuthError: cleanAuthInfoCallback,
      onUpdateError: cleanAuthInfoCallback
    }
  };
}

export async function getTestLLClient(confOverrides: Partial<PlClientConfig> = {}) {
  const { conf, auth } = await getTestClientConf();
  return new LLPlClient({ ...conf, ...confOverrides }, { auth });
}

export async function getTestClient(alternativeRoot?: string) {
  const { conf, auth } = await getTestClientConf();
  if (alternativeRoot !== undefined && conf.alternativeRoot !== undefined)
    throw new Error('test pl address configured with alternative root');
  return await PlClient.init({ ...conf, alternativeRoot }, auth);
}

export async function withTempRoot<T>(body: (pl: PlClient) => Promise<T>): Promise<T> {
  const altRoot = `test_${Date.now()}_${randomUUID()}`;
  let altRootId: OptionalResourceId = NullResourceId;
  try {
    const client = await getTestClient(altRoot);
    altRootId = client.clientRoot;
    const value = await body(client);
    const rawClient = await getTestClient();
    await rawClient.deleteAlternativeRoot(altRoot);
    return value;
  } catch (err: any) {
    console.log(`ALTERNATIVE ROOT: ${altRoot} (${resourceIdToString(altRootId)})`);
    throw new Error(err.message, { cause: err });
  }
}
