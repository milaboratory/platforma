type Deferred<T> = {
  resolve: (v: T) => void;
  reject: (err?: unknown) => void;
};

export class Emitter<T> {
  #defers: Deferred<T>[] = [];
  #stop = false;

  stop() {
    this.#stop = true;
    this.#defers.forEach((d) => d.reject('i stopped'));
    this.#defers = [];
  }

  emit(v: T) {
    this.#defers.forEach((d) => d.resolve(v));
    this.#defers = [];
    return this;
  }

  nextValue() {
    return new Promise<T>((resolve, reject) =>
      this.#defers.push({
        resolve,
        reject
      })
    );
  }

  it() {
    return this[Symbol.asyncIterator]();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Awaited<T>> {
    while (!this.#stop) {
      try {
        const value = await this.nextValue();
        yield value;
      } catch (err) {
        console.log('stop with err', err);
      }
    }
  }
}
