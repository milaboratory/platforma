# Changelog

## [Unreleased] - JS Builder Package Refactoring

### Changed
- **Major refactoring**: Code unification and duplication elimination
- **New architecture**: Created `utils` folder with common utilities
- **Improved typing**: Added strict types for all options and parameters

### Added
- `src/commands/utils/command-runner.ts` - Unified shell command execution
- `src/commands/utils/config-manager.ts` - Centralized configuration management
- `src/commands/utils/common-options.ts` - Common types and option validation
- `src/commands/utils/path-utils.ts` - Path handling utilities
- `README.md` - Usage documentation

### Removed
- Duplication of `runCommand` function in build.ts and serve.ts
- Repetitive config handling code in all init-commands
- Duplication of path handling logic (`__dirname`, `fileURLToPath`)
- Repetitive error handling patterns
- Duplication of global options retrieval logic

### Improved
- All commands now use common utilities
- Unified approach to validation and error handling
- Better code readability and maintainability
- Strict TypeScript typing

### Technical Details
- All command files significantly simplified
- Logic extracted to reusable utilities
- Maintained backward API compatibility
- Improved error handling
