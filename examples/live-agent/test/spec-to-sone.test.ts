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

  it("accepts style shorthand on table/list item text", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: { gap: 12 },
          children: ["table", "list"],
        },
        table: {
          type: "Table",
          props: {
            rows: [
              {
                cells: [
                  { text: "Subtotal", style: { weight: "bold", color: "#111111" } },
                  { text: "$128.00", style: { align: "right" } },
                ],
              },
            ],
          },
          children: [],
        },
        list: {
          type: "List",
          props: {
            items: [{ text: "Fast", style: { color: "#0b5fff" } }],
          },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string };
    expect(node.type).toBe("column");
  });

  it("supports TextDefault and PageBreak catalog components", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: {},
          children: ["defaults", "break", "tail"],
        },
        defaults: {
          type: "TextDefault",
          props: { size: 14, color: "#222222", lineHeight: 1.4 },
          children: ["headline"],
        },
        headline: {
          type: "Text",
          props: { text: "Quarterly Summary" },
          children: [],
        },
        break: {
          type: "PageBreak",
          props: { mode: "before" },
          children: [],
        },
        tail: {
          type: "Text",
          props: { text: "Page 2 content" },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string };
    expect(node.type).toBe("column");
  });

  it("accepts compatibility aliases for padding and shadow props", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: {
            paddingVertical: 12,
            paddingHorizontal: 20,
            boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
          },
          children: ["buttonColumn"],
        },
        buttonColumn: {
          type: "Column",
          props: {
            paddingVertical: 10,
            paddingHorizontal: 16,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            background: "#0b5fff",
            cornerRadius: 12,
          },
          children: ["label"],
        },
        label: {
          type: "Text",
          props: { text: "Continue", color: "#ffffff", align: "center" },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string };
    expect(node.type).toBe("column");
  });
});
