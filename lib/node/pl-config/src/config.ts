import { assertNever, fileExists, MiLogger } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { MiddleLayerOps, MiddleLayerOpsConstructor } from '@milaboratories/pl-middle-layer';
import { PlConfigPorts } from './ports';
import { PlConfig, PlLogLevel } from './types';
import { getLicense, getLicenseFromEnv, mergeLicense, PlLicenseMode } from './license';

export const configLocalYaml = 'config-local.yaml';

export function getConfigPath(dir: string) {
  return path.join(dir, configLocalYaml);
}

export function parseConfig(config: string) {
  return yaml.parse(config);
}

export function stringifyConfig(config: any) {
  return yaml.stringify(config);
}

export async function readConfig(configPath: string) {
  return (await fs.readFile(configPath)).toString();
}

export async function writeConfig(logger: MiLogger, configPath: string, config: string) {
  logger.info(`writing configuration '${configPath}'...`);
  await fs.writeFile(configPath, config);
}

export type PlConfigOptions = {
  workingDir: string;
  logLevel: PlLogLevel;
  portsMode: PlConfigPorts;
  licenseMode: PlLicenseMode;
}

export type PlLocalConfigs = {
  plLocal: string;
  ml: MiddleLayerOpsConstructor;
}

export async function getDefaultLocalConfigs(
  opts: PlConfigOptions,
): Promise<PlLocalConfigs> {
  return {

  }
}

async function getDefaultPlLocalConfig(
  opts: PlConfigOptions,
): Promise<string> {
  const ports = await getPorts(opts.portsMode)
  const htpasswdAuth = await createHtpasswdFile(opts.workingDir, {
    user: 'defaultuser',
    passwd: 'defaultpassword'
  });

  const config: PlConfig = {
    license: { file: '', value: '' },
    logging: {
      level: opts.logLevel,
      destinations: [{
        path: path.join(opts.workingDir, "platforma.log"),
      }],
    },
    monitoring: {
      enabled: true,
      listen: ports.monitoring
    },
    debug: {
      enabled: true,
      listen: ports.debug,
    },
    core: {
      logging: {
        extendedInfo: true,
        dumpResourceData: true,
      },
      grpc: {
        listen: ports.grpc,
        tls: { enable: false },
      },
      authEnabled: true,
      auth: [{drivers: [{
        driver: 'htpasswd',
        path: htpasswdAuth,
      }]}],
      db: {
        path: path.join(opts.workingDir, )
      }
    },
    controllers: {},
  }

const license = await getLicense(opts.licenseMode);
mergeLicense(license, config);
}
