import { Column, type SoneNode } from "sone";
import { soneCatalog } from "./catalog";
import { soneComponents, assignProps } from "./components";
import { prepareSpec } from "./spec-normalize";
import type {
  BaseStyleProps,
  SoneBuildOptions,
  SoneBuildResult,
  SoneElement,
  SoneSpec,
  SoneSpecValidationIssue,
  TableProps,
  ListProps,
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

// =============================================================================
// Errors
// =============================================================================

export class SoneSpecError extends Error {
  readonly issues: SoneSpecValidationIssue[];

  constructor(issues: SoneSpecValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "SoneSpecError";
    this.issues = issues;
  }
}

// =============================================================================
// Validation
// =============================================================================

export function validateSoneSpec(
  spec: unknown,
  options: SoneBuildOptions = {},
): SoneSpecValidationIssue[] {
  const issues: SoneSpecValidationIssue[] = [];
  const prepared = prepareSpec(spec);

  if (!prepared) {
    issues.push({
      path: "/",
      message: "Could not extract a valid Sone spec (missing root and elements). The LLM response may be wrapped or malformed.",
    });
    return issues;
  }

  const catalogResult = soneCatalog.validate(prepared);
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

  if (prepared && prepared.root && prepared.elements[prepared.root] && !data.elements[data.root]) {
    data.root = prepared.root;
  }

  if (!data.elements[data.root] && Object.keys(data.elements).length > 0) {
    const referencedIds = new Set<string>();
    for (const el of Object.values(data.elements)) {
      for (const child of el.children ?? []) referencedIds.add(child);
    }
    const allIds = Object.keys(data.elements);
    const topLevel = allIds.filter((id) => !referencedIds.has(id));
    data.root = topLevel.length === 1 ? topLevel[0]! : allIds[0]!;
  }

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

// =============================================================================
// Build (strict)
// =============================================================================

export function buildSoneNode(
  spec: unknown,
  options: SoneBuildOptions = {},
): SoneBuildResult {
  assertValidSoneSpec(spec, options);
  const data = prepareSpec(spec) ?? (spec as SoneSpec);
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

// =============================================================================
// Build (lenient — for streaming preview)
// =============================================================================

export function specToSoneNodeLenient(spec: unknown): SoneNode {
  const data = prepareSpec(spec);
  if (!data?.root || !data.elements[data.root]) return null;
  return buildElementLenient(data.root, data, 0);
}

// =============================================================================
// Element shape validation
// =============================================================================

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

// =============================================================================
// Tree walking — delegates to soneComponents registry
// =============================================================================

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

  const builder = soneComponents[element.type];
  if (!builder) {
    throw new SoneSpecError([{
      path: `/elements/${id}`,
      message: `Unknown component type "${element.type}".`,
    }]);
  }
  return builder(element.props as Record<string, unknown>, children);
}

function buildElementLenient(
  id: string,
  spec: SoneSpec,
  depth: number,
): SoneNode {
  const element = spec.elements[id];
  if (!element) return null;
  if (depth > DEFAULT_MAX_DEPTH) return null;

  const children = (element.children ?? [])
    .filter((childId) => spec.elements[childId])
    .map((childId) => buildElementLenient(childId, spec, depth + 1))
    .filter((node): node is NonNullable<SoneNode> => node != null);

  try {
    const builder = soneComponents[element.type];
    if (!builder) return null;
    return builder(element.props as Record<string, unknown>, children);
  } catch {
    return children.length > 0 ? (() => { const n = Column(...children); assignProps(n, {}); return n; })() : null;
  }
}
