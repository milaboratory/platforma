/**
 * Literal/constant value expressions
 */

import type { Expression as SchemaExpression } from '../types';
import type { LiteralValue } from './base';
import { Expression } from './base';

/**
 * Expression that represents a constant literal value
 */
export class LiteralExpression extends Expression {
  constructor(private value: LiteralValue) {
    super();
  }

  toJSON(): SchemaExpression {
    return {
      type: 'const',
      value: this.value,
    };
  }

  getAlias(): string {
    return this._alias || this.generateDefaultAlias();
  }

  protected clone(): Expression {
    const cloned = new LiteralExpression(this.value);
    cloned._alias = this._alias;
    return cloned;
  }

  /**
   * Get the literal value
   */
  getValue(): string | number | boolean | null {
    return this.value;
  }

  /**
   * Generate a default alias based on the value
   */
  private generateDefaultAlias(): string {
    if (this.value === null || this.value === undefined) {
      return 'null';
    }
    if (typeof this.value === 'string') {
      // For string values, truncate if too long and make safe for column names
      const safe = this.value.replace(/[^a-zA-Z0-9_]/g, '_');
      return safe.length > 20 ? safe.substring(0, 17) + '...' : safe;
    }
    if (typeof this.value === 'boolean') {
      return this.value ? 'true' : 'false';
    }
    if (typeof this.value === 'number') {
      return String(this.value);
    }
    if (Array.isArray(this.value)) {
      return 'array';
    }
    if (typeof this.value === 'object') {
      return 'object';
    }
    return 'literal';
  }
}
