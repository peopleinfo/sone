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

function normalizeElementProps(
  type: SoneSpec["elements"][string]["type"],
  props: SoneSpec["elements"][string]["props"],
): SoneSpec["elements"][string]["props"] {
  let normalized: Record<string, unknown> = { ...(props as Record<string, unknown>) };

  if (type === "Text" || type === "TextDefault") {
    normalized = normalizeTextStyleAliases(normalized) as Record<string, unknown>;
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
    const candidates = canonicalIdMap.get(canonicalizeElementId(id));
    if (candidates?.length === 1) {
      return candidates[0] as string;
    }
    return id;
  }

  for (const element of Object.values(normalizedElements)) {
    element.children = element.children.map(resolveElementId).filter((child) => child.length > 0);
  }

  const resolvedRoot = resolveElementId(spec.root);

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
