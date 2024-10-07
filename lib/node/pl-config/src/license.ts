import path from 'path';
import os from 'os';
import { assertNever, fileExists } from '@milaboratories/ts-helpers';
import { PlConfig } from './types';

export type PlLicenseMode =
  | PlLicenseEnv
  | PlLicensePlain;

export type PlLicenseEnv = {
  readonly type: 'env'
}

export type PlLicensePlain = {
  readonly type: 'plain';
  readonly value: string;
}

export type License =
  | LicenseValue
  | LicenseFile;

export type LicenseValue = {
  readonly type: 'value';
  readonly value: string;
}

export type LicenseFile = {
  readonly type: 'file';
  readonly file: string;
}

export async function getLicense(opts: PlLicenseMode) {
  const t = opts.type;
  switch (t) {
    case 'plain':
      return {type: 'value', value: opts.value} satisfies LicenseValue;
    case 'env':
      return await getLicenseFromEnv()
    default:
      assertNever(t);
  }
}

export async function getLicenseFromEnv(): Promise<License> {
  let license = undefined;
  if ((process.env.MI_LICENSE ?? '') != '')
    license = process.env.MI_LICENSE;
  else if ((process.env.PL_LICENSE ?? '') != '')
    license = process.env.PL_LICENSE;
  if (license !== undefined)
    return {
      type: 'value',
      value: license
    };

  let licenseFile = undefined;
  if ((process.env.MI_LICENSE_FILE ?? '') != '')
    licenseFile = process.env.MI_LICENSE_FILE;
  else if ((process.env.PL_LICENSE_FILE ?? '') != '')
    licenseFile = process.env.PL_LICENSE_FILE;
  else if (await fileExists(path.resolve(os.homedir(), '.pl.license')))
    licenseFile = path.resolve(os.homedir(), '.pl.license');

  if (licenseFile !== undefined) return {
    type: 'file',
    file: licenseFile
  };

  throw new Error('no license in envs');
}

export function mergeLicense(license: License, config: PlConfig) {
  const t = license.type;
  switch (t) {
    case 'value':
      config.license.value = license.value;
      return
    case 'file':
      config.license.file = license.file;
      return
    default:
      assertNever(t);
  }
}
