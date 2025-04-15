import { type InjectionKey, type ModelRef } from 'vue';

export const radioGroupNameKey: InjectionKey<string | undefined> = Symbol();
export const radioGroupModelKey: InjectionKey<ModelRef<unknown>> = Symbol();
