import type { Computable } from './computable';

/** Allows to listen for user interaction events after computable is created.
 * Can be injected by accessors, if they need to track interactions with
 * derived computable. */
export interface ComputableHooks {
  onChangedRequest(instance: Computable<unknown>): void;

  onGetValue(instance: Computable<unknown>): void;

  /**
   * Executed only once for specific Computable, if more subscriptions are
   * created, Computable instance do ref counting, and then when there are no
   * subscriptions calls {@link onListenStop}.
   * */
  onListenStart(instance: Computable<unknown>): void;

  /**
   * Executed when no subscriptions left for a specific computable instance.
   * See docs for {@link onListenStart}.
   * */
  onListenStop(instance: Computable<unknown>): void;

  refreshState(instance: Computable<unknown>): Promise<void>;
}
