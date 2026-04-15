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
import { soneCatalog } from "./catalog";
import type {
  BaseStyleProps,
  ClipGroupProps,
  GridProps,
  ListItemSpec,
  ListProps,
  PageBreakProps,
  PathProps,
  PhotoProps,
  SoneBuildOptions,
  SoneBuildResult,
  SoneElement,
  SoneSpec,
  SoneSpecValidationIssue,
  TableCellSpec,
  TableProps,
  TextProps,
  TextDefaultProps,
  TextSegment,
} from "./types";

const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_ELEMENTS = 250;
const DEFAULT_MAX_DIMENSION = 4096;

const CONTAINER_TYPES = new Set(["Column", "Row", "Grid", "ClipGroup", "TextDefault"]);

const DIMENSION_KEYS = [
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
] as const;

export class SoneSpecError extends Error {
  readonly issues: SoneSpecValidationIssue[];

  constructor(issues: SoneSpecValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "SoneSpecError";
    this.issues = issues;
  }
}

export function validateSoneSpec(
  spec: unknown,
  options: SoneBuildOptions = {},
): SoneSpecValidationIssue[] {
  const issues: SoneSpecValidationIssue[] = [];
  const catalogResult = soneCatalog.validate(spec);
  if (!catalogResult.success) {
    for (const issue of catalogResult.error?.issues ?? []) {
      issues.push({
        path: issue.path.length ? `/${issue.path.join("/")}` : "/",
        message: issue.message,
      });
    }
    return issues;
  }

  const data = catalogResult.data as SoneSpec;
  const maxElements = options.maxElements ?? DEFAULT_MAX_ELEMENTS;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const elementIds = Object.keys(data.elements);

  if (!data.elements[data.root]) {
    issues.push({ path: "/root", message: `Root element "${data.root}" does not exist.` });
  }

  if (elementIds.length > maxElements) {
    issues.push({
      path: "/elements",
      message: `Spec has ${elementIds.length} elements; max is ${maxElements}.`,
    });
  }

  for (const [id, element] of Object.entries(data.elements)) {
    validateElementShape(id, element, maxDimension, issues);
    for (const child of element.children ?? []) {
      if (!data.elements[child]) {
        issues.push({
          path: `/elements/${id}/children`,
          message: `Child "${child}" does not exist.`,
        });
      }
    }
  }

  detectCyclesAndDepth(data, maxDepth, issues);

  return issues;
}

export function assertValidSoneSpec(
  spec: unknown,
  options: SoneBuildOptions = {},
): asserts spec is SoneSpec {
  const issues = validateSoneSpec(spec, options);
  if (issues.length > 0) {
    throw new SoneSpecError(issues);
  }
}

export function buildSoneNode(
  spec: unknown,
  options: SoneBuildOptions = {},
): SoneBuildResult {
  assertValidSoneSpec(spec, options);
  const data = spec as SoneSpec;
  return {
    node: buildElement(data.root, data, 0, options),
    issues: [],
  };
}

export function specToSoneNode(
  spec: unknown,
  options: SoneBuildOptions = {},
): SoneNode {
  return buildSoneNode(spec, options).node;
}

function validateElementShape(
  id: string,
  element: SoneElement,
  maxDimension: number,
  issues: SoneSpecValidationIssue[],
) {
  const path = `/elements/${id}`;
  const componentDef = soneCatalog.data.components[element.type];
  const propResult = componentDef?.props.safeParse(element.props);
  if (!propResult?.success) {
    for (const issue of propResult.error.issues) {
      issues.push({
        path: `${path}/props${issue.path.length ? `/${issue.path.join("/")}` : ""}`,
        message: issue.message,
      });
    }
    return;
  }

  if (!CONTAINER_TYPES.has(element.type) && element.children.length > 0) {
    issues.push({
      path: `${path}/children`,
      message: `${element.type} does not accept child element references in v1.`,
    });
  }

  validateDimensionBounds(path, element.props as BaseStyleProps, maxDimension, issues);

  if (element.type === "Table") {
    const rows = (element.props as TableProps).rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      issues.push({ path: `${path}/props/rows`, message: "Table requires at least one row." });
    }
    rows?.forEach((row, rowIndex) => {
      if (!Array.isArray(row.cells) || row.cells.length === 0) {
        issues.push({
          path: `${path}/props/rows/${rowIndex}/cells`,
          message: "Table row requires at least one cell.",
        });
      }
      row.cells?.forEach((cell, cellIndex) => {
        validateDimensionBounds(
          `${path}/props/rows/${rowIndex}/cells/${cellIndex}`,
          cell,
          maxDimension,
          issues,
        );
      });
    });
  }

  if (element.type === "List") {
    const items = (element.props as ListProps).items;
    if (!Array.isArray(items) || items.length === 0) {
      issues.push({ path: `${path}/props/items`, message: "List requires at least one item." });
    }
    items?.forEach((item, itemIndex) => {
      validateDimensionBounds(`${path}/props/items/${itemIndex}`, item, maxDimension, issues);
    });
  }
}

function validateDimensionBounds(
  path: string,
  props: BaseStyleProps,
  maxDimension: number,
  issues: SoneSpecValidationIssue[],
) {
  for (const key of DIMENSION_KEYS) {
    const value = props[key];
    if (typeof value === "number" && (value < 0 || value > maxDimension)) {
      issues.push({
        path: `${path}/props/${key}`,
        message: `${key} must be between 0 and ${maxDimension}.`,
      });
    }
  }
}

function detectCyclesAndDepth(
  spec: SoneSpec,
  maxDepth: number,
  issues: SoneSpecValidationIssue[],
) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string, depth: number) => {
    if (depth > maxDepth) {
      issues.push({
        path: `/elements/${id}`,
        message: `Tree depth exceeds max depth ${maxDepth}.`,
      });
      return;
    }
    if (visiting.has(id)) {
      issues.push({ path: `/elements/${id}`, message: "Cycle detected in child graph." });
      return;
    }
    if (visited.has(id)) return;

    const element = spec.elements[id];
    if (!element) return;
    visiting.add(id);
    for (const child of element.children ?? []) {
      visit(child, depth + 1);
    }
    visiting.delete(id);
    visited.add(id);
  };

  visit(spec.root, 1);
}

function buildElement(
  id: string,
  spec: SoneSpec,
  depth: number,
  options: SoneBuildOptions,
): SoneNode {
  const element = spec.elements[id];
  if (!element) {
    throw new SoneSpecError([{ path: `/elements/${id}`, message: "Missing element." }]);
  }
  if (depth > (options.maxDepth ?? DEFAULT_MAX_DEPTH)) {
    throw new SoneSpecError([{ path: `/elements/${id}`, message: "Max render depth exceeded." }]);
  }

  const children = (element.children ?? []).map((childId) =>
    buildElement(childId, spec, depth + 1, options),
  );

  switch (element.type) {
    case "Column":
      return applyBaseProps(Column(...children), element.props as BaseStyleProps);
    case "Row":
      return applyBaseProps(Row(...children), element.props as BaseStyleProps);
    case "Grid":
      return applyGridProps(Grid(...children), element.props as GridProps);
    case "Text":
      return applyTextProps(buildText(element.props as TextProps), element.props as TextProps);
    case "TextDefault":
      return applyTextDefaultProps(
        TextDefault(...children),
        element.props as TextDefaultProps,
      );
    case "PageBreak":
      return applyPageBreakProps(element.props as PageBreakProps);
    case "Photo":
      return applyPhotoProps(element.props as PhotoProps);
    case "Path":
      return applyPathProps(element.props as PathProps);
    case "Table":
      return applyTableProps(element.props as TableProps);
    case "List":
      return applyListProps(element.props as ListProps);
    case "ClipGroup":
      return applyBaseProps(
        ClipGroup((element.props as ClipGroupProps).clipPath, ...children),
        omitKeys(element.props as ClipGroupProps, ["clipPath"]),
      );
  }
}

function buildText(props: TextProps | TableCellSpec | ListItemSpec) {
  const segments = getTextSegments(props);
  const node = Text(...segments.map(segmentToTextChild));
  applyInlineTextStyle(node, props);
  return node;
}

function getTextSegments(props: TextProps | TableCellSpec | ListItemSpec): TextSegment[] {
  if (props.segments?.length) return props.segments;
  if (props.text != null) return [{ text: props.text }];
  return [{ text: "" }];
}

function segmentToTextChild(segment: TextSegment) {
  if (!segment.style || Object.keys(segment.style).length === 0) {
    return segment.text;
  }
  const span = Span(segment.text);
  assignProps(span, segment.style);
  return span;
}

function applyTextProps(node: ReturnType<typeof Text>, props: TextProps) {
  const passthrough = omitKeys(props, ["segments", "text"]);
  assignProps(node, passthrough);
  return node;
}

function applyTextDefaultProps(
  node: ReturnType<typeof TextDefault>,
  props: TextDefaultProps,
) {
  assignProps(node, props);
  return node;
}

function applyPageBreakProps(props: PageBreakProps) {
  const mode = props.mode ?? "before";
  return PageBreak().pageBreak(mode);
}

function applyInlineTextStyle(
  node: ReturnType<typeof Text>,
  props: TextProps | TableCellSpec | ListItemSpec,
) {
  const styleValue = (props as { style?: unknown }).style;
  if (styleValue && typeof styleValue === "object" && !Array.isArray(styleValue)) {
    assignProps(node, styleValue as object);
  }
}

function applyPhotoProps(props: PhotoProps) {
  const node = Photo(props.src);
  assignProps(node, omitKeys(props, ["src"]));
  return node;
}

function applyPathProps(props: PathProps) {
  const node = Path(props.d);
  assignProps(node, omitKeys(props, ["d"]));
  return node;
}

function applyTableProps(props: TableProps) {
  const rows = props.rows.map((row) =>
    TableRow(
      ...row.cells.map((cell) => {
        const text = buildText(cell);
        if (cell.header) {
          assignProps(text, { weight: "bold" });
        }
        const tableCell = TableCell(text);
        assignProps(tableCell, omitKeys(cell, ["segments", "text", "style", "header"]));
        return tableCell;
      }),
    ),
  );
  const node = Table(...rows);
  assignProps(node, omitKeys(props, ["rows"]));
  return node;
}

function applyListProps(props: ListProps) {
  const node = List(
    ...props.items.map((item: ListItemSpec) => {
      const listItem = ListItem(buildText(item));
      assignProps(listItem, omitKeys(item, ["segments", "text", "style"]));
      return listItem;
    }),
  );
  assignProps(node, omitKeys(props, ["items"]));
  return node;
}

function applyGridProps(node: ReturnType<typeof Grid>, props: GridProps) {
  if (props.columns) node.columns(...props.columns);
  if (props.rows) node.rows(...props.rows);
  if (props.autoRows) node.autoRows(...props.autoRows);
  if (props.autoColumns) node.autoColumns(...props.autoColumns);
  assignProps(node, omitKeys(props, ["columns", "rows", "autoRows", "autoColumns"]));
  return node;
}

function applyBaseProps<T extends SoneNode>(node: T, props: BaseStyleProps): T {
  assignProps(node, props);
  return node;
}

function assignProps(target: unknown, props: object) {
  const holder = target as { props?: Record<string, unknown> };
  if (!holder.props) return;
  const normalized = normalizeSoneProps(props);
  Object.assign(holder.props, normalized);
}

function normalizeSoneProps(props: object) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "paddingVertical") {
      if (normalized.paddingTop === undefined) {
        normalized.paddingTop = value;
      }
      if (normalized.paddingBottom === undefined) {
        normalized.paddingBottom = value;
      }
      continue;
    }
    if (key === "paddingHorizontal") {
      if (normalized.paddingLeft === undefined) {
        normalized.paddingLeft = value;
      }
      if (normalized.paddingRight === undefined) {
        normalized.paddingRight = value;
      }
      continue;
    }
    if (key === "boxShadow") {
      normalized.shadows = Array.isArray(value) ? value : [value];
      continue;
    }
    if (key === "background") {
      normalized.background = Array.isArray(value) ? value : [value];
      continue;
    }
    if (key === "cornerRadius" && typeof value === "number") {
      normalized.cornerRadius = [value];
      continue;
    }
    if (key === "scale" && typeof value === "number") {
      normalized.scale = [value, value];
      continue;
    }
    if (key === "font" && typeof value === "string") {
      normalized.font = [value];
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function omitKeys<T extends object, K extends keyof T>(
  value: T,
  keys: K[],
): Omit<T, K> {
  const omitted = { ...(value as Record<string, unknown>) };
  for (const key of keys) {
    delete omitted[key as string];
  }
  return omitted as Omit<T, K>;
}
