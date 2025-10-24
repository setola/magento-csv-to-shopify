# Agent Guidelines for Shopify Importer

## Build/Lint/Test Commands
- **Build**: No build step required (ES6 modules)
- **Lint**: No linter configured
- **Test**: `npm test` (runs product migration)
- **Single test**: No individual test runner; use `npm test` for full suite
- **Migration commands**: `npm run migrate-products`, `npm run migrate-customers`, `npm run delete-products`
- **Docker tasks**: Use `go-task migration:products`, `go-task migration:customers`, `go-task delete:products`

## Code Style Guidelines
- **Modules**: Use ES6 imports/exports (`import X from 'path'`)
- **Classes**: PascalCase class names, camelCase methods/properties
- **Functions**: camelCase, async/await for async operations
- **Variables**: camelCase, descriptive names
- **Constants**: UPPER_SNAKE_CASE for config objects
- **Error handling**: Try/catch blocks, throw descriptive errors
- **Logging**: Use Logger utility with log levels (DEBUG, INFO, WARN, ERROR, SUCCESS)
- **Documentation**: JSDoc comments for classes and public methods
- **Configuration**: Environment variables via dotenv, config objects
- **Architecture**: Utility classes in `utils/` directory, main scripts in root
- **Naming**: Descriptive, avoid abbreviations except common ones (CSV, API, SKU)
- **Formatting**: 2-space indentation, consistent spacing around operators
- **Imports**: Group by type (built-ins, then local utilities), alphabetical within groups