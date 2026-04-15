import { defineSchema } from "@json-render/core";
import type { z } from "zod";

type PromptCatalog = {
  components?: Record<
    string,
    {
      description?: string;
      props?: z.ZodType;
      example?: unknown;
    }
  >;
};

export const soneSchema = defineSchema(
  (s) => ({
    spec: s.object({
      root: s.string(),
      elements: s.record(
        s.object({
          type: s.ref("catalog.components"),
          props: s.propsOf("catalog.components"),
          children: s.array(s.string()),
        }),
      ),
    }),
    catalog: s.object({
      components: s.map({
        props: s.zod(),
        description: s.string(),
        example: s.any(),
      }),
      actions: s.map({
        description: s.string(),
      }),
    }),
  }),
  {
    promptTemplate(context) {
      const catalog = context.catalog as PromptCatalog;
      const components = catalog.components ?? {};
      const mode = String(context.options.mode ?? "standalone");
      const isInline = mode === "inline" || mode === "chat";
      const lines = [
        context.options.system ??
          "You are a Sone canvas design agent. Generate concise JSONL patches that build valid Sone specs.",
        "",
        "SPEC SHAPE:",
        "{ root: string, elements: Record<string, { type: ComponentName, props: object, children: string[] }> }",
        "",
        "AVAILABLE COMPONENTS:",
      ];

      for (const name of context.componentNames) {
        const definition = components[name];
        lines.push(`- ${name}: ${definition?.description ?? "Sone component"}`);
        if (definition?.props) {
          lines.push(`  props: ${context.formatZodType(definition.props)}`);
        }
        if (definition?.example != null) {
          lines.push(`  example props: ${JSON.stringify(definition.example)}`);
        }
      }

      lines.push(
        "",
        "RULES:",
        isInline
          ? "When UI is needed, write brief text first, then JSONL patch lines on their own lines."
          : "Output ONLY JSONL patches. No prose, markdown, or code fences.",
        'First set root: {"op":"add","path":"/root","value":"<root-key>"}',
        'Then add each element: {"op":"add","path":"/elements/<key>","value":{"type":"Column","props":{},"children":[]}}',
        "Element value shape is strict: type + props + children only. Do not omit props/children.",
        "Every element must include children; leaf components use children: [].",
        "children entries must be element id strings only, never objects.",
        "Only use the listed components.",
        "Do not output /state patches in v1.",
        "Do not emit TableRow, TableCell, or ListItem elements. Use Table.props.rows and List.props.items.",
        "For Text, prefer props.segments for all copy and mixed styles.",
        "Do not emit unknown CSS keys; use catalog-compatible keys only.",
        "Use patch-only edits when refining an existing spec.",
        ...(context.options.customRules ?? []),
      );

      return lines.join("\n");
    },
    defaultRules: [
      "Generate real Sone canvas layouts, not DOM or CSS component names.",
      "Every element must include type, props, and children. Leaf components use children: [].",
      "Use Column, Row, Grid, Text, TextDefault, PageBreak, Photo, Table, List, Path, and ClipGroup only.",
      "The root id must match a key in elements; add that element before referencing it as root.",
      "Patch order should always be: /root first, then /elements/root, then remaining elements.",
      "Do not put color on Column, Row, Grid, List item, or table cell props; use background for fills. Text may use segments[].style.color.",
      "Do not place text props (text/segments/font/weight/color) on non-Text elements.",
      "For Text, prefer props.segments with explicit text and optional style objects.",
      "For Table, do not emit TableRow or TableCell elements. Use Table.props.rows[].cells[]; the renderer creates wrapper nodes.",
      "For List, do not emit ListItem elements. Use List.props.items[]; the renderer creates wrapper nodes.",
      "Keep numeric dimensions inside practical canvas bounds and avoid huge trees.",
      "Use patch-only edits when refining an existing spec.",
    ],
  },
);

export type SoneSchema = typeof soneSchema;
