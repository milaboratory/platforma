import * as nodePath from 'node:path';

const _root = nodePath.resolve(nodePath.join(import.meta.dirname, '..', '..'))

export function path(...p) {
    return nodePath.join(_root, ...p);
}

export function asset(...p) {
    return path('assets', ...p)
}
