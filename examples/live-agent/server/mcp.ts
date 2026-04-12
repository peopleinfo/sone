import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { soneCatalog } from "../src/catalog";

const server = new McpServer({
  name: "sone-live-agent",
  version: "0.0.1",
});

const catalogPrompt = soneCatalog.prompt();

server.tool(
  "render_sone",
  `Render a Sone UI layout. The spec argument must be a valid Sone spec conforming to the catalog below.\n\n${catalogPrompt}`,
  { spec: soneCatalog.zodSchema() },
  async ({ spec }) => {
    const validation = soneCatalog.validate(spec);
    const validSpec = validation.success ? validation.data : spec;

    const errors =
      !validation.success && validation.error?.issues
        ? validation.error.issues.map(
            (i: { path: (string | number)[]; message: string }) =>
              `${i.path.join("/")}: ${i.message}`,
          )
        : [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            errors.length > 0
              ? { spec: validSpec, warnings: errors }
              : { spec: validSpec },
            null,
            2,
          ),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
