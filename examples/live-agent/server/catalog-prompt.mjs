const COMPONENTS = [
  {
    name: "Column",
    description: "Vertical Sone layout container for stacked sections and cards.",
    example: { width: 600, padding: 32, gap: 16, background: "#ffffff" },
  },
  {
    name: "Row",
    description: "Horizontal Sone layout container for side-by-side content.",
    example: { gap: 12, alignItems: "center" },
  },
  {
    name: "Grid",
    description: "Grid layout container using columns such as ['1fr', '1fr'].",
    example: { columns: ["1fr", "1fr"], gap: 16 },
  },
  {
    name: "Text",
    description: "Rich Sone text block. Prefer props.segments for copy and mixed styles.",
    example: {
      segments: [
        { text: "Sone ", style: { weight: "bold", color: "#111111" } },
        { text: "live agent", style: { color: "#666666" } },
      ],
      size: 28,
    },
  },
  {
    name: "Photo",
    description: "Remote image node. Use scaleType:'cover' for thumbnails and hero images.",
    example: { src: "https://picsum.photos/800/500", width: 320, height: 180, scaleType: "cover" },
  },
  {
    name: "Table",
    description: "Prompt-friendly table. Use props.rows[].cells[]; wrapper nodes are generated internally.",
    example: {
      rows: [
        { cells: [{ text: "Name", header: true }, { text: "Score", header: true }] },
        { cells: [{ text: "Ari" }, { text: "98" }] },
      ],
    },
  },
  {
    name: "List",
    description: "Prompt-friendly list. Use props.items[]; ListItem wrappers are generated internally.",
    example: { listStyle: "disc", items: [{ text: "Fast preview" }, { text: "PNG export" }] },
  },
  {
    name: "Path",
    description: "SVG path drawing node for dividers, accents, and simple custom marks.",
    example: { d: "M0 0 L120 0 L120 60 Z", fill: "#111827", width: 120, height: 60 },
  },
  {
    name: "ClipGroup",
    description: "Container that clips its children to an SVG path.",
    example: { clipPath: "M 75 0 L 150 150 L 0 150 Z", width: 150, height: 150 },
  },
];

export function createSoneSystemPrompt(customRules = []) {
  const lines = [
    "You are a Sone canvas design agent. Generate concise JSONL patches that build valid Sone specs.",
    "",
    "SPEC SHAPE:",
    "{ root: string, elements: Record<string, { type: ComponentName, props: object, children: string[] }> }",
    "",
    "AVAILABLE COMPONENTS:",
  ];

  for (const component of COMPONENTS) {
    lines.push(`- ${component.name}: ${component.description}`);
    lines.push(`  example props: ${JSON.stringify(component.example)}`);
  }

  lines.push(
    "",
    "RULES:",
    "Output ONLY JSONL patches. No prose, markdown, code fences, comments, or explanations.",
    'First set root: {"op":"add","path":"/root","value":"<root-key>"}',
    'Then add each element: {"op":"add","path":"/elements/<key>","value":{"type":"Column","props":{},"children":[]}}',
    "Every element must include children; leaf components use children: [].",
    "Only use the listed components.",
    "Do not output /state patches in v1.",
    "Do not emit TableRow, TableCell, or ListItem elements. Use Table.props.rows and List.props.items.",
    "For Text, prefer props.segments for all copy and mixed styles.",
    "Use patch-only edits when refining an existing spec.",
    "Generate real Sone canvas layouts, not DOM or CSS component names.",
    "Keep numeric dimensions inside practical canvas bounds and avoid huge trees.",
    ...customRules,
  );

  return lines.join("\n");
}
