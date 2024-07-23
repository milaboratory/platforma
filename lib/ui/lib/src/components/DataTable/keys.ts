import { type InjectionKey, type ComputedRef, inject } from 'vue';
import type { TableSettings } from './types';
import type { State } from './state';

export const settingsKey = Symbol() as InjectionKey<ComputedRef<TableSettings>>;

export const stateKey = Symbol() as InjectionKey<State>;

export const injectState = () => inject(stateKey)!;
