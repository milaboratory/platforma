/**
 * Enhanced command line argument parser for OCLIF commands
 * Handles both known and unknown flags
 */

export interface ParsedArgs {
  instanceName: string;
  knownFlags: Record<string, any>;
  unknownFlags: string[];
  positionalArgs: string[];
}

export interface FlagDefinition {
  name: string;
  type: "string" | "boolean" | "number" | "array";
  required?: boolean;
  default?: any;
  multiple?: boolean;
}

export class ArgParser {
  private knownFlags: Set<string>;
  private flagDefinitions: Map<string, FlagDefinition>;

  constructor(flags: Record<string, any>) {
    this.knownFlags = new Set(Object.keys(flags));
    this.flagDefinitions = new Map();

    // Analyze flag definitions
    for (const [name, flag] of Object.entries(flags)) {
      if (flag.type) {
        this.flagDefinitions.set(name, {
          name,
          type: flag.type,
          required: flag.required || false,
          default: flag.default,
          multiple: flag.multiple || false,
        });
      }
    }
  }

  /**
   * Parse command line arguments
   */
  parse(argv: string[]): ParsedArgs {
    const result: ParsedArgs = {
      instanceName: "",
      knownFlags: {},
      unknownFlags: [],
      positionalArgs: [],
    };

    let i = 0;
    while (i < argv.length) {
      const arg = argv[i];

      if (arg.startsWith("--")) {
        // Handle flag
        if (arg.includes("=")) {
          // Flag with value: --flag=value
          const [flagName, value] = arg.split("=", 2);
          const cleanFlagName = flagName.substring(2);

          if (this.knownFlags.has(cleanFlagName)) {
            result.knownFlags[cleanFlagName] = this.parseFlagValue(cleanFlagName, value);
          } else {
            result.unknownFlags.push(arg);
          }
        } else {
          // Flag without value: --flag or --flag value
          const flagName = arg.substring(2);

          if (this.knownFlags.has(flagName)) {
            const flagDef = this.flagDefinitions.get(flagName);

            if (flagDef?.type === "boolean") {
              // Boolean flag
              result.knownFlags[flagName] = true;
            } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
              // Flag with value in next argument
              const value = argv[i + 1];
              result.knownFlags[flagName] = this.parseFlagValue(flagName, value);
              i++; // Skip next argument
            } else {
              // Flag without value
              result.knownFlags[flagName] = true;
            }
          } else {
            result.unknownFlags.push(arg);
          }
        }
      } else if (arg.startsWith("-") && arg.length > 1) {
        // Short flags: -f, -abc
        const shortFlags = arg.substring(1).split("");
        for (const shortFlag of shortFlags) {
          // Find long name for short flag
          const longFlagName = this.findLongFlagName(shortFlag);
          if (longFlagName) {
            result.knownFlags[longFlagName] = true;
          } else {
            result.unknownFlags.push(`-${shortFlag}`);
          }
        }
      } else {
        // Positional argument
        if (!result.instanceName) {
          result.instanceName = arg;
        } else {
          result.positionalArgs.push(arg);
        }
      }

      i++;
    }

    // Set default values
    this.setDefaultValues(result.knownFlags);

    return result;
  }

  /**
   * Parse flag value according to its type
   */
  private parseFlagValue(flagName: string, value: string): any {
    const flagDef = this.flagDefinitions.get(flagName);

    if (!flagDef) {
      return value;
    }

    switch (flagDef.type) {
      case "number":
        const num = parseFloat(value);
        if (isNaN(num)) {
          throw new Error(`Invalid number value for flag --${flagName}: ${value}`);
        }
        return num;

      case "boolean":
        if (value === "true" || value === "1") return true;
        if (value === "false" || value === "0") return false;
        return Boolean(value);

      case "array":
        if (flagDef.multiple) {
          // For multiple flags create array
          // This will be handled in main parse method
          return [value];
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * Find long flag name by short flag
   */
  private findLongFlagName(shortFlag: string): string | null {
    // Simple implementation - can be extended
    for (const flagName of this.knownFlags) {
      if (flagName.startsWith(shortFlag)) {
        return flagName;
      }
    }
    return null;
  }

  /**
   * Set default values for flags
   */
  private setDefaultValues(flags: Record<string, any>): void {
    for (const [name, flagDef] of this.flagDefinitions) {
      if (flagDef.default !== undefined && flags[name] === undefined) {
        flags[name] = flagDef.default;
      }
    }
  }

  /**
   * Validate required flags
   */
  validateRequired(flags: Record<string, any>): string[] {
    const errors: string[] = [];

    for (const [name, flagDef] of this.flagDefinitions) {
      if (flagDef.required && flags[name] === undefined) {
        errors.push(`Required flag --${name} is missing`);
      }
    }

    return errors;
  }
}
