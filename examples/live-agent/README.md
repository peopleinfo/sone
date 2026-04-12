# Sone Live Agent

A local example that pairs `json-render` prompt generation with a custom Sone catalog and a live canvas preview.

## What it does

- Streams JSONL patches from a local API
- Compiles them into a prompt-friendly Sone spec
- Translates that spec into real `SoneNode` trees
- Renders and exports the result in the browser
- Supports a deterministic fixture path for offline development and tests

## Environment

Copy `.env.example` to `.env` and provide values when you want live model generation.

## Scripts

- `npm run dev` - start the local API and Vite frontend together
- `npm run build` - build the frontend bundle
- `npm run check` - run TypeScript checks
- `npm run test` - run the example test suite
- `npm run mcp` - start the MCP server (stdio transport)

## MCP

The MCP server exposes the Sone catalog as a `render_sone` tool over stdio. IDEs and agents with built-in LLMs (Claude Desktop, VS Code Copilot, Cursor, etc.) can generate Sone specs directly — no API key or OpenAI-compatible endpoint needed.

### IDE configuration

Add to your MCP client config (e.g. `.cursor/mcp.json`, Claude Desktop settings):

```json
{
  "mcpServers": {
    "sone": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/sone/examples/live-agent"
    }
  }
}
```

Or run directly:

```sh
npx tsx server/mcp.ts
```

### Tool: `render_sone`

The tool description includes the full Sone component catalog (Column, Row, Grid, Text, Photo, Table, List, Path, ClipGroup). The LLM reads the catalog, generates a valid Sone spec, and the tool validates it before returning.

**Input:** `{ spec: { root: string, elements: Record<string, { type, props, children }> } }`

**Output:** The validated spec as JSON (with warnings if validation found issues).

## API

### POST `/api/agent/chat`

OpenAPI-compatible chat endpoint. Accepts a message, runs the generation pipeline, and returns the completed Sone spec as JSON.

**Request:**

```json
{
  "message": "create a pricing table",
  "conversation_id": "optional-uuid"
}
```

**Response (`ChatResponse`):**

```json
{
  "conversation_id": "uuid",
  "response": "Generated a Sone layout with 5 element(s) from your prompt.",
  "spec": { "root": "root", "elements": { ... } }
}
```

**Test with curl:**

```sh
curl -X 'POST' \
  'http://localhost:5174/api/agent/chat' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{"message": ""}'
```

An empty `message` returns the deterministic fixture spec (no credentials needed). A non-empty message requires `AI_GATEWAY_API_KEY`.

### POST `/api/generate`

Streaming JSONL endpoint for incremental patch generation. See `server/generate.mjs`.

### GET `/api/health`

Returns `{ "ok": true }`.

## Notes

- This example currently follows `examples/live-editor` and depends on `sone` from npm.
- The fixture path is the first debugging surface when renderer, schema, or translator changes break the preview.
