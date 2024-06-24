import type { TableSettings } from './types';
import Component from './TableComponent.vue';
import * as Types from './types';

export function settings<const S extends TableSettings>(settings: S) {
  return Object.freeze(settings);
}

export { Component };

export { Types };
