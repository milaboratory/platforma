/**
 * Basic tests for expression system implementation
 */

import { describe, expect, test } from 'vitest';
import { col, ColumnExpressionImpl, lit, LiteralExpressionImpl } from '../../src';

describe('Factory Functions', () => {
  test('col() creates ColumnExpression', () => {
    const expr = col('age');
    expect(expr).toBeInstanceOf(ColumnExpressionImpl);
    expect(expr.getColumnName()).toBe('age');
    expect(expr.getAlias()).toBe('age');
  });

  test('lit() creates LiteralExpression', () => {
    const numExpr = lit(42);
    expect(numExpr).toBeInstanceOf(LiteralExpressionImpl);
    expect(numExpr.getValue()).toBe(42);
    expect(numExpr.getAlias()).toBe('42');

    const strExpr = lit('hello');
    expect(strExpr.getValue()).toBe('hello');
    expect(strExpr.getAlias()).toBe('hello');

    const boolExpr = lit(true);
    expect(boolExpr.getValue()).toBe(true);
    expect(boolExpr.getAlias()).toBe('true');

    const nullExpr = lit(null);
    expect(nullExpr.getValue()).toBe(null);
    expect(nullExpr.getAlias()).toBe('null');
  });
});

describe('JSON Serialization', () => {
  test('ColumnExpression serializes correctly', () => {
    const expr = col('username');
    expect(expr.toJSON()).toEqual({
      type: 'col',
      name: 'username'
    });
  });

  test('LiteralExpression serializes correctly', () => {
    expect(lit(123).toJSON()).toEqual({
      type: 'const',
      value: 123
    });

    expect(lit('test').toJSON()).toEqual({
      type: 'const',
      value: 'test'
    });

    expect(lit(true).toJSON()).toEqual({
      type: 'const',
      value: true
    });

    expect(lit(null).toJSON()).toEqual({
      type: 'const',
      value: null
    });
  });
});

describe('Basic Arithmetic Operations', () => {
  test('plus operation', () => {
    const expr = col('age').plus(lit(10));
    expect(expr.toJSON()).toEqual({
      type: 'plus',
      lhs: { type: 'col', name: 'age' },
      rhs: { type: 'const', value: 10 }
    });
  });

  test('minus operation', () => {
    const expr = col('score').minus(col('penalty'));
    expect(expr.toJSON()).toEqual({
      type: 'minus',
      lhs: { type: 'col', name: 'score' },
      rhs: { type: 'col', name: 'penalty' }
    });
  });

  test('multiply operation', () => {
    const expr = col('price').multiply(lit(1.2));
    expect(expr.toJSON()).toEqual({
      type: 'multiply',
      lhs: { type: 'col', name: 'price' },
      rhs: { type: 'const', value: 1.2 }
    });
  });

  test('truediv operation', () => {
    const expr = col('total').truediv(lit(2));
    expect(expr.toJSON()).toEqual({
      type: 'truediv',
      lhs: { type: 'col', name: 'total' },
      rhs: { type: 'const', value: 2 }
    });
  });
});

describe('Comparison Operations', () => {
  test('greater than', () => {
    const expr = col('age').gt(lit(18));
    expect(expr.toJSON()).toEqual({
      type: 'gt',
      lhs: { type: 'col', name: 'age' },
      rhs: { type: 'const', value: 18 }
    });
  });

  test('equals', () => {
    const expr = col('status').eq(lit('active'));
    expect(expr.toJSON()).toEqual({
      type: 'eq',
      lhs: { type: 'col', name: 'status' },
      rhs: { type: 'const', value: 'active' }
    });
  });

  test('less than or equal', () => {
    const expr = col('score').le(lit(100));
    expect(expr.toJSON()).toEqual({
      type: 'le',
      lhs: { type: 'col', name: 'score' },
      rhs: { type: 'const', value: 100 }
    });
  });
});

describe('Logical Operations', () => {
  test('and operation', () => {
    const expr = col('isActive').and(col('hasPermission'));
    expect(expr.toJSON()).toEqual({
      type: 'and',
      operands: [
        { type: 'col', name: 'isActive' },
        { type: 'col', name: 'hasPermission' }
      ]
    });
  });

  test('or operation', () => {
    const expr = col('isAdmin').or(col('isOwner'));
    expect(expr.toJSON()).toEqual({
      type: 'or',
      operands: [
        { type: 'col', name: 'isAdmin' },
        { type: 'col', name: 'isOwner' }
      ]
    });
  });

  test('not operation', () => {
    const expr = col('isDeleted').not();
    expect(expr.toJSON()).toEqual({
      type: 'not',
      value: { type: 'col', name: 'isDeleted' }
    });
  });
});

describe('Unary Operations', () => {
  test('abs operation', () => {
    const expr = col('difference').abs();
    expect(expr.toJSON()).toEqual({
      type: 'abs',
      value: { type: 'col', name: 'difference' }
    });
  });

  test('sqrt operation', () => {
    const expr = col('area').sqrt();
    expect(expr.toJSON()).toEqual({
      type: 'sqrt',
      value: { type: 'col', name: 'area' }
    });
  });

  test('log10 operation', () => {
    const expr = col('value').log10();
    expect(expr.toJSON()).toEqual({
      type: 'log10',
      value: { type: 'col', name: 'value' }
    });
  });
});

describe('Null Checks', () => {
  test('isNull operation', () => {
    const expr = col('optional_field').isNull();
    expect(expr.toJSON()).toEqual({
      type: 'is_na',
      value: { type: 'col', name: 'optional_field' }
    });
  });

  test('isNotNull operation', () => {
    const expr = col('required_field').isNotNull();
    expect(expr.toJSON()).toEqual({
      type: 'is_not_na',
      value: { type: 'col', name: 'required_field' }
    });
  });
});

describe('Aliasing', () => {
  test('expression with alias', () => {
    const expr = col('first_name').alias('fname');
    expect(expr.getAlias()).toBe('fname');
    expect(expr.toJSON()).toEqual({
      type: 'col',
      name: 'first_name'
    });
  });

  test('chained operations with alias', () => {
    const expr = col('age').plus(lit(1)).alias('next_age');
    expect(expr.getAlias()).toBe('next_age');
  });
});

describe('Complex Expression Chaining', () => {
  test('nested arithmetic operations', () => {
    const expr = col('a').plus(col('b')).multiply(lit(2));
    expect(expr.toJSON()).toEqual({
      type: 'multiply',
      lhs: {
        type: 'plus',
        lhs: { type: 'col', name: 'a' },
        rhs: { type: 'col', name: 'b' }
      },
      rhs: { type: 'const', value: 2 }
    });
  });

  test('combined logical and comparison', () => {
    const expr = col('age').gt(lit(18)).and(col('status').eq(lit('active')));
    expect(expr.toJSON()).toEqual({
      type: 'and',
      operands: [
        {
          type: 'gt',
          lhs: { type: 'col', name: 'age' },
          rhs: { type: 'const', value: 18 }
        },
        {
          type: 'eq',
          lhs: { type: 'col', name: 'status' },
          rhs: { type: 'const', value: 'active' }
        }
      ]
    });
  });
});

describe('Type Coercion', () => {
  test('numeric literals are automatically converted', () => {
    const expr = col('value').plus(42);
    expect(expr.toJSON()).toEqual({
      type: 'plus',
      lhs: { type: 'col', name: 'value' },
      rhs: { type: 'const', value: 42 }
    });
  });

  test('string literals are automatically converted', () => {
    const expr = col('name').eq('John');
    expect(expr.toJSON()).toEqual({
      type: 'eq',
      lhs: { type: 'col', name: 'name' },
      rhs: { type: 'const', value: 'John' }
    });
  });
});