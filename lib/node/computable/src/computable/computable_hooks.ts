import { Computable } from './computable';

/** Allows to listen for user interaction events after computable is created.
 * Can be injected by accessors, if they need to track interactions with
 * derived computable. */
export interface ComputableHooks {
  onChangedRequest(instance: Computable<unknown>): void;

  onGetValue(instance: Computable<unknown>): void;

  onListenStart(instance: Computable<unknown>): void;

  onListenStop(instance: Computable<unknown>): void;

  refreshState(instance: Computable<unknown>): Promise<void>;
}
