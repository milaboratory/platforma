import { parseGlibcVersion } from './pl';
import { describe, it, expect } from 'vitest';

describe('parseGlibcVersion', () => {
  it('correctly parses glibc version from ldd output', () => {
    // Standard GNU libc outputs
    expect(parseGlibcVersion('ldd (GNU libc) 2.28')).toBe(2.28);
    expect(parseGlibcVersion('ldd (GNU libc) 2.39')).toBe(2.39);

    // Ubuntu-style output
    expect(parseGlibcVersion('ldd (Ubuntu GLIBC 2.31-0ubuntu9.9) 2.31')).toBe(2.31);

    // Debian-style output
    expect(parseGlibcVersion('ldd (Debian GLIBC 2.28-10) 2.28')).toBe(2.28);

    // Different formatting with extra text
    expect(parseGlibcVersion('ldd version 2.35, Copyright (C) 2022 Free Software Foundation, Inc.')).toBe(2.35);
  });

  it('throws error when glibc version cannot be parsed', () => {
    // Invalid outputs
    expect(() => parseGlibcVersion('ldd: command not found')).toThrow();
    expect(() => parseGlibcVersion('some random output')).toThrow();
    expect(() => parseGlibcVersion('')).toThrow();
  });
});
