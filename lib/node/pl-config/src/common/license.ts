import upath from 'upath';
import os from 'node:os';
import { assertNever, fileExists } from '@milaboratories/ts-helpers';
import type { PlLicenseSettings } from './types';
import * as fs from 'node:fs/promises';

/** How to get a license. */
export type PlLicenseMode = PlLicenseEnv | PlLicensePlain;

export type PlLicenseEnv = {
  readonly type: 'env';
};

export type PlLicensePlain = {
  readonly type: 'plain';
  readonly value: string;
};

/** A normalized license value. */
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

/** Gets a license as a value even if it's stored in a file (it reads the file). */
export async function getLicenseValue(opts: PlLicenseMode): Promise<LicenseValue> {
  const license = await getLicense(opts);

  if (license.type == 'file') {
    const value = await fs.readFile(license.file);
    return { type: 'value', value: value.toString().trim() };
  }

  return license;
}

/** Gets MI_LICENSE, PL_LICENSE envs or reads a file stored in a homedir or is pointed by envs. */
export async function getLicenseFromEnv(): Promise<License> {
  let license = undefined;
  if ((process.env.MI_LICENSE ?? '') != '') license = process.env.MI_LICENSE;
  else if ((process.env.PL_LICENSE ?? '') != '') license = process.env.PL_LICENSE;
  if (license !== undefined)
    return {
      type: 'value',
      value: license,
    };

  let licenseFile = undefined;
  if ((process.env.MI_LICENSE_FILE ?? '') != '') licenseFile = process.env.MI_LICENSE_FILE;
  else if ((process.env.PL_LICENSE_FILE ?? '') != '') licenseFile = process.env.PL_LICENSE_FILE;
  else if (await fileExists(upath.resolve(os.homedir(), '.pl.license')))
    licenseFile = upath.resolve(os.homedir(), '.pl.license');

  if (licenseFile !== undefined)
    return {
      type: 'file',
      file: licenseFile,
    };

  throw new Error('no license in envs');
}

/** Compiles a license secret for MiXCR software. */
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

/** Compiles a license for Platforma Backend config. */
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
