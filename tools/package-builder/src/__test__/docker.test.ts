import { describe, it, expect } from 'vitest';
import { dockerSchema } from '../core/schemas/artifacts';

describe('Docker Package Schema Validation', () => {
  it('should reject context with "./"', () => {
    const invalidPackage = {
      type: 'docker' as const,
      context: './',
      dockerfile: 'Dockerfile',
    };

    const result = dockerSchema.safeParse(invalidPackage);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Context cannot be "./" or "."');
    }
  });

  it('should reject context with "."', () => {
    const invalidPackage = {
      type: 'docker' as const,
      context: '.',
      dockerfile: 'Dockerfile',
    };

    const result = dockerSchema.safeParse(invalidPackage);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Context cannot be "./" or "."');
    }
  });

  it('should accept valid context paths', () => {
    const validPackages = [
      {
        type: 'docker' as const,
        context: 'docker-context',
        dockerfile: 'Dockerfile',
      },
      {
        type: 'docker' as const,
        context: '/absolute/path',
        dockerfile: 'Dockerfile',
      },
      {
        type: 'docker' as const,
        context: '../relative/path',
        dockerfile: 'Dockerfile',
      },
    ];

    for (const validPackage of validPackages) {
      const result = dockerSchema.safeParse(validPackage);
      expect(result.success).toBe(true);
    }
  });

  it('should accept docker package without optional fields', () => {
    const minimalPackage = {
      type: 'docker' as const,
      context: 'valid-context',
    };

    const result = dockerSchema.safeParse(minimalPackage);
    expect(result.success).toBe(true);
  });
});
