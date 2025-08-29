# JavaScript Implementation of PTabler Expression System

## Overview

Create a JavaScript/TypeScript implementation of the PTabler expression system that mirrors the existing Tengo expression API to generate identical JSON expression structures. This will provide the foundation for building data processing workflows compatible with the PTabler Python backend.

## Architecture Goals

- **Expression Parity**: 1:1 compatibility with existing Tengo expression API
- **JSON Identity**: Generate identical JSON expression structures
- **Type Safety**: Full TypeScript support with schema validation
- **Test Coverage**: Comprehensive testing to guarantee behavioral equivalence with Tengo

## Implementation Plan

### Phase 1: Expression System

#### 1.1 Base Expression Classes

**Target Files:**
- `lib/ptabler/js/src/expressions/base.ts` - Base expression class and interfaces
- `lib/ptabler/js/src/expressions/column.ts` - Column references  
- `lib/ptabler/js/src/expressions/literal.ts` - Constant values
- `lib/ptabler/js/src/types.ts` - Core type definitions

**Base Implementation:**
```typescript
abstract class Expression {
  abstract toJSON(): any;
  abstract getAlias(): string;
  alias(name: string): Expression;
  
  // Arithmetic methods
  plus(other: Expression): ArithmeticExpression;
  minus(other: Expression): ArithmeticExpression;
  multiply(other: Expression): ArithmeticExpression;
  truediv(other: Expression): ArithmeticExpression;
  // ... etc
}
```

#### 1.2 Expression Types Implementation

**Target Files:**
- `lib/ptabler/js/src/expressions/arithmetic.ts` - Math operations
- `lib/ptabler/js/src/expressions/comparison.ts` - Comparison operations  
- `lib/ptabler/js/src/expressions/string.ts` - String operations
- `lib/ptabler/js/src/expressions/logical.ts` - Boolean logic
- `lib/ptabler/js/src/expressions/window.ts` - Window functions
- `lib/ptabler/js/src/expressions/fuzzy.ts` - Fuzzy string matching

**Core Expression Methods:**
- **Arithmetic**: `plus()`, `minus()`, `multiply()`, `truediv()`, `floordiv()`, `abs()`, `sqrt()`, `log()`, `floor()`, `ceil()`, `round()`, `negate()`
- **Comparison**: `gt()`, `ge()`, `eq()`, `lt()`, `le()`, `neq()`
- **String**: `strConcat()`, `substring()`, `strReplace()`, `strContains()`, `strToUpper()`, `strToLower()`, `strStartsWith()`, `strEndsWith()`, `strExtract()`
- **Logical**: `and()`, `or()`, `not()`
- **Null checks**: `isNull()`, `isNotNull()`, `fillNull()`, `fillNaN()`
- **Aggregation**: `sum()`, `mean()`, `count()`, `min()`, `max()`, `first()`, `last()` 
- **Window**: `over()`, `rank()`, `cumsum()`
- **Fuzzy**: `stringDistance()`, `fuzzyStringFilter()`

#### 1.3 Factory Functions

**Target Files:**
- `lib/ptabler/js/src/functions.ts` - Global factory functions

**Functions to Implement:**
```typescript
// Core factories
export function col(name: string): ColumnExpression;
export function lit(value: any): LiteralExpression;

// Logical operations  
export function allHorizontal(...expressions: Expression[]): AndExpression;
export function anyHorizontal(...expressions: Expression[]): OrExpression;
export function and(...expressions: Expression[]): AndExpression;
export function or(...expressions: Expression[]): OrExpression;

// Conditional expressions
export function when(condition: Expression): WhenThenBuilder;
export function rank(expression: Expression, options?: RankOptions): RankExpression;
```

### Phase 2: JSON Serialization

#### 2.1 Expression Serialization

**Target Files:**
- `lib/ptabler/js/src/serialization/expressions.ts` - Expression JSON serializers

**Serialization Requirements:**
- Each expression type must implement `toJSON()` to match exact TypeScript schema
- Ensure perfect compatibility with existing PTabler expression JSON structures
- Support for nested expression serialization
- Proper handling of aliases and expression metadata

**Example Serialization:**
```typescript
// col("age").plus(lit(10)).alias("age_plus_10")
// Should serialize to:
{
  type: "plus",
  lhs: { type: "col", name: "age" },
  rhs: { type: "const", value: 10 }
}
```

#### 2.2 Schema Validation

**Target Files:**
- `lib/ptabler/js/src/validation.ts` - Runtime schema validation

**Validation Tasks:**
- Import existing TypeScript schema from `@platforma-open/milaboratories.software-ptabler.schema`
- Runtime validation of generated JSON structures
- Error messages that map back to expression API usage
- Development-mode strict validation, production-mode optimized validation

### Phase 3: Testing Infrastructure

#### 3.1 Expression Unit Tests

**Target Files:**
- `lib/ptabler/js/tests/unit/expressions.test.ts` - Individual expression tests
- `lib/ptabler/js/tests/unit/factories.test.ts` - Factory function tests
- `lib/ptabler/js/tests/unit/serialization.test.ts` - JSON serialization tests

**Test Categories:**
- Expression creation and chaining
- JSON serialization accuracy
- Alias handling
- Type validation
- Error cases and edge conditions

#### 3.2 Tengo Parity Tests

**Target Files:**
- `lib/ptabler/js/tests/integration/tengo-parity.test.ts` - Cross-platform comparison
- `lib/ptabler/js/tests/fixtures/tengo-expressions.json` - Expected JSON outputs from Tengo
- `lib/ptabler/js/tests/fixtures/test-cases.ts` - Shared test cases

**Parity Testing Strategy:**
1. **Expression Coverage**: Test every expression type and method
2. **JSON Identity**: Compare JavaScript output with Tengo-generated JSON byte-for-byte
3. **Complex Expressions**: Test deeply nested and chained expressions
4. **Edge Cases**: Null handling, type coercion, error conditions

**Test Case Examples:**
```typescript
// Basic arithmetic
col("age").plus(lit(10))

// Complex chaining
col("name").strToUpper().strConcat(lit(" - ")).strConcat(col("id").toString())

// Logical operations
col("isActive").and(col("score").gt(lit(80)))

// Window functions
col("value").sum().over("category")

// Fuzzy matching
col("text").stringDistance(lit("target"), { metric: "levenshtein" })
```

#### 3.3 Property-Based Testing

**Target Files:**
- `lib/ptabler/js/tests/property/expression-invariants.test.ts` - Property testing

**Property Tests:**
- All generated expressions serialize to valid JSON
- Expression chaining maintains type safety
- Alias propagation works correctly
- Serialized expressions can be deserialized

### Phase 4: Documentation

#### 4.1 API Documentation

**Target Files:**
- `lib/ptabler/js/README.md` - Main documentation
- `lib/ptabler/js/docs/expressions-api.md` - Complete expression API reference  
- `lib/ptabler/js/docs/migration-from-tengo.md` - Migration guide

#### 4.2 Code Examples

**Target Files:**
- `lib/ptabler/js/examples/basic-expressions.ts` - Basic usage examples
- `lib/ptabler/js/examples/advanced-expressions.ts` - Complex expression patterns
- `lib/ptabler/js/examples/tengo-js-comparison.ts` - Side-by-side comparison

## Package Structure

```
lib/ptabler/js/
├── package.json
├── tsconfig.json  
├── vitest.config.ts
├── src/
│   ├── index.ts                 # Main exports
│   ├── functions.ts             # Factory functions (col, lit, etc)
│   ├── types.ts                 # Core type definitions
│   ├── expressions/
│   │   ├── base.ts              # Base expression class
│   │   ├── column.ts            # Column references
│   │   ├── literal.ts           # Literal values
│   │   ├── arithmetic.ts        # Math operations
│   │   ├── comparison.ts        # Comparisons
│   │   ├── logical.ts           # Boolean logic
│   │   ├── string.ts            # String operations
│   │   ├── window.ts            # Window functions
│   │   ├── conditional.ts       # When/then/otherwise
│   │   └── fuzzy.ts             # Fuzzy matching
│   └── validation.ts            # Schema validation
├── tests/
│   ├── unit/
│   │   ├── expressions.test.ts
│   │   ├── factories.test.ts
│   │   └── serialization.test.ts
│   ├── integration/
│   │   └── tengo-parity.test.ts
│   ├── property/
│   │   └── expression-invariants.test.ts
│   └── fixtures/
│       ├── tengo-expressions.json
│       └── test-cases.ts
├── examples/
│   ├── basic-expressions.ts
│   ├── advanced-expressions.ts
│   └── tengo-js-comparison.ts
└── docs/
    ├── expressions-api.md
    └── migration-from-tengo.md
```

## Success Criteria

1. **Expression Completeness**: 100% coverage of Tengo expression API surface area
2. **JSON Identity**: Generated JSON expressions are byte-identical to Tengo equivalents  
3. **Test Coverage**: >95% code coverage with comprehensive parity testing
4. **Cross-Platform Validation**: All Tengo expression test cases pass with identical JSON output
5. **Type Safety**: Full TypeScript support with proper type inference
6. **Documentation**: Complete expression API documentation with migration examples

## Dependencies

- `@platforma-open/milaboratories.software-ptabler.schema` - Existing TypeScript schema
- Testing frameworks (Vitest) for cross-platform validation
- TypeScript build toolchain

## Timeline Estimate

- **Phase 1**: 2-3 weeks (Core expression system implementation)
- **Phase 2**: 1-2 weeks (JSON serialization and validation)  
- **Phase 3**: 2-3 weeks (Comprehensive testing and parity validation)
- **Phase 4**: 1 week (Documentation and examples)

**Total**: 6-9 weeks for complete expression system with full parity testing.

## Risks and Mitigation

1. **Expression API Divergence**: Regular comparison with Tengo implementation
2. **JSON Schema Changes**: Automated schema validation in CI/CD  
3. **Complex Nested Expressions**: Incremental testing of expression combinations
4. **Type System Complexity**: Start with core types, expand gradually

This focused implementation will provide JavaScript/TypeScript developers with the complete PTabler expression system, ensuring perfect compatibility for building data processing workflows.