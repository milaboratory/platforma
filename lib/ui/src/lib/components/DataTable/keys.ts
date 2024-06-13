import type { InjectionKey, ComputedRef } from 'vue';
import type { Settings } from './types';

export const settingsKey = Symbol() as InjectionKey<ComputedRef<Settings>>;
