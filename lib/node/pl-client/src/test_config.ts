import * as fs from 'node:fs';
import { AuthInformation, inferAuthRefreshTime, LLPlClient, UnauthenticatedPlClient } from './ll_pl_client';
import { plAddressToConfig, PlConnectionConfig } from './config';

export interface TestConfig {
  address: string;
  test_user?: string;
  test_password?: string;
}

const CONFIG_FILE = 'test_config.json';
const AUTH_DATA_FILE = '.test_auth.json';

export function getTestConfig(): TestConfig {
  let conf: Partial<TestConfig> = {};
  if (fs.existsSync(CONFIG_FILE))
    conf = JSON.parse(fs.readFileSync(CONFIG_FILE, { encoding: 'utf-8' }));

  if (process.env.PL_ADDRESS !== undefined)
    conf.address = process.env.PL_ADDRESS;

  if (process.env.PL_TEST_USER !== undefined)
    conf.test_user = process.env.PL_TEST_USER;

  if (process.env.PL_TEST_PASSWORD !== undefined)
    conf.test_password = process.env.PL_TEST_PASSWORD;

  if (conf.address === undefined)
    throw new Error(`can't resolve platform address (checked ${CONFIG_FILE} file and PL_ADDRESS environment var)`);

  return conf as TestConfig;
}

interface AuthCache {
  /** To check if config changed */
  conf: TestConfig,
  expiration: number,
  authInformation: AuthInformation
}

export async function getTestLLClientData(): Promise<{ conf: PlConnectionConfig, authInformation: AuthInformation }> {
  const tConf = getTestConfig();

  let authInformation: AuthInformation | undefined = undefined;

  // try recover from cache
  if (fs.existsSync(AUTH_DATA_FILE)) {
    const cache: AuthCache = JSON.parse(fs.readFileSync(AUTH_DATA_FILE, { encoding: 'utf-8' }));
    if (cache.conf.address === tConf.address
      && cache.conf.test_user === tConf.test_user
      && cache.conf.test_password === tConf.test_password
      && cache.expiration > Date.now())
      authInformation = cache.authInformation;
  }

  const plConf = plAddressToConfig(tConf.address);

  if (authInformation === undefined) {
    const client = new UnauthenticatedPlClient(plConf);

    if (await client.requireAuth()) {
      if (tConf.test_user === undefined || tConf.test_password === undefined)
        throw new Error(`No auth information found in config (${CONFIG_FILE}) or env variables: PL_TEST_USER and PL_TEST_PASSWORD`);
      authInformation = await client.login(tConf.test_user, tConf.test_password);
    } else {
      // No authorization is required
      authInformation = {};
    }

    // saving cache
    fs.writeFileSync(AUTH_DATA_FILE, Buffer.from(JSON.stringify({
      conf: tConf, authInformation,
      expiration: inferAuthRefreshTime(authInformation, plConf.authMaxRefreshSeconds)
    } as AuthCache)), 'utf8');
  }

  return { conf: plConf, authInformation };
}

export async function getTestLLClient() {
  const { conf, authInformation } = await getTestLLClientData();
  return new LLPlClient(conf, { plAuthOptions: { authInformation } });
}
