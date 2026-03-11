import { version } from "../package.json";
export const PlatformaSDKVersion = version;

export type SdkInfo = {
  readonly sdkVersion: string;
};

export const CurrentSdkInfo: SdkInfo = {
  sdkVersion: PlatformaSDKVersion,
};
