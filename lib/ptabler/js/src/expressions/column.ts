/**
 * Column reference expressions
 */

import type { Expression as SchemaExpression } from '../types';
import { Expression } from './base';

/**
 * Expression that references a column by name
 */
export class ColumnExpression extends Expression {
  constructor(private columnName: string) {
    super();
  }

  toJSON(): SchemaExpression {
    return {
      type: 'col',
      name: this.columnName,
    };
  }

  getAlias(): string {
    return this._alias || this.columnName;
  }

  protected clone(): Expression {
    const cloned = new ColumnExpression(this.columnName);
    cloned._alias = this._alias;
    return cloned;
  }

  /**
   * Get the column name
   */
  getColumnName(): string {
    return this.columnName;
  }
}
