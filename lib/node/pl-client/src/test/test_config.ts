import * as fs from 'node:fs';
import { LLPlClient } from '../core/ll_client';
import type { AuthInformation, AuthOps, PlClientConfig } from '../core/config';
import { plAddressToConfig } from '../core/config';
import { UnauthenticatedPlClient } from '../core/unauth_client';
import { PlClient } from '../core/client';
import { randomUUID } from 'node:crypto';
import type { OptionalResourceId } from '../core/types';
import { NullResourceId, resourceIdToString } from '../core/types';
import { inferAuthRefreshTime } from '../core/auth';
import * as path from 'node:path';
import type { TestTcpProxy } from './tcp-proxy';
import { startTcpProxy } from './tcp-proxy';

export {
  TestTcpProxy,
};

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
    conf = JSON.parse(fs.readFileSync(CONFIG_FILE, { encoding: 'utf-8' })) as TestConfig;

  if (process.env.PL_ADDRESS !== undefined) conf.address = process.env.PL_ADDRESS;

  if (process.env.PL_TEST_USER !== undefined) conf.test_user = process.env.PL_TEST_USER;

  if (process.env.PL_TEST_PASSWORD !== undefined) conf.test_password = process.env.PL_TEST_PASSWORD;

  if (process.env.PL_TEST_PROXY !== undefined) conf.test_proxy = process.env.PL_TEST_PROXY;

  if (conf.address === undefined)
    throw new Error(
      `can't resolve platform address (checked ${CONFIG_FILE} file and PL_ADDRESS environment var)`,
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
          expiration: inferAuthRefreshTime(authInformation, 24 * 60 * 60),
        } as AuthCache),
      ),
      'utf8',
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
        fs.readFileSync(getFullAuthDataFilePath(), { encoding: 'utf-8' }),
      ) as AuthCache; // TODO runtime validation
      if (
        cache.conf.address === tConf.address
        && cache.conf.test_user === tConf.test_user
        && cache.conf.test_password === tConf.test_password
        && cache.expiration > Date.now()
      )
        authInformation = cache.authInformation;
    } catch (_e) {
      // removing cache file on any error
      fs.rmSync(getFullAuthDataFilePath());
    }
  }

  const plConf = plAddressToConfig(tConf.address);

  const uClient = new UnauthenticatedPlClient(plConf);

  const requireAuth = await uClient.requireAuth();

  if (!requireAuth && (tConf.test_user !== undefined || tConf.test_password !== undefined))
    throw new Error(
      `Server require no auth, but test user name or test password are provided via (${CONFIG_FILE}) or env variables: PL_TEST_USER and PL_TEST_PASSWORD`,
    );

  if (requireAuth && (tConf.test_user === undefined || tConf.test_password === undefined))
    throw new Error(
      `No auth information found in config (${CONFIG_FILE}) or env variables: PL_TEST_USER and PL_TEST_PASSWORD`,
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
      onUpdateError: cleanAuthInfoCallback,
    },
  };
}

export async function getTestLLClient(confOverrides: Partial<PlClientConfig> = {}) {
  const { conf, auth } = await getTestClientConf();
  return new LLPlClient({ ...conf, ...confOverrides }, { auth });
}

export async function getTestClient(
  alternativeRoot?: string,
  confOverrides: Partial<PlClientConfig> = {},
) {
  const { conf, auth } = await getTestClientConf();
  if (alternativeRoot !== undefined && conf.alternativeRoot !== undefined)
    throw new Error('test pl address configured with alternative root');
  return await PlClient.init({ ...conf, ...confOverrides, alternativeRoot }, auth);
}

export type WithTempRootOptions = {
  /** If true and PL_ADDRESS is http://localhost or http://127.0.0.1:<port>,
   * a TCP proxy will be started and PL client will connect through it. */
  viaTcpProxy: true;
  /** Artificial latency for proxy (ms). Default 0 */
  proxyLatencyMs?: number;
} | {
  viaTcpProxy?: undefined;
};

export async function withTempRoot<T>(
  body: (pl: PlClient) => Promise<T>
): Promise<T | void>;

export async function withTempRoot<T>(
  body: (pl: PlClient, proxy: Awaited<ReturnType<typeof startTcpProxy>>) => Promise<T>,
  options: {
    viaTcpProxy: true;
    proxyLatencyMs?: number;
  },
): Promise<T>;

export async function withTempRoot<T>(
  body: (pl: PlClient, proxy: any) => Promise<T>,
  options: WithTempRootOptions = {},
): Promise<T | undefined> {
  const alternativeRoot = `test_${Date.now()}_${randomUUID()}`;
  let altRootId: OptionalResourceId = NullResourceId;
  // Proxy management
  let proxy: Awaited<ReturnType<typeof startTcpProxy>> | undefined;
  let confOverrides: Partial<PlClientConfig> = {};
  try {
    // Optionally start TCP proxy and rewrite PL_ADDRESS to point to proxy
    if (options.viaTcpProxy === true && process.env.PL_ADDRESS) {
      try {
        const url = new URL(process.env.PL_ADDRESS);
        const isHttp = url.protocol === 'http:';
        const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
        const port = parseInt(url.port);
        if (isHttp && isLocal && Number.isFinite(port)) {
          proxy = await startTcpProxy({ targetPort: port, latency: options.proxyLatencyMs ?? 0 });
          // Override client connection host:port to proxy
          confOverrides = { hostAndPort: `127.0.0.1:${proxy.port}` } as Partial<PlClientConfig>;
        } else {
          console.warn('*** skipping proxy-based test, PL_ADDRESS is not localhost', process.env.PL_ADDRESS);
          return;
        }
      } catch (_e) {
        // ignore proxy setup errors; tests will run against original address
      }
    }

    const client = await getTestClient(alternativeRoot, confOverrides);
    altRootId = client.clientRoot;
    const value = await body(client, proxy);
    const rawClient = await getTestClient();
    try {
      await rawClient.deleteAlternativeRoot(alternativeRoot);
    } catch (cleanupErr: any) {
      // Cleanup may fail if test intentionally deleted resources
      console.warn(`Failed to clean up alternative root ${alternativeRoot}:`, cleanupErr.message);
    }
    return value;
  } catch (err: any) {
    console.log(`ALTERNATIVE ROOT: ${alternativeRoot} (${resourceIdToString(altRootId)})`);
    throw err;
    // throw new Error('withTempRoot error: ' + err.message, { cause: err });
  } finally {
    // Stop proxy if started
    if (proxy) {
      try {
        await proxy.disconnectAll();
      } catch (_e) { /* ignore */ }
      try {
        await new Promise<void>((resolve) => proxy!.server.close(() => resolve()));
      } catch (_e) { /* ignore */ }
    }
  }
}
