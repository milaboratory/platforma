import { type InjectionKey, type ComputedRef, inject } from 'vue';
import type { Settings } from './types';
import type { State } from './state';

export const settingsKey = Symbol() as InjectionKey<ComputedRef<Settings>>;

export const stateKey = Symbol() as InjectionKey<State>;

export const injectState = () => inject(stateKey)!;
