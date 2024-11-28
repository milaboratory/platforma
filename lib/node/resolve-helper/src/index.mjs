import { createRequire } from 'node:module';

export function tryResolve(root, request) {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve(request, {
      paths: [root]
    });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
  return undefined;
}
