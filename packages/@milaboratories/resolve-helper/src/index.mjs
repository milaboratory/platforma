import { createRequire } from 'node:module';

export function tryResolveOrError(root, request) {
  try {
    const require = createRequire(import.meta.url);
    const result = require.resolve(request, {
      paths: [root]
    });
    return { result };
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw err;
    return { err: err.code };
  }
}

export function tryResolve(root, request) {
  const result = tryResolveOrError(root, request);
  return result.result;
}
