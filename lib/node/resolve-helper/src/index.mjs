import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export function tryResolve(root, request) {
  try {
    return require.resolve(request, {
      paths: [root]
    });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
  return undefined;
}
