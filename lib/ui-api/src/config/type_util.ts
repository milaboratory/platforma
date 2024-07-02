import { ExtractAction, TypedConfig } from './type_engine';

export type SyncConfAction = { isSync: true }

export type IsSyncConf<Cfg extends TypedConfig> = ExtractAction<Cfg> extends SyncConfAction ? true : false;
export type CheckedSyncConf<Cfg extends TypedConfig> = Checked<Cfg, IsSyncConf<Cfg>>

export type Not<T extends boolean> = T extends true ? false : true

export type Or<A extends boolean, B extends boolean> = A extends true
  ? true
  : B extends true
    ? true
    : false

export type And<A extends boolean, B extends boolean> = A extends true
  ? B extends true
    ? true
    : false
  : false

export type IsA<T, E> = T extends E ? true : false

export type Checked<Type, Condition> = Condition extends true ? Type : 'error';
