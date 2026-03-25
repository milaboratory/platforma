import type {
  Branded,
  ServiceTypesLike,
  InferServiceUi,
  ServiceName,
  Services,
} from "@milaboratories/pl-model-common";

type FlagToService<Flag extends string> = Flag extends `requires${infer K}`
  ? K extends keyof typeof Services
    ? (typeof Services)[K]
    : never
  : never;

type InferServiceModel<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<infer M, unknown> ? M : unknown;

type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

// Resolve typed services from feature flags
// { requiresPFrameSpec: true } -> { pframeSpec: PFrameSpecDriver }
export type ResolveModelServices<Flags> = UnionToIntersection<
  {
    [K in keyof Flags & `requires${string}`]: Flags[K] extends true
      ? Record<
          FlagToService<K & string> & string,
          InferServiceModel<ServiceBrand<FlagToService<K & string>>>
        >
      : never;
  }[keyof Flags & `requires${string}`]
>;

export type ResolveUiServices<Flags> = UnionToIntersection<
  {
    [K in keyof Flags & `requires${string}`]: Flags[K] extends true
      ? Record<
          FlagToService<K & string> & string,
          InferServiceUi<ServiceBrand<FlagToService<K & string>>>
        >
      : never;
  }[keyof Flags & `requires${string}`]
>;

// Makes a remote node service appear local.
// Given a service ID, returns an object implementing the service's UI interface.
// Provided by the desktop app (e.g. backed by Electron IPC).
export type NodeServiceProxy = <S extends ServiceTypesLike>(
  serviceId: ServiceName<S>,
) => InferServiceUi<S>;
