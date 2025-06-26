import { PlatformaSDKVersion } from './version';
import { PlatformaApiVersion } from './api_version';
import type { ApiVersion } from '@milaboratories/pl-model-common';

export type SdkInfo = {
  readonly sdkVersion: string;
  readonly platformaApiVersion: ApiVersion | undefined;
};

export const CurrentSdkInfo: SdkInfo = {
  sdkVersion: PlatformaSDKVersion,
  platformaApiVersion: PlatformaApiVersion,
};
