import { PlatformaSDKVersion } from './version';

export type SdkInfo = {
  readonly sdkVersion: string;
};

export const CurrentSdkInfo: SdkInfo = {
  sdkVersion: PlatformaSDKVersion,
};
