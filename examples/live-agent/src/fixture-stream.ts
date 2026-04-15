import type { SoneSpec } from "./types";

const FIXTURE_DELAY_MS = 80;
const LOCAL_SPEC_DELAY_MS = 24;

const fixturePatches = [
  { op: "add", path: "/root", value: "root" },
  {
    op: "add",
    path: "/elements/root",
    value: {
      type: "Column",
      props: {
        width: 720,
        padding: 32,
        gap: 18,
        background: "#f8fafc",
      },
      children: ["headline", "body", "cards"],
    },
  },
  {
    op: "add",
    path: "/elements/headline",
    value: {
      type: "Text",
      props: {
        segments: [{ text: "Sone live-agent", style: { weight: "bold" } }],
        size: 34,
        color: "#111827",
        lineHeight: 1.1,
      },
      children: [],
    },
  },
  {
    op: "add",
    path: "/elements/body",
    value: {
      type: "Text",
      props: {
        segments: [
          {
            text: "This deterministic stream proves JSONL patch compilation, validation, Sone translation, preview, and export without model credentials.",
          },
        ],
        size: 15,
        color: "#475569",
        lineHeight: 1.55,
      },
      children: [],
    },
  },
  {
    op: "add",
    path: "/elements/cards",
    value: {
      type: "Row",
      props: { gap: 14 },
      children: ["card-schema", "card-stream"],
    },
  },
  {
    op: "add",
    path: "/elements/card-schema",
    value: {
      type: "Column",
      props: {
        padding: 18,
        gap: 8,
        background: "#ffffff",
        borderWidth: 1,
        borderColor: "#dbe3ef",
        cornerRadius: 8,
        flexGrow: 1,
      },
      children: ["schema-title", "schema-copy"],
    },
  },
  {
    op: "add",
    path: "/elements/schema-title",
    value: {
      type: "Text",
      props: {
        segments: [{ text: "Custom Sone catalog", style: { weight: "bold" } }],
        size: 18,
        color: "#0f172a",
      },
      children: [],
    },
  },
  {
    op: "add",
    path: "/elements/schema-copy",
    value: {
      type: "Text",
      props: {
        segments: [{ text: "The model targets Sone primitives, not DOM widgets." }],
        size: 13,
        color: "#64748b",
        lineHeight: 1.4,
      },
      children: [],
    },
  },
  {
    op: "add",
    path: "/elements/card-stream",
    value: {
      type: "Column",
      props: {
        padding: 18,
        gap: 8,
        background: "#101827",
        borderWidth: 1,
        borderColor: "#1f2a44",
        cornerRadius: 8,
        flexGrow: 1,
      },
      children: ["stream-title", "stream-copy"],
    },
  },
  {
    op: "add",
    path: "/elements/stream-title",
    value: {
      type: "Text",
      props: {
        segments: [{ text: "Patch stream ready", style: { weight: "bold" } }],
        size: 18,
        color: "#ffffff",
      },
      children: [],
    },
  },
  {
    op: "add",
    path: "/elements/stream-copy",
    value: {
      type: "Text",
      props: {
        segments: [{ text: "Each line is an RFC 6902 patch consumed by the client compiler." }],
        size: 13,
        color: "#cbd5e1",
        lineHeight: 1.4,
      },
      children: [],
    },
  },
] as const;

function lineForPatch(patch: unknown) {
  return `${JSON.stringify(patch)}\n`;
}

function createLineStream(
  lines: string[],
  {
    signal,
    delayMs = 0,
  }: {
    signal?: AbortSignal;
    delayMs?: number;
  } = {},
) {
  let index = 0;

  return new ReadableStream<string>({
    async pull(controller) {
      if (signal?.aborted || index >= lines.length) {
        controller.close();
        return;
      }

      controller.enqueue(lines[index]);
      index += 1;

      if (delayMs > 0 && index < lines.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    },
    cancel() {
      index = lines.length;
    },
  });
}

function specToPatches(spec: SoneSpec) {
  return [
    { op: "add", path: "/root", value: spec.root },
    ...Object.entries(spec.elements).map(([key, value]) => ({
      op: "add" as const,
      path: `/elements/${key}`,
      value,
    })),
  ];
}

export function createFixtureJsonlStream({
  signal,
  delayMs = FIXTURE_DELAY_MS,
}: {
  signal?: AbortSignal;
  delayMs?: number;
} = {}) {
  return createLineStream(fixturePatches.map(lineForPatch), { signal, delayMs });
}

export function createSpecJsonlStream(
  spec: SoneSpec,
  {
    signal,
    delayMs = LOCAL_SPEC_DELAY_MS,
  }: {
    signal?: AbortSignal;
    delayMs?: number;
  } = {},
) {
  return createLineStream(specToPatches(spec).map(lineForPatch), { signal, delayMs });
}

export function fixtureJsonlText() {
  return fixturePatches.map(lineForPatch).join("");
}
