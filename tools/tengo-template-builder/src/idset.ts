import { ArtefactId, artefactKey } from './package';

export class ArtefactMap<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly idExtractor: (obj: T) => ArtefactId) {
  }

  add(obj: T, replace: boolean = true): T | undefined {
    const key = artefactKey(this.idExtractor(obj));
    const ret = this.map.get(key);
    if (ret && !replace)
      return ret;
    this.map.set(key, obj);
    return ret;
  }

  get(id: ArtefactId): T | undefined {
    return this.map.get(artefactKey(id));
  }

  get array(): T[] {
    const ret: T[] = [];
    this.map.forEach(id => ret.push(id));
    return ret;
  }

  forEach(callback: (value: T, key: ArtefactId) => void) {
    this.map.forEach(v => callback(v, this.idExtractor(v)));
  }
}

export function createArtefactIdSet(): ArtefactMap<ArtefactId> {
  return new ArtefactMap<ArtefactId>(obj => obj);
}
