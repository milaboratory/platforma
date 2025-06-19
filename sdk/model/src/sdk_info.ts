import { PlatformaSDKVersion } from './version';
import { PlatformaApiVersion } from './api_version';

export type SdkInfo = {
  readonly sdkVersion: string;
  readonly platformaApiVersion: `${number}` | undefined;
};

export const CurrentSdkInfo: SdkInfo = {
  sdkVersion: PlatformaSDKVersion,
  platformaApiVersion: PlatformaApiVersion,
};
