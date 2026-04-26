import { useCssElement } from "react-native-css";
import {
  Text as RNText,
  View as RNView,
  type TextProps as RNTextProps,
  type ViewProps as RNViewProps,
} from "react-native";

export type ViewProps = RNViewProps & { className?: string };

export const View = (props: ViewProps) => useCssElement(RNView, props, { className: "style" });
View.displayName = "CSS(View)";

export type TextProps = RNTextProps & { className?: string };

export const Text = (props: TextProps) => useCssElement(RNText, props, { className: "style" });
Text.displayName = "CSS(Text)";
