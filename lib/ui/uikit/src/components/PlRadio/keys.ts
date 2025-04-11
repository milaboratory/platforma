import { type InjectionKey, type ModelRef } from 'vue';

export const radioGroupNameKey: InjectionKey<string> = Symbol();
export const radioGroupModelKey: InjectionKey<ModelRef<unknown>> = Symbol();
