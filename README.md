# godsenal7 MCP Packages

This repository contains a collection of Model Context Protocol (MCP) packages managed by godsenal7 organization.

## Packages

All packages are published under the `@godsenal7` scope with the naming convention `@godsenal7/{name}-mcp`.

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Creating a New Package

To create a new MCP package, run:

```bash
pnpm create-mcp
```

This will start an interactive script that will:

1. Ask for the package name
2. Generate a new package based on the template
3. Set up the necessary configuration

### Template Structure

The template package (`packages/template`) contains:

- Basic MCP server setup
- TypeScript configuration
- Testing setup
- Documentation template
- CI/CD configuration

## License

MIT
