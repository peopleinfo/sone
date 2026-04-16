import { describe, expect, it } from "vitest";
import { specToSoneNode, specToSoneNodeLenient, validateSoneSpec } from "@/spec-to-sone";
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

  it("accepts CSS-like borderTop alias on container props", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: {
            borderTop: "1px solid #e5e7eb",
            padding: 12,
          },
          children: ["title"],
        },
        title: {
          type: "Text",
          props: { text: "Invoice", size: 16, weight: "bold" },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string; props?: Record<string, unknown> };
    expect(node.type).toBe("column");
    expect(node.props?.borderTopWidth).toBe(1);
    expect(node.props?.borderColor).toBe("#e5e7eb");
  });

  it("accepts container font and borderBottom compatibility aliases", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: {
            font: "Inter",
            borderBottom: "2px solid rgba(0,0,0,0.12)",
          },
          children: ["title"],
        },
        title: {
          type: "Text",
          props: { text: "Fees", weight: "bold" },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { props?: Record<string, unknown> };
    expect(node.props?.font).toEqual(["Inter"]);
    expect(node.props?.borderBottomWidth).toBe(2);
    expect(node.props?.borderColor).toBe("rgba(0,0,0,0.12)");
  });

  it("flattens nested table spacing arrays from model output", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: {},
          children: ["fee-table"],
        },
        "fee-table": {
          type: "Table",
          props: {
            spacing: [[8], [12, [16]]],
            rows: [
              { cells: [{ text: "Item", header: true }, { text: "Amount", header: true }] },
              { cells: [{ text: "Service Fee" }, { text: "$20.00" }] },
            ],
          },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string };
    expect(node.type).toBe("column");
  });

  it("reconciles child references across id naming styles", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: { gap: 16 },
          children: ["header", "info-grid", "table-section", "footer"],
        },
        header: {
          type: "Text",
          props: { text: "Invoice" },
          children: [],
        },
        infoGrid: {
          type: "Row",
          props: { justifyContent: "space-between" },
          children: [],
        },
        tableSection: {
          type: "Column",
          props: { gap: 8 },
          children: ["totals"],
        },
        totals: {
          type: "Column",
          props: {},
          children: ["subtotal", "tax", "grand-total"],
        },
        subtotal: {
          type: "Text",
          props: { text: "Subtotal" },
          children: [],
        },
        tax: {
          type: "Text",
          props: { text: "Tax" },
          children: [],
        },
        grandTotal: {
          type: "Text",
          props: { text: "Total" },
          children: [],
        },
        footer: {
          type: "Text",
          props: { text: "Thanks" },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string };
    expect(node.type).toBe("column");
  });

  it("normalizes container text props and fontWeight aliases in table styles", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: {},
          children: ["billing-label", "fee-table"],
        },
        "billing-label": {
          type: "Row",
          props: { text: "Billing Information" },
          children: [],
        },
        "fee-table": {
          type: "Table",
          props: {
            spacing: [[6], [8]],
            rows: [
              { cells: [{ text: "Item", header: true }, { text: "Amount", header: true }] },
              {
                cells: [
                  { text: "Total", style: { fontWeight: "bold" } },
                  { text: "$120.00", style: { fontWeight: 700 } },
                ],
              },
            ],
          },
          children: [],
        },
      },
    };

    expect(validateSoneSpec(spec)).toEqual([]);
    const node = specToSoneNode(spec) as { type: string };
    expect(node.type).toBe("column");
  });
});

describe("specToSoneNodeLenient", () => {
  it("renders a complete spec the same as the strict builder", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: { padding: 16 },
          children: ["title"],
        },
        title: {
          type: "Text",
          props: { text: "Hello" },
          children: [],
        },
      },
    };

    const node = specToSoneNodeLenient(spec) as { type: string };
    expect(node).not.toBeNull();
    expect(node.type).toBe("column");
  });

  it("skips missing children instead of throwing", () => {
    const spec: SoneSpec = {
      root: "root",
      elements: {
        root: {
          type: "Column",
          props: { padding: 16 },
          children: ["title", "missing-child"],
        },
        title: {
          type: "Text",
          props: { text: "Hello" },
          children: [],
        },
      },
    };

    expect(() => specToSoneNode(spec)).toThrow();
    const node = specToSoneNodeLenient(spec) as { type: string; children: unknown[] };
    expect(node).not.toBeNull();
    expect(node.type).toBe("column");
  });

  it("recovers and builds when root references a missing element but others exist", () => {
    const spec: SoneSpec = {
      root: "missing",
      elements: {
        title: {
          type: "Text",
          props: { text: "Hello" },
          children: [],
        },
      },
    };

    const node = specToSoneNodeLenient(spec) as { type: string } | null;
    expect(node).not.toBeNull();
    expect(node!.type).toBe("text");
  });

  it("returns null for empty spec", () => {
    const node = specToSoneNodeLenient({ root: "", elements: {} });
    expect(node).toBeNull();
  });
});
