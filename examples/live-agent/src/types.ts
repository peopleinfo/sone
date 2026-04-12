import type { SoneNode } from "sone";

export type SoneComponentType =
  | "Column"
  | "Row"
  | "Grid"
  | "Text"
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
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignSelf?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly";
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  cornerRadius?: number | number[];
  opacity?: number;
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
