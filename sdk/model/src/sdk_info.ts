import { PlatformaSDKVersion } from './generated/version';

export type SdkInfo = {
  readonly sdkVersion: string;
};

export const CurrentSdkInfo: SdkInfo = {
  sdkVersion: PlatformaSDKVersion,
};
