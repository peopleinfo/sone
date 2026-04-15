import type { SoneNode } from "sone";

export type SoneComponentType =
  | "Column"
  | "Row"
  | "Grid"
  | "Text"
  | "TextDefault"
  | "PageBreak"
  | "Photo"
  | "Table"
  | "List"
  | "Path"
  | "ClipGroup";

export type SonePrimitive = string | number | boolean | null;

export type SoneJsonValue =
  | SonePrimitive
  | SoneJsonValue[]
  | { [key: string]: SoneJsonValue };

export type FontValue = string | string[];

export interface TextSegmentStyle {
  size?: number;
  color?: string;
  font?: FontValue;
  weight?: string | number;
  style?: "normal" | "italic" | "oblique";
  letterSpacing?: number;
  wordSpacing?: number;
  lineHeight?: number;
  align?: "left" | "right" | "center" | "justify";
  underline?: number;
  underlineColor?: string | null;
  lineThrough?: number;
  lineThroughColor?: string | null;
  overline?: number;
  overlineColor?: string | null;
  highlightColor?: string | null;
  strokeColor?: string;
  strokeWidth?: number;
  offsetY?: number;
  textDir?: "ltr" | "rtl";
}

export interface TextSegment {
  text: string;
  style?: TextSegmentStyle;
}

export interface BaseStyleProps {
  tag?: string;
  display?: "none" | "flex" | "contents";
  direction?: "ltr" | "rtl";
  boxSizing?: "border-box" | "content-box";
  width?: number | "auto" | `${number}%`;
  height?: number | "auto" | `${number}%`;
  minWidth?: number | `${number}%`;
  minHeight?: number | `${number}%`;
  maxWidth?: number | `${number}%`;
  maxHeight?: number | `${number}%`;
  padding?: number | `${number}%`;
  paddingTop?: number | `${number}%`;
  paddingRight?: number | `${number}%`;
  paddingBottom?: number | `${number}%`;
  paddingLeft?: number | `${number}%`;
  paddingVertical?: number | `${number}%`;
  paddingHorizontal?: number | `${number}%`;
  margin?: number | "auto" | `${number}%`;
  marginTop?: number | "auto" | `${number}%`;
  marginRight?: number | "auto" | `${number}%`;
  marginBottom?: number | "auto" | `${number}%`;
  marginLeft?: number | "auto" | `${number}%`;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  flexGrow?: number;
  flexShrink?: number;
  flex?: number;
  flexBasis?: number | "auto" | `${number}%`;
  flexWrap?: "wrap" | "nowrap" | "wrap-reverse";
  alignContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "space-between"
    | "space-around"
    | "space-evenly";
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignSelf?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly";
  left?: number | `${number}%`;
  right?: number | `${number}%`;
  top?: number | `${number}%`;
  bottom?: number | `${number}%`;
  start?: number | `${number}%`;
  end?: number | `${number}%`;
  position?: "absolute" | "relative" | "static";
  overflow?: "visible" | "hidden" | "scroll";
  pageBreak?: "before" | "after" | "avoid";
  aspectRatio?: number;
  background?: string;
  font?: FontValue;
  borderColor?: string;
  borderWidth?: number;
  borderTop?: number | string;
  borderBottom?: number | string;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  cornerRadius?: number | number[];
  cornerSmoothing?: number;
  corner?: "cut" | "round";
  opacity?: number;
  rotation?: number;
  translateX?: number;
  translateY?: number;
  scale?: number | [number, number];
  shadows?: string[];
  boxShadow?: string | string[];
  filters?: string[];
  gridColumnStart?: number;
  gridColumnSpan?: number;
  gridRowStart?: number;
  gridRowSpan?: number;
}

export interface GridProps extends BaseStyleProps {
  columns?: Array<number | "auto" | `${number}fr`>;
  rows?: Array<number | "auto" | `${number}fr`>;
  autoRows?: Array<number | "auto" | `${number}fr`>;
  autoColumns?: Array<number | "auto" | `${number}fr`>;
}

export interface TextProps extends BaseStyleProps, TextSegmentStyle {
  segments?: TextSegment[];
  text?: string;
  nowrap?: boolean;
  maxLines?: number;
  lineBreak?: "greedy" | "knuth-plass";
  textOverflow?: "clip" | "ellipsis";
  textWrap?: "wrap" | "balance";
  hyphenation?: string | boolean;
  autofit?: boolean;
  baseDir?: "ltr" | "rtl" | "auto";
  indentSize?: number;
  hangingIndentSize?: number;
  tabStops?: number[];
  tabLeader?: string;
  orientation?: 0 | 90 | 180 | 270;
}

export interface TextDefaultProps extends TextSegmentStyle {
  nowrap?: boolean;
  maxLines?: number;
  lineBreak?: "greedy" | "knuth-plass";
  textOverflow?: "clip" | "ellipsis";
  lineHeight?: number;
  align?: "left" | "right" | "center" | "justify";
  indentSize?: number;
}

export interface PageBreakProps {
  mode?: "before" | "after" | "avoid";
}

export interface PhotoProps extends BaseStyleProps {
  src: string;
  preserveAspectRatio?: boolean;
  scaleType?: "cover" | "fill" | "contain";
  scaleAlignment?: number | "center" | "end" | "start";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  fill?: string;
  clipPath?: string;
}

export interface PathProps extends BaseStyleProps {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLineCap?: "butt" | "round" | "square";
  strokeLineJoin?: "bevel" | "miter" | "round";
  strokeDashArray?: number[];
  fill?: string;
  fillOpacity?: number;
  fillRule?: "evenodd" | "nonzero";
  scalePath?: number;
}

export interface TableCellSpec extends BaseStyleProps {
  segments?: TextSegment[];
  text?: string;
  /**
   * Convenience text style for a single-segment cell. Applied to the generated Text node.
   */
  style?: TextSegmentStyle;
  colspan?: number;
  rowspan?: number;
  header?: boolean;
}

export interface TableRowSpec {
  cells: TableCellSpec[];
}

export interface TableProps extends BaseStyleProps {
  rows: TableRowSpec[];
  spacing?: number[];
}

export interface ListItemSpec extends BaseStyleProps {
  segments?: TextSegment[];
  text?: string;
  /**
   * Convenience text style for a single-segment list item. Applied to the generated Text node.
   */
  style?: TextSegmentStyle;
}

export interface ListProps extends BaseStyleProps {
  items: ListItemSpec[];
  listStyle?: "disc" | "circle" | "square" | "decimal" | "dash" | "none" | string;
  markerGap?: number;
  markerOffset?: number;
  startIndex?: number;
}

export interface ClipGroupProps extends BaseStyleProps {
  clipPath: string;
}

export type SoneElementProps =
  | BaseStyleProps
  | GridProps
  | TextProps
  | TextDefaultProps
  | PageBreakProps
  | PhotoProps
  | PathProps
  | TableProps
  | ListProps
  | ClipGroupProps;

export interface SoneElement {
  type: SoneComponentType;
  props: SoneElementProps;
  children: string[];
}

export interface SoneSpec {
  root: string;
  elements: Record<string, SoneElement>;
}

export interface SoneSpecValidationIssue {
  path: string;
  message: string;
}

export interface SoneBuildResult {
  node: SoneNode;
  issues: SoneSpecValidationIssue[];
}

export interface SoneBuildOptions {
  maxDepth?: number;
  maxElements?: number;
  maxDimension?: number;
}
