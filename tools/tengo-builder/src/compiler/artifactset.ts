import type { CompileMode, TypedArtifactName } from './package';
import { artifactKey } from './package';
import { assertNever } from './util';

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
    this.map.forEach((obj) => ret.push(obj));
    return ret;
  }

  forEach(callback: (value: T, key: TypedArtifactName) => void) {
    this.map.forEach((v) => callback(v, this.nameExtractor(v)));
  }
}

export function createArtifactNameSet(): ArtifactMap<TypedArtifactName> {
  return new ArtifactMap<TypedArtifactName>((obj) => obj);
}

export class ArtifactStore<T> {
  private readonly dev: ArtifactMap<T>;
  private readonly dist: ArtifactMap<T>;

  constructor(private readonly nameExtractor: (obj: T) => TypedArtifactName) {
    this.dev = new ArtifactMap<T>(nameExtractor);
    this.dist = new ArtifactMap<T>(nameExtractor);
  }

  add(mode: CompileMode, obj: T, replace: boolean = true): T | undefined {
    switch (mode) {
      case 'dist':
        return this.dist.add(obj, replace);

      default:
        assertNever(mode);
    }
  }

  get(mode: CompileMode, name: TypedArtifactName): T | undefined {
    switch (mode) {
      case 'dist':
        return this.dist.get(name);

      default:
        assertNever(mode);
    }
  }

  array(mode: CompileMode): T[] {
    const ret: T[] = [];
    this.forEach(mode, (obj) => ret.push(obj));
    return ret;
  }

  forEach(mode: CompileMode, callback: (value: T, key: TypedArtifactName) => void) {
    this.dist.forEach((obj, k) => callback(this.get(mode, k) ?? obj, k));
  }
}
