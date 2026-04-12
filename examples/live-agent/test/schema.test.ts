import { describe, expect, it } from "vitest";
import { validateSoneSpec } from "@/spec-to-sone";
import type { SoneSpec } from "@/types";

function baseSpec(): SoneSpec {
  return {
    root: "root",
    elements: {
      root: {
        type: "Column",
        props: { width: 640, padding: 24, gap: 16, background: "#ffffff" },
        children: ["title"],
      },
      title: {
        type: "Text",
        props: {
          segments: [{ text: "Hello world", style: { weight: "bold" } }],
          size: 24,
        },
        children: [],
      },
    },
  };
}

describe("validateSoneSpec", () => {
  it("accepts a minimal valid spec", () => {
    expect(validateSoneSpec(baseSpec())).toEqual([]);
  });

  it("rejects unsupported props through component schemas", () => {
    const spec = baseSpec();
    spec.elements.root.props = {
      ...spec.elements.root.props,
      unknownProp: "nope",
    } as never;

    const issues = validateSoneSpec(spec);
    expect(
      issues.some(
        (issue) =>
          issue.path.startsWith("/elements/root/props") &&
          issue.message.toLowerCase().includes("unrecognized"),
      ),
    ).toBe(true);
  });

  it("rejects invalid child references", () => {
    const spec = baseSpec();
    spec.elements.root.children.push("missing-child");

    const issues = validateSoneSpec(spec);
    expect(issues.some((issue) => issue.message.includes('Child "missing-child" does not exist.'))).toBe(true);
  });
});
