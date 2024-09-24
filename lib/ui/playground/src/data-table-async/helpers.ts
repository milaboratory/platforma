const tearRender = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function* renderSequence(n: number) {
  await tearRender();
  for (let i = 0; i < n; i++) {
    yield i;
    if (i % 1000 === 0) {
      await tearRender();
    }
  }
}
