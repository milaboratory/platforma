import upath from "upath";
import os from "node:os";
import { assertNever, fileExists } from "@milaboratories/ts-helpers";

/** How to get a license. */
export type PlLicenseMode = PlLicenseEnv | PlLicensePlain;

export type PlLicenseEnv = {
  readonly type: "env";
};

export type PlLicensePlain = {
  readonly type: "plain";
  readonly value: string;
};

/** A normalized license value. */
export type License = LicenseValue | LicenseFile;

export type LicenseValue = {
  readonly type: "value";
  readonly value: string;
};

export type LicenseFile = {
  readonly type: "file";
  readonly file: string;
};

export async function getLicense(opts: PlLicenseMode) {
  const t = opts.type;
  switch (t) {
    case "plain":
      return { type: "value", value: opts.value } satisfies LicenseValue;
    case "env":
      return await getLicenseFromEnv();
    default:
      assertNever(t);
  }
}

/** Gets MI_LICENSE, PL_LICENSE envs or reads a file stored in a homedir or is pointed by envs. */
export async function getLicenseFromEnv(): Promise<License> {
  let license = undefined;
  if ((process.env.MI_LICENSE ?? "") != "") license = process.env.MI_LICENSE;
  else if ((process.env.PL_LICENSE ?? "") != "") license = process.env.PL_LICENSE;
  if (license !== undefined)
    return {
      type: "value",
      value: license,
    };

  let licenseFile = undefined;
  if ((process.env.MI_LICENSE_FILE ?? "") != "") licenseFile = process.env.MI_LICENSE_FILE;
  else if ((process.env.PL_LICENSE_FILE ?? "") != "") licenseFile = process.env.PL_LICENSE_FILE;
  else if (await fileExists(upath.resolve(os.homedir(), ".pl.license")))
    licenseFile = upath.resolve(os.homedir(), ".pl.license");

  if (licenseFile !== undefined)
    return {
      type: "file",
      file: licenseFile,
    };

  throw new Error("no license in envs");
}
