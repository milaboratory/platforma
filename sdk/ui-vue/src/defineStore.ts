import { reactive, onScopeDispose, getCurrentScope, effectScope } from 'vue';

const shelf = new Map<symbol, unknown>();

function initStore<S extends object>(key: symbol, cb: () => S) {
  const scope = getCurrentScope() ?? effectScope();

  const store = scope.run(() => {
    onScopeDispose(() => {
      shelf.delete(key);
    });

    return reactive(cb());
  }) as S;

  (store as Disposable)[Symbol.dispose] = () => {
    scope.stop();
  };

  return store;
}

export function defineStore<S extends object>(cb: () => S) {
  const key = Symbol();

  return () => {
    if (!shelf.has(key)) {
      shelf.set(key, initStore(key, cb));
    }
    return shelf.get(key) as S & Disposable;
  };
}
