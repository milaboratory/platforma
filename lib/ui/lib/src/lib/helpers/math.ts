export function clamp(n: number, lo: number, up: number) {
  return lo > n ? lo : n > up ? up : n;
}
