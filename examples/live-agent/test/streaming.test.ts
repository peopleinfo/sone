import { createSpecStreamCompiler } from "@json-render/core";
import { describe, expect, it } from "vitest";
import { fixtureJsonlText } from "../server/fixture-stream.mjs";
import type { SoneSpec } from "@/types";

describe("fixture stream compilation", () => {
  it("compiles deterministic JSONL into a partial/final spec", () => {
    const compiler = createSpecStreamCompiler<SoneSpec>();
    const source = fixtureJsonlText();
    const midpoint = Math.floor(source.length / 2);

    const first = compiler.push(source.slice(0, midpoint));
    expect(first.newPatches.length).toBeGreaterThan(0);
    expect(first.result?.root).toBe("root");

    const second = compiler.push(source.slice(midpoint));
    expect(second.newPatches.length).toBeGreaterThan(0);

    const result = compiler.getResult();
    expect(result?.elements.root.type).toBe("Column");
    expect(result?.elements.cards.type).toBe("Row");
  });
});
