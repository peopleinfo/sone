import { defineCatalog } from "@json-render/core";
import { z } from "zod";
import { soneSchema } from "./schema";

const sizeValue = z.union([z.number(), z.literal("auto"), z.string()]);
const spacingValue = z.union([z.number(), z.string()]);
const alignItems = z.enum(["flex-start", "flex-end", "center", "stretch", "baseline"]);
const justifyContent = z.enum([
  "flex-start",
  "flex-end",
  "center",
  "space-between",
  "space-around",
  "space-evenly",
]);
const color = z.string();
const gridTrack = z.union([z.number(), z.literal("auto"), z.string()]);

const baseStyleProps = z.object({
  tag: z.string().optional(),
  width: sizeValue.optional(),
  height: sizeValue.optional(),
  minWidth: sizeValue.optional(),
  minHeight: sizeValue.optional(),
  maxWidth: sizeValue.optional(),
  maxHeight: sizeValue.optional(),
  padding: spacingValue.optional(),
  paddingTop: spacingValue.optional(),
  paddingRight: spacingValue.optional(),
  paddingBottom: spacingValue.optional(),
  paddingLeft: spacingValue.optional(),
  margin: z.union([spacingValue, z.literal("auto")]).optional(),
  marginTop: z.union([spacingValue, z.literal("auto")]).optional(),
  marginRight: z.union([spacingValue, z.literal("auto")]).optional(),
  marginBottom: z.union([spacingValue, z.literal("auto")]).optional(),
  marginLeft: z.union([spacingValue, z.literal("auto")]).optional(),
  gap: z.number().optional(),
  rowGap: z.number().optional(),
  columnGap: z.number().optional(),
  flexGrow: z.number().optional(),
  flexShrink: z.number().optional(),
  flex: z.number().optional(),
  alignItems: alignItems.optional(),
  alignSelf: alignItems.optional(),
  justifyContent: justifyContent.optional(),
  background: color.optional(),
  borderColor: color.optional(),
  borderWidth: z.number().optional(),
  cornerRadius: z.union([z.number(), z.array(z.number())]).optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict();

const textSegmentStyle = z.object({
  size: z.number().positive().optional(),
  color: color.optional(),
  font: z.union([z.string(), z.array(z.string())]).optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  style: z.enum(["normal", "italic", "oblique"]).optional(),
  letterSpacing: z.number().optional(),
  wordSpacing: z.number().optional(),
  lineHeight: z.number().positive().optional(),
  align: z.enum(["left", "right", "center", "justify"]).optional(),
  underline: z.number().optional(),
  underlineColor: z.union([color, z.null()]).optional(),
  lineThrough: z.number().optional(),
  lineThroughColor: z.union([color, z.null()]).optional(),
  overline: z.number().optional(),
  overlineColor: z.union([color, z.null()]).optional(),
  highlightColor: z.union([color, z.null()]).optional(),
  strokeColor: color.optional(),
  strokeWidth: z.number().optional(),
  offsetY: z.number().optional(),
  textDir: z.enum(["ltr", "rtl"]).optional(),
}).strict();

const textSegment = z.object({
  text: z.string(),
  style: textSegmentStyle.optional(),
}).strict();

const textProps = baseStyleProps.merge(textSegmentStyle).extend({
  segments: z.array(textSegment).optional(),
  text: z.string().optional(),
  nowrap: z.boolean().optional(),
  maxLines: z.number().int().positive().optional(),
  lineBreak: z.enum(["greedy", "knuth-plass"]).optional(),
  textOverflow: z.enum(["clip", "ellipsis"]).optional(),
  textWrap: z.enum(["wrap", "balance"]).optional(),
  hyphenation: z.union([z.string(), z.boolean()]).optional(),
  autofit: z.boolean().optional(),
  baseDir: z.enum(["ltr", "rtl", "auto"]).optional(),
});

const tableCell = baseStyleProps.extend({
  segments: z.array(textSegment).optional(),
  text: z.string().optional(),
  colspan: z.number().int().positive().optional(),
  rowspan: z.number().int().positive().optional(),
  header: z.boolean().optional(),
});

const tableRow = z.object({
  cells: z.array(tableCell).min(1),
}).strict();

const listItem = baseStyleProps.extend({
  segments: z.array(textSegment).optional(),
  text: z.string().optional(),
});

export const soneCatalog = defineCatalog(soneSchema, {
  components: {
    Column: {
      props: baseStyleProps,
      description: "Vertical Sone layout container. Use for document sections, cards, panels, and stacked content.",
      example: { width: 600, padding: 32, gap: 16, background: "#ffffff" },
    },
    Row: {
      props: baseStyleProps,
      description: "Horizontal Sone layout container. Use for paired content, media/text rows, controls, and metric bands.",
      example: { gap: 12, alignItems: "center" },
    },
    Grid: {
      props: baseStyleProps.extend({
        columns: z.array(gridTrack).optional(),
        rows: z.array(gridTrack).optional(),
        autoRows: z.array(gridTrack).optional(),
        autoColumns: z.array(gridTrack).optional(),
      }),
      description: "Grid layout container. Use columns like ['1fr', '1fr'] for cards and dashboards.",
      example: { columns: ["1fr", "1fr"], gap: 16 },
    },
    Text: {
      props: textProps,
      description: "Rich Sone text block. Prefer segments for mixed styling inside one paragraph.",
      example: {
        segments: [
          { text: "Sone ", style: { weight: "bold", color: "#111111" } },
          { text: "live agent", style: { color: "#666666" } },
        ],
        size: 28,
      },
    },
    Photo: {
      props: baseStyleProps.extend({
        src: z.string(),
        preserveAspectRatio: z.boolean().optional(),
        scaleType: z.enum(["cover", "fill", "contain"]).optional(),
        scaleAlignment: z.union([z.number(), z.enum(["center", "end", "start"])]).optional(),
        flipHorizontal: z.boolean().optional(),
        flipVertical: z.boolean().optional(),
        fill: color.optional(),
        clipPath: z.string().optional(),
      }),
      description: "Image node from a remote or uploaded URL. Use scaleType:'cover' for thumbnails and hero images.",
      example: { src: "https://picsum.photos/800/500", width: 320, height: 180, scaleType: "cover" },
    },
    Table: {
      props: baseStyleProps.extend({
        rows: z.array(tableRow).min(1),
        spacing: z.array(z.number()).optional(),
      }),
      description: "Prompt-friendly table. Emit rows and cells only; the renderer creates TableRow and TableCell nodes.",
      example: {
        rows: [
          { cells: [{ text: "Name", header: true }, { text: "Score", header: true }] },
          { cells: [{ text: "Ari" }, { text: "98" }] },
        ],
      },
    },
    List: {
      props: baseStyleProps.extend({
        items: z.array(listItem).min(1),
        listStyle: z.string().optional(),
        markerGap: z.number().optional(),
        markerOffset: z.number().optional(),
        startIndex: z.number().int().optional(),
      }),
      description: "Prompt-friendly list. Emit items only; the renderer creates ListItem nodes.",
      example: { listStyle: "disc", items: [{ text: "Fast preview" }, { text: "PNG export" }] },
    },
    Path: {
      props: baseStyleProps.extend({
        d: z.string(),
        stroke: color.optional(),
        strokeWidth: z.number().optional(),
        strokeLineCap: z.enum(["butt", "round", "square"]).optional(),
        strokeLineJoin: z.enum(["bevel", "miter", "round"]).optional(),
        strokeDashArray: z.array(z.number()).optional(),
        fill: color.optional(),
        fillOpacity: z.number().min(0).max(1).optional(),
        fillRule: z.enum(["evenodd", "nonzero"]).optional(),
        scalePath: z.number().optional(),
      }),
      description: "SVG path drawing node for simple shapes, dividers, accents, and custom marks.",
      example: { d: "M0 0 L120 0 L120 60 Z", fill: "#111827", width: 120, height: 60 },
    },
    ClipGroup: {
      props: baseStyleProps.extend({
        clipPath: z.string(),
      }),
      description: "Container that clips its children to an SVG path.",
      example: { clipPath: "M 75 0 L 150 150 L 0 150 Z", width: 150, height: 150 },
    },
  },
  actions: {},
});

export type SoneCatalog = typeof soneCatalog;

export {
  baseStyleProps,
  textSegment,
  textSegmentStyle,
  tableCell,
  tableRow,
  listItem,
};
