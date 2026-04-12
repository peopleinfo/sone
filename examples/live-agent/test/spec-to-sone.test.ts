import { describe, expect, it } from "vitest";
import { specToSoneNode, validateSoneSpec } from "@/spec-to-sone";
import type { SoneSpec } from "@/types";

describe("specToSoneNode", () => {
  it("expands prompt-friendly table and list props into real Sone wrappers", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: { gap: 12, padding: 20 },
          children: ["table", "list"],
        },
        table: {
          type: "Table",
          props: {
            rows: [
              { cells: [{ text: "Name", header: true }, { text: "Score", header: true }] },
              { cells: [{ text: "Ari" }, { text: "98" }] },
            ],
          },
          children: [],
        },
        list: {
          type: "List",
          props: {
            listStyle: "disc",
            items: [{ text: "One" }, { text: "Two" }],
          },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);

    const node = specToSoneNode(spec) as { type: string; children: Array<{ type: string; children?: Array<{ type: string }> }> };
    expect(node.type).toBe("column");
    expect(node.children[0]?.type).toBe("table");
    expect(node.children[0]?.children?.[0]?.type).toBe("table-row");
    expect(node.children[1]?.type).toBe("list");
    expect(node.children[1]?.children?.[0]?.type).toBe("list-item");
  });

  it("rejects table rows without cells", () => {
    const spec: SoneSpec = {
      root: "table",
      elements: {
        table: {
          type: "Table",
          props: { rows: [{ cells: [] }] },
          children: [],
        },
      },
    };

    const issues = validateSoneSpec(spec);
    expect(issues.some((issue) => issue.path.includes("/rows/0/cells"))).toBe(true);
  });
});
