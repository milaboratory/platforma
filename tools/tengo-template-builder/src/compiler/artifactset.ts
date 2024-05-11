import { TypedArtifactName, artifactKey } from './package';

export class ArtifactMap<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly nameExtractor: (obj: T) => TypedArtifactName) {
  }

  add(obj: T, replace: boolean = true): T | undefined {
    const key = artifactKey(this.nameExtractor(obj));
    const ret = this.map.get(key);
    if (ret && !replace)
      return ret;
    this.map.set(key, obj);
    return ret;
  }

  get(name: TypedArtifactName): T | undefined {
    return this.map.get(artifactKey(name));
  }

  get array(): T[] {
    const ret: T[] = [];
    this.map.forEach(obj => ret.push(obj));
    return ret;
  }

  forEach(callback: (value: T, key: TypedArtifactName) => void) {
    this.map.forEach(v => callback(v, this.nameExtractor(v)));
  }
}

export function createArtifactNameSet(): ArtifactMap<TypedArtifactName> {
  return new ArtifactMap<TypedArtifactName>(obj => obj);
}
