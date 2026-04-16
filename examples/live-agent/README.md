# Sone Live Agent

A browser-only example that pairs `json-render` prompt generation with a custom Sone catalog and a live canvas preview.

Patch streaming and catalog helpers come from [`@json-render/core`](https://www.npmjs.com/package/@json-render/core), published from the upstream project [vercel-labs/json-render](https://github.com/vercel-labs/json-render).

## What it does

- Streams JSONL patches directly in the SPA
- Compiles them into a prompt-friendly Sone spec
- Translates that spec into real `SoneNode` trees
- Renders and exports the result in the browser
- Supports a deterministic fixture path for offline development and tests

## Setup

No environment variables are required for the SPA.

By default, the setup dialog starts with g4f fetch mode:
- URL: `https://g4f.space/backend-api/v2/conversation`
- model: `default`

The same dialog also supports OpenAI-compatible endpoints. You can switch the connection type, paste a custom URL, optionally provide a model, and optionally provide an API key. This works for providers like Ollama, LM Studio, or Vercel AI Gateway. For Vercel AI Gateway, model names should use `provider/model-name` format (for example `openai/gpt-4o-mini`).

The app only saves settings to browser local storage after the connection test passes.

## Scripts

- `npm run dev` - start the SPA with Vite
- `npm run build` - build the frontend bundle
- `npm run capture` - render the capture page and save `capture.png`
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

## Runtime Modes

- Fixture mode: `Run fixture` for an offline demo and tests.
- Local backend mode: the SPA posts to `http://localhost:8080/api/agent/chat`.
- g4f mode: the SPA fetches `/backend-api/v2/public-key`, encrypts `x-secret`, streams `/backend-api/v2/conversation`, and checks `/backend-api/v2/models/AnyProvider` during connection testing.
- OpenAI-compatible mode: the SPA posts to the configured chat completions URL and asks the model to return valid Sone patches.
- MCP mode: `npm run mcp` does not require this chat backend because the connected IDE or agent provides the LLM.

## Notes

- The MCP server remains available under `server/mcp.ts`; only the preview app was simplified to run as a SPA.
- The fixture path is the first debugging surface when renderer, schema, or translator changes break the preview.
