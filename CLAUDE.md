# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

npm workspaces monorepo of MCP (Model Context Protocol) servers, published under the `@godsenal7` scope (e.g. `@godsenal7/bigquery-mcp`). Each package in `packages/` is an independent MCP server built with `@modelcontextprotocol/sdk@1.0.1` and TypeScript.

## Commands

```bash
# Build all packages
npm run build

# Dev-run a single package (uses tsx)
cd packages/<name> && npm run dev

# Create a new MCP package from template (interactive)
npm run create-mcp

# Publish all packages
npm run publish-all

# Version management
npx @changesets/cli
```

Per-package build: `tsc && shx chmod +x dist/*.js` (makes the bin entry executable).

## Architecture

### Package Structure

Every MCP server follows the same pattern (defined in `template/`):

- **Single `index.ts` entry point** with `#!/usr/bin/env node` shebang
- **Dual transport**: stdio (default) or SSE via `--sse` flag. SSE uses Express on port 3000.
- **Client wrapper class** (e.g. `BigQueryClient`, `SlackClient`, `NotionClientWrapper`) that encapsulates API calls
- **Tool definitions** as `Tool` objects with JSON Schema `inputSchema`, registered via `ListToolsRequestSchema` handler
- **Tool dispatch** via `switch` on `request.params.name` in the `CallToolRequestSchema` handler
- **Environment variables** for credentials (never hardcoded)

### Packages

| Package | Env Vars | Key Dependencies |
|---------|----------|-----------------|
| `bigquery` | `BIGQUERY_CREDENTIALS` (JSON) | `@google-cloud/bigquery` |
| `fetch` | `MCP_USER_AGENT` (optional) | Node native fetch |
| `notion` | `NOTION_API_TOKEN`, `NOTION_MARKDOWN_CONVERSION` | Raw `fetch` against Notion REST API |
| `slack` | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | Raw `fetch` against Slack Web API |

### Notion Package Specifics

The `notion` package is the most complex. Key details:
- `types/index.ts` — TypeScript types for all Notion API response objects
- `markdown/index.ts` — Converts Notion API responses to Markdown (controlled by `NOTION_MARKDOWN_CONVERSION=true` env var)
- Supports both `json` and `markdown` response formats via a `format` parameter on each tool
- Uses raw `fetch` calls to `https://api.notion.com/v1` with Notion-Version `2022-06-28` (not the `@notionhq/client` SDK directly for API calls, though it's a dependency)

### Docker

Each package has a `Dockerfile` using multi-stage build (Node 22 Alpine). The build stage copies the package and root `tsconfig.json`, the release stage runs `dist/index.js` on port 3000.

### TypeScript Config

Root `tsconfig.json` targets ES2022 with Node16 module resolution. Each package extends it and sets `outDir: ./dist` and `rootDir: .`.

## Conventions

- Package naming: `@godsenal7/<name>-mcp`
- Binary naming: `mcp-server-<name>`
- ESM modules (`"type": "module"` in all package.json files)
- All server logs go to `stderr` (`console.error`), tool responses to `stdout`
- Changesets for versioning (access: restricted, base branch: main)
