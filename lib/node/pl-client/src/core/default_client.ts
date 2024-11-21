import fs from 'node:fs';
import { AuthInformation, plAddressToConfig, PlClientConfig } from './config';
import canonicalize from 'canonicalize';
import YAML from 'yaml';
import * as os from 'node:os';
import * as path from 'node:path';
import { notEmpty } from '@milaboratories/ts-helpers';
import { UnauthenticatedPlClient } from './unauth_client';
import { PlClient } from './client';
import { createHash } from 'crypto';
import { inferAuthRefreshTime } from './auth';

const CONFIG_FILE_LOCAL_JSON = 'pl.json';
const CONFIG_FILE_USER_JSON = path.join(os.homedir(), '.pl.json');
const CONFIG_FILE_LOCAL_YAML = 'pl.yaml';
const CONFIG_FILE_USER_YAML = path.join(os.homedir(), '.pl.yaml');
const CONF_FILE_SEQUENCE = [
  CONFIG_FILE_LOCAL_JSON,
  CONFIG_FILE_LOCAL_YAML,
  CONFIG_FILE_USER_JSON,
  CONFIG_FILE_USER_YAML
];

const AUTH_DATA_FILE = '.pl_auth.json';

type FileConfigOverrideFields =
  | 'grpcProxy'
  | 'httpProxy'
  | 'user'
  | 'password'
  | 'alternativeRoot'
  | 'defaultROTransactionTimeout'
  | 'defaultRWTransactionTimeout'
  | 'defaultRequestTimeout'
  | 'authTTLSeconds'
  | 'authMaxRefreshSeconds';
const FILE_CONFIG_OVERRIDE_FIELDS: FileConfigOverrideFields[] = [
  'grpcProxy',
  'httpProxy',
  'user',
  'password',
  'alternativeRoot',
  'defaultROTransactionTimeout',
  'defaultRWTransactionTimeout',
  'defaultRequestTimeout',
  'authTTLSeconds',
  'authMaxRefreshSeconds'
];

type PlConfigFile = {
  address: string;
} & Partial<Pick<PlClientConfig, FileConfigOverrideFields>>;

interface AuthCache {
  /** To check if config changed */
  confHash: string;
  expiration: number;
  authInformation: AuthInformation;
}

export function tryGetFileConfig(): [PlConfigFile, string] | undefined {
  for (const confPath of CONF_FILE_SEQUENCE)
    if (fs.existsSync(confPath)) {
      const fileContent = fs.readFileSync(confPath, { encoding: 'utf-8' });
      if (confPath.endsWith('json')) return [JSON.parse(fileContent) as PlConfigFile, confPath];
      else return [YAML.parse(fileContent) as PlConfigFile, confPath];
    }
  return undefined;
}

function saveAuthInfoCallback(
  confHash: string,
  authMaxRefreshSeconds: number
): (newAuthInfo: AuthInformation) => void {
  return (newAuthInfo) => {
    fs.writeFileSync(
      AUTH_DATA_FILE,
      Buffer.from(
        JSON.stringify({
          confHash,
          authInformation: newAuthInfo,
          expiration: inferAuthRefreshTime(newAuthInfo, authMaxRefreshSeconds)
        } as AuthCache)
      ),
      'utf8'
    );
  };
}

const cleanAuthInfoCallback = () => {
  fs.rmSync(AUTH_DATA_FILE);
};

/** Uses default algorithm to construct a pl client from the environment */
export async function defaultPlClient(): Promise<PlClient> {
  let config: PlClientConfig | undefined = undefined;
  if (process.env.PL_ADDRESS !== undefined) {
    config = plAddressToConfig(process.env.PL_ADDRESS);
  } else {
    const fromFile = tryGetFileConfig();
    if (fromFile !== undefined) {
      const [fileConfig, configPath] = fromFile;
      const address = notEmpty(fileConfig.address, `no pl address in file: ${configPath}`);
      config = plAddressToConfig(address);
      // applying overrides
      for (const field of FILE_CONFIG_OVERRIDE_FIELDS)
        if (fileConfig[field] !== undefined) (config as any)[field] = fileConfig[field];
    }
  }

  if (config === undefined)
    throw new Error("Can't find configuration to create default platform client.");

  if (process.env.PL_USER !== undefined) config.user = process.env.PL_USER;

  if (process.env.PL_PASSWORD !== undefined) config.user = process.env.PL_PASSWORD;

  const confHash = createHash('sha256')
    .update(Buffer.from(canonicalize(config)!))
    .digest('base64');

  let authInformation: AuthInformation | undefined = undefined;

  // try recover auth information from cache
  if (fs.existsSync(AUTH_DATA_FILE)) {
    const cache: AuthCache = JSON.parse(fs.readFileSync(AUTH_DATA_FILE, { encoding: 'utf-8' }));
    if (cache.confHash === confHash && cache.expiration > Date.now())
      authInformation = cache.authInformation;
  }

  if (authInformation === undefined) {
    const client = new UnauthenticatedPlClient(config);

    if (await client.requireAuth()) {
      if (config.user === undefined || config.password === undefined)
        throw new Error(`No auth information for found to authenticate with PL server.`);
      authInformation = await client.login(config.user, config.password);
    } else {
      // No authorization is required
      authInformation = {};
    }

    // saving cache
    fs.writeFileSync(
      AUTH_DATA_FILE,
      Buffer.from(
        JSON.stringify({
          confHash,
          authInformation,
          expiration: inferAuthRefreshTime(authInformation, config.authMaxRefreshSeconds)
        } as AuthCache)
      ),
      'utf8'
    );
  }

  return await PlClient.init(config, {
    authInformation,
    onUpdate: (newAuthInfo) => saveAuthInfoCallback(confHash, config!.authMaxRefreshSeconds),
    onUpdateError: cleanAuthInfoCallback,
    onAuthError: cleanAuthInfoCallback
  });
}
