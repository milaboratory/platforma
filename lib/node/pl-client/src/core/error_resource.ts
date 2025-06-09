import type { ResourceType } from './types';

export type ErrorResourceData = {
  message: string;
};

export const ErrorResourceType: ResourceType = {
  name: 'json/resourceError',
  version: '1',
};
