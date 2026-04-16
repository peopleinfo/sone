import {
  ClipGroup,
  Column,
  Grid,
  List,
  ListItem,
  PageBreak,
  Path,
  Photo,
  Row,
  Span,
  Table,
  TableCell,
  TableRow,
  Text,
  TextDefault,
  type SoneNode,
} from "sone";
import type {
  BaseStyleProps,
  ClipGroupProps,
  GridProps,
  ListItemSpec,
  ListProps,
  PageBreakProps,
  PathProps,
  PhotoProps,
  SoneComponentType,
  TableCellSpec,
  TableProps,
  TextDefaultProps,
  TextProps,
  TextSegment,
} from "./types";

// =============================================================================
// Shared helpers
// =============================================================================

export function assignProps(target: unknown, props: object) {
  const holder = target as { props?: Record<string, unknown> };
  if (!holder.props) return;
  Object.assign(holder.props, normalizeSoneProps(props));
}

export function omitKeys<T extends object, K extends keyof T>(
  value: T,
  keys: K[],
): Omit<T, K> {
  const omitted = { ...(value as Record<string, unknown>) };
  for (const key of keys) delete omitted[key as string];
  return omitted as Omit<T, K>;
}

function normalizeSoneProps(props: object) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "paddingVertical") {
      out.paddingTop ??= value;
      out.paddingBottom ??= value;
      continue;
    }
    if (key === "paddingHorizontal") {
      out.paddingLeft ??= value;
      out.paddingRight ??= value;
      continue;
    }
    if (key === "boxShadow") {
      out.shadows = Array.isArray(value) ? value : [value];
      continue;
    }
    if (key === "borderTop") {
      if (typeof value === "number") {
        out.borderTopWidth = value;
      } else if (typeof value === "string") {
        const w = parseBorderWidth(value);
        if (w !== null) out.borderTopWidth = w;
        const c = parseBorderColor(value);
        if (c && out.borderColor === undefined) out.borderColor = c;
      }
      continue;
    }
    if (key === "borderBottom") {
      if (typeof value === "number") {
        out.borderBottomWidth = value;
      } else if (typeof value === "string") {
        const w = parseBorderWidth(value);
        if (w !== null) out.borderBottomWidth = w;
        const c = parseBorderColor(value);
        if (c && out.borderColor === undefined) out.borderColor = c;
      }
      continue;
    }
    if (key === "background") { out.background = Array.isArray(value) ? value : [value]; continue; }
    if (key === "cornerRadius" && typeof value === "number") { out.cornerRadius = [value]; continue; }
    if (key === "scale" && typeof value === "number") { out.scale = [value, value]; continue; }
    if (key === "font" && typeof value === "string") { out.font = [value]; continue; }
    out[key] = value;
  }
  return out;
}

function parseBorderWidth(v: string): number | null {
  const m = v.match(/-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseBorderColor(v: string): string | null {
  const m = v.match(
    /(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})|rgba?\([^)]+\)|hsla?\([^)]+\))/,
  );
  return m?.[1] ?? null;
}

// =============================================================================
// Text helpers (shared by Text, Table cells, List items)
// =============================================================================

function getTextSegments(props: TextProps | TableCellSpec | ListItemSpec): TextSegment[] {
  if (props.segments?.length) return props.segments;
  if (props.text != null) return [{ text: props.text }];
  return [{ text: "" }];
}

function segmentToTextChild(segment: TextSegment) {
  if (!segment.style || Object.keys(segment.style).length === 0) return segment.text;
  const span = Span(segment.text);
  assignProps(span, segment.style);
  return span;
}

function buildTextNode(props: TextProps | TableCellSpec | ListItemSpec) {
  const node = Text(...getTextSegments(props).map(segmentToTextChild));
  const styleValue = (props as { style?: unknown }).style;
  if (styleValue && typeof styleValue === "object" && !Array.isArray(styleValue)) {
    assignProps(node, styleValue as object);
  }
  return node;
}

function cellHasPadding(cell: TableCellSpec): boolean {
  const c = cell as Record<string, unknown>;
  return (
    c.padding !== undefined ||
    c.paddingTop !== undefined ||
    c.paddingBottom !== undefined ||
    c.paddingLeft !== undefined ||
    c.paddingRight !== undefined
  );
}

// =============================================================================
// Component builder type
// =============================================================================

export type SoneComponentBuilder = (
  props: Record<string, unknown>,
  children: SoneNode[],
) => SoneNode;

// =============================================================================
// Standard Sone component implementations
//
// Each entry maps a catalog component name to its builder function,
// following the same registry pattern as @json-render/shadcn components.tsx.
// =============================================================================

export const soneComponents: Record<SoneComponentType, SoneComponentBuilder> = {
  Column: (props, children) => {
    const node = Column(...children);
    assignProps(node, props);
    return node;
  },

  Row: (props, children) => {
    const node = Row(...children);
    assignProps(node, props);
    return node;
  },

  Grid: (props, children) => {
    const p = props as GridProps;
    const node = Grid(...children);
    if (p.columns) node.columns(...p.columns);
    if (p.rows) node.rows(...p.rows);
    if (p.autoRows) node.autoRows(...p.autoRows);
    if (p.autoColumns) node.autoColumns(...p.autoColumns);
    assignProps(node, omitKeys(p, ["columns", "rows", "autoRows", "autoColumns"]));
    return node;
  },

  Text: (props) => {
    const p = props as TextProps;
    const node = buildTextNode(p);
    assignProps(node, omitKeys(p, ["segments", "text"]));
    return node;
  },

  TextDefault: (props, children) => {
    const node = TextDefault(...children);
    assignProps(node, props as TextDefaultProps);
    return node;
  },

  PageBreak: (props) => {
    const mode = (props as PageBreakProps).mode ?? "before";
    return PageBreak().pageBreak(mode);
  },

  Photo: (props) => {
    const p = props as unknown as PhotoProps;
    const node = Photo(p.src);
    assignProps(node, omitKeys(p, ["src"]));
    return node;
  },

  Path: (props) => {
    const p = props as unknown as PathProps;
    const node = Path(p.d);
    assignProps(node, omitKeys(p, ["d"]));
    return node;
  },

  Table: (props) => {
    const p = props as unknown as TableProps;
    const rows = p.rows.map((row) =>
      TableRow(
        ...row.cells.map((cell) => {
          const text = buildTextNode(cell);
          if (cell.header) assignProps(text, { weight: "bold" });
          const tc = TableCell(text);
          const cellProps = omitKeys(cell, ["segments", "text", "style", "header"]);
          if (!cellHasPadding(cell)) {
            assignProps(tc, { paddingTop: 6, paddingBottom: 6, paddingLeft: 10, paddingRight: 10 });
          }
          assignProps(tc, cellProps);
          return tc;
        }),
      ),
    );
    const node = Table(...rows);
    const tableProps = omitKeys(p, ["rows"]);
    if (!tableProps.spacing && !tableProps.gap) {
      assignProps(node, { spacing: [8, 0] });
    }
    assignProps(node, tableProps);
    return node;
  },

  List: (props) => {
    const p = props as unknown as ListProps;
    const node = List(
      ...p.items.map((item: ListItemSpec) => {
        const li = ListItem(buildTextNode(item));
        assignProps(li, omitKeys(item, ["segments", "text", "style"]));
        return li;
      }),
    );
    assignProps(node, omitKeys(p, ["items"]));
    return node;
  },

  ClipGroup: (props, children) => {
    const p = props as unknown as ClipGroupProps;
    const node = ClipGroup(p.clipPath, ...children);
    assignProps(node, omitKeys(p, ["clipPath"]));
    return node;
  },
};
