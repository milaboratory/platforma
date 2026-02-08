export class PerfTimer {
  private constructor(private readonly t0: number) {}

  static start(): PerfTimer {
    return new PerfTimer(performance.now());
  }

  elapsed(): string {
    const t1 = performance.now();
    const ms = Math.round(t1 - this.t0);

    const units = [
      { value: Math.floor(ms / (24 * 60 * 60 * 1000)), suffix: "d" },
      { value: Math.floor(ms / (60 * 60 * 1000)) % 24, suffix: "h" },
      { value: Math.floor(ms / (60 * 1000)) % 60, suffix: "m" },
      { value: Math.floor(ms / 1000) % 60, suffix: "s" },
      { value: ms % 1000, suffix: "ms" },
    ];

    const firstNonZero = units.findIndex((unit) => unit.value > 0);
    if (firstNonZero === -1) return "0ms";

    const parts = [`${units[firstNonZero].value}${units[firstNonZero].suffix}`];
    if (firstNonZero + 1 < units.length && units[firstNonZero + 1].value > 0) {
      parts.push(`${units[firstNonZero + 1].value}${units[firstNonZero + 1].suffix}`);
    }
    return parts.join(" ");
  }
}
