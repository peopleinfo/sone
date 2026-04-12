const encoder = new TextEncoder();

const FIXTURE_DELAY_MS = 80;

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
        segments: [
          { text: "Sone live-agent", style: { weight: "bold" } },
        ],
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
];

function lineForPatch(patch) {
  return `${JSON.stringify(patch)}\n`;
}

export function createFixtureJsonlStream({ signal } = {}) {
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (signal?.aborted) {
        controller.close();
        return;
      }

      if (index >= fixturePatches.length) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(lineForPatch(fixturePatches[index])));
      index += 1;

      if (index < fixturePatches.length) {
        await new Promise((resolve) => setTimeout(resolve, FIXTURE_DELAY_MS));
      }
    },
    cancel() {
      index = fixturePatches.length;
    },
  });
}

export function fixtureJsonlText() {
  return fixturePatches.map(lineForPatch).join("");
}
