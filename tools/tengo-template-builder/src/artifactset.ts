import { ArtifactName, artifactKey } from './package';

export class ArtifactMap<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly nameExtractor: (obj: T) => ArtifactName) {
  }

  add(obj: T, replace: boolean = true): T | undefined {
    const key = artifactKey(this.nameExtractor(obj));
    const ret = this.map.get(key);
    if (ret && !replace)
      return ret;
    this.map.set(key, obj);
    return ret;
  }

  get(name: ArtifactName): T | undefined {
    return this.map.get(artifactKey(name));
  }

  get array(): T[] {
    const ret: T[] = [];
    this.map.forEach(obj => ret.push(obj));
    return ret;
  }

  forEach(callback: (value: T, key: ArtifactName) => void) {
    this.map.forEach(v => callback(v, this.nameExtractor(v)));
  }
}

export function createArtifactNameSet(): ArtifactMap<ArtifactName> {
  return new ArtifactMap<ArtifactName>(obj => obj);
}
