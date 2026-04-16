import { soneCatalog } from "@/catalog";
import type { SoneSpec } from "@/types";

/**
 * Shared spec preparation for streaming, OpenAI-compatible parsing, and Sone rendering.
 * LLMs often omit `children`, nest inline element objects, or mix kebab/camel ids.
 */

export function recoverMissingRoot(spec: SoneSpec | null): SoneSpec | null {
  if (!spec || typeof spec !== "object" || typeof spec.elements !== "object" || !spec.elements) {
    return null;
  }

  if (typeof spec.root === "string" && spec.root.length > 0 && spec.elements[spec.root]) {
    return spec;
  }

  if (spec.elements.root) {
    return { ...spec, root: "root" };
  }

  const elementIds = Object.keys(spec.elements);
  if (elementIds.length === 1) {
    return { ...spec, root: elementIds[0] as string };
  }

  if (elementIds.length > 1) {
    const referencedIds = new Set<string>();
    for (const el of Object.values(spec.elements)) {
      if (el && Array.isArray(el.children)) {
        for (const child of el.children) {
          if (typeof child === "string") referencedIds.add(child);
        }
      }
    }
    const topLevel = elementIds.filter((id) => !referencedIds.has(id));
    if (topLevel.length === 1) {
      return { ...spec, root: topLevel[0] as string };
    }
  }

  return spec;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeElementId(id: unknown): string {
  if (typeof id !== "string") {
    return "";
  }
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function flattenNumberValues(value: unknown, output: number[]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenNumberValues(item, output);
    }
  }
}

function normalizeTextStyleAliases(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized: Record<string, unknown> = { ...value };

  if (normalized.weight === undefined && normalized.fontWeight !== undefined) {
    normalized.weight = normalized.fontWeight;
  }
  if (normalized.size === undefined && normalized.fontSize !== undefined) {
    normalized.size = normalized.fontSize;
  }
  if (normalized.align === undefined && normalized.textAlign !== undefined) {
    normalized.align = normalized.textAlign;
  }
  if (normalized.font === undefined && normalized.fontFamily !== undefined) {
    normalized.font = normalized.fontFamily;
  }

  delete normalized.fontWeight;
  delete normalized.fontSize;
  delete normalized.textAlign;
  delete normalized.fontFamily;
  return normalized;
}

function coerceShadowValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;

  const x = typeof value.x === "number" ? value.x : typeof value.offsetX === "number" ? value.offsetX : 0;
  const y = typeof value.y === "number" ? value.y : typeof value.offsetY === "number" ? value.offsetY : 4;
  const blur = typeof value.blur === "number" ? value.blur : typeof value.blurRadius === "number" ? value.blurRadius : 8;
  const spread = typeof value.spread === "number" ? value.spread : typeof value.spreadRadius === "number" ? value.spreadRadius : 0;
  const color = typeof value.color === "string" ? value.color : "rgba(0,0,0,0.15)";

  return spread !== 0
    ? `${x}px ${y}px ${blur}px ${spread}px ${color}`
    : `${x}px ${y}px ${blur}px ${color}`;
}

function normalizeShadowProp(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const coerced = value.map(coerceShadowValue).filter((v): v is string => v !== null);
    return coerced.length > 0 ? coerced : undefined;
  }
  if (isRecord(value)) {
    const result = coerceShadowValue(value);
    return result ?? undefined;
  }
  return undefined;
}

const STRUCTURAL_PROPS = new Set([
  "rows", "items", "segments", "columns", "d", "src", "clipPath",
  "autoRows", "autoColumns", "spacing", "cells", "text", "mode",
]);

function stripInvalidProps(
  type: SoneSpec["elements"][string]["type"],
  props: Record<string, unknown>,
): Record<string, unknown> {
  const componentDef = soneCatalog.data.components[type];
  if (!componentDef) return props;

  const result = componentDef.props.safeParse(props);
  if (result.success) return props;

  const invalidPaths = new Set(
    result.error.issues.map((issue) => String(issue.path[0] ?? "")),
  );

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!invalidPaths.has(key) || STRUCTURAL_PROPS.has(key)) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function normalizeElementProps(
  type: SoneSpec["elements"][string]["type"],
  props: SoneSpec["elements"][string]["props"],
): SoneSpec["elements"][string]["props"] {
  let normalized: Record<string, unknown> = { ...(props as Record<string, unknown>) };

  if (type === "Text" || type === "TextDefault") {
    normalized = normalizeTextStyleAliases(normalized) as Record<string, unknown>;
  }

  if (normalized.boxShadow !== undefined) {
    normalized.boxShadow = normalizeShadowProp(normalized.boxShadow);
    if (normalized.boxShadow === undefined) delete normalized.boxShadow;
  }
  if (normalized.shadows !== undefined && !Array.isArray(normalized.shadows)) {
    const coerced = normalizeShadowProp(normalized.shadows);
    normalized.shadows = Array.isArray(coerced) ? coerced : coerced ? [coerced] : undefined;
    if (normalized.shadows === undefined) delete normalized.shadows;
  }

  if (Array.isArray(normalized.segments)) {
    normalized.segments = normalized.segments.map((segment) => {
      if (!isRecord(segment)) return segment;
      const style = normalizeTextStyleAliases(segment.style);
      return {
        ...segment,
        style: style as Record<string, unknown> | undefined,
      };
    });
  }

  if (type === "Table") {
    const spacingValue = normalized.spacing;
    if (Array.isArray(spacingValue)) {
      const flattened: number[] = [];
      flattenNumberValues(spacingValue, flattened);
      if (flattened.length > 0) {
        normalized.spacing = flattened;
      }
    }

    if (Array.isArray(normalized.rows)) {
      normalized.rows = normalized.rows.map((row) => {
        if (!isRecord(row) || !Array.isArray(row.cells)) return row;
        return {
          ...row,
          cells: row.cells.map((cell) => {
            if (!isRecord(cell)) return cell;
            return {
              ...cell,
              style: normalizeTextStyleAliases(cell.style),
            };
          }),
        };
      });
    }
  }

  if (type === "List" && Array.isArray(normalized.items)) {
    normalized.items = normalized.items.map((item) => {
      if (!isRecord(item)) return item;
      return {
        ...item,
        style: normalizeTextStyleAliases(item.style),
      };
    });
  }

  normalized = stripInvalidProps(type, normalized);

  return normalized as SoneSpec["elements"][string]["props"];
}

export function normalizeSpecStructure(spec: SoneSpec | null): SoneSpec | null {
  if (!spec || !isRecord(spec) || !isRecord(spec.elements)) {
    return spec;
  }

  const sourceElements = spec.elements as Record<string, unknown>;
  const normalizedElements: SoneSpec["elements"] = {};
  const createdIds = new Set<string>(Object.keys(sourceElements));

  function nextUniqueId(base: string) {
    let candidate = base;
    let index = 1;
    while (createdIds.has(candidate) || normalizedElements[candidate]) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    createdIds.add(candidate);
    return candidate;
  }

  function ingestElement(id: string, raw: unknown) {
    if (!isRecord(raw) || typeof raw.type !== "string") {
      return;
    }

    const props = isRecord(raw.props) ? raw.props : {};
    const rawChildren = Array.isArray(raw.children) ? raw.children : [];
    const children: string[] = [];
    const rawType = raw.type as SoneSpec["elements"][string]["type"];
    const normalizedProps = normalizeElementProps(
      rawType,
      props as SoneSpec["elements"][string]["props"],
    ) as Record<string, unknown>;

    rawChildren.forEach((child, index) => {
      if (typeof child === "string") {
        children.push(child);
        return;
      }

      if (!isRecord(child) || typeof child.type !== "string") {
        return;
      }

      const preferredId =
        typeof child.id === "string" && child.id.length > 0
          ? child.id
          : `${id}-child-${index + 1}`;

      if (sourceElements[preferredId] && !normalizedElements[preferredId]) {
        children.push(preferredId);
        return;
      }

      const childId = nextUniqueId(preferredId);
      ingestElement(childId, child);
      if (normalizedElements[childId]) {
        children.push(childId);
      }
    });

    const detachedText =
      rawType !== "Text" &&
      rawType !== "TextDefault" &&
      typeof normalizedProps.text === "string" &&
      normalizedProps.text.trim().length > 0
        ? normalizedProps.text
        : null;

    if (detachedText) {
      delete normalizedProps.text;
      const textChildId = nextUniqueId(`${id}-text`);
      normalizedElements[textChildId] = {
        type: "Text",
        props: { text: detachedText } as SoneSpec["elements"][string]["props"],
        children: [],
      };
      children.unshift(textChildId);
    }

    normalizedElements[id] = {
      type: rawType,
      props: normalizedProps as SoneSpec["elements"][string]["props"],
      children,
    };
  }

  for (const [id, rawElement] of Object.entries(sourceElements)) {
    ingestElement(id, rawElement);
  }

  const elementIds = Object.keys(normalizedElements);
  const canonicalIdMap = new Map<string, string[]>();
  for (const id of elementIds) {
    const canonical = canonicalizeElementId(id);
    const current = canonicalIdMap.get(canonical);
    if (current) {
      current.push(id);
    } else {
      canonicalIdMap.set(canonical, [id]);
    }
  }

  function resolveElementId(id: unknown): string {
    if (typeof id !== "string" || id.length === 0) {
      return "";
    }
    if (normalizedElements[id]) {
      return id;
    }
    const canonical = canonicalizeElementId(id);
    const candidates = canonicalIdMap.get(canonical);
    if (candidates?.length === 1) {
      return candidates[0] as string;
    }
    const prefixCandidates = elementIds.filter((elementId) => {
      const canonicalElementId = canonicalizeElementId(elementId);
      return (
        canonicalElementId.startsWith(canonical) ||
        canonical.startsWith(canonicalElementId)
      );
    });
    if (prefixCandidates.length === 1) {
      return prefixCandidates[0] as string;
    }
    return id;
  }

  for (const element of Object.values(normalizedElements)) {
    element.children = element.children.map(resolveElementId).filter((child) => child.length > 0);
  }

  let resolvedRoot = resolveElementId(spec.root);

  if (!resolvedRoot || !normalizedElements[resolvedRoot]) {
    if (normalizedElements.root) {
      resolvedRoot = "root";
    } else {
      const allIds = Object.keys(normalizedElements);
      const referencedIds = new Set<string>();
      for (const el of Object.values(normalizedElements)) {
        for (const child of el.children) {
          referencedIds.add(child);
        }
      }
      const topLevel = allIds.filter((id) => !referencedIds.has(id));
      resolvedRoot = topLevel.length === 1
        ? (topLevel[0] as string)
        : allIds[0] ?? "";
    }
  }

  const normalizedSpec: SoneSpec = {
    root: resolvedRoot,
    elements: normalizedElements,
  };
  return normalizedSpec;
}

/**
 * Recover root, flatten inline children, default missing `children`, reconcile id styles.
 * Returns null if the value cannot be treated as a spec (no `elements` object).
 */
export function prepareSpec(spec: unknown): SoneSpec | null {
  if (!spec || typeof spec !== "object") {
    return null;
  }
  const candidate = spec as Partial<SoneSpec>;
  if (!candidate.elements || typeof candidate.elements !== "object") {
    return null;
  }
  const recovered = recoverMissingRoot(candidate as SoneSpec);
  if (!recovered) {
    return null;
  }
  return normalizeSpecStructure(recovered) ?? recovered;
}
