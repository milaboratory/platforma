import path from 'path';
import os from 'os';
import { assertNever, fileExists } from '@milaboratories/ts-helpers';
import { PlConfig, PlLicenseSettings } from './types';

export type PlLicenseMode = PlLicenseEnv | PlLicensePlain;

export type PlLicenseEnv = {
  readonly type: 'env';
};

export type PlLicensePlain = {
  readonly type: 'plain';
  readonly value: string;
};

export type License = LicenseValue | LicenseFile;

export type LicenseValue = {
  readonly type: 'value';
  readonly value: string;
};

export type LicenseFile = {
  readonly type: 'file';
  readonly file: string;
};

export async function getLicense(opts: PlLicenseMode) {
  const t = opts.type;
  switch (t) {
    case 'plain':
      return { type: 'value', value: opts.value } satisfies LicenseValue;
    case 'env':
      return await getLicenseFromEnv();
    default:
      assertNever(t);
  }
}

export async function getLicenseFromEnv(): Promise<License> {
  let license = undefined;
  if ((process.env.MI_LICENSE ?? '') != '') license = process.env.MI_LICENSE;
  else if ((process.env.PL_LICENSE ?? '') != '') license = process.env.PL_LICENSE;
  if (license !== undefined)
    return {
      type: 'value',
      value: license
    };

  let licenseFile = undefined;
  if ((process.env.MI_LICENSE_FILE ?? '') != '') licenseFile = process.env.MI_LICENSE_FILE;
  else if ((process.env.PL_LICENSE_FILE ?? '') != '') licenseFile = process.env.PL_LICENSE_FILE;
  else if (await fileExists(path.resolve(os.homedir(), '.pl.license')))
    licenseFile = path.resolve(os.homedir(), '.pl.license');

  if (licenseFile !== undefined)
    return {
      type: 'file',
      file: licenseFile
    };

  throw new Error('no license in envs');
}

export function licenseEnvsForMixcr(license: License): Record<string, string> {
  const t = license.type;
  switch (t) {
    case 'value':
      return { MI_LICENSE: license.value };
    case 'file':
      return { MI_LICENSE_FILE: license.file };
    default:
      assertNever(t);
  }
}

export function licenseForConfig(license: License): PlLicenseSettings {
  const t = license.type;
  switch (t) {
    case 'value':
      return { value: license.value, file: '' };
    case 'file':
      return { value: '', file: license.file };
    default:
      assertNever(t);
  }
}
