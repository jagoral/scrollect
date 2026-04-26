import type { ComponentType, ReactNode } from "react";
import { useCssElement } from "react-native-css";
import {
  ActivityIndicator as RNActivityIndicator,
  type ActivityIndicatorProps as RNActivityIndicatorProps,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  Text as RNText,
  type TextProps as RNTextProps,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  View as RNView,
  type ViewProps as RNViewProps,
} from "react-native";

export type ViewProps = RNViewProps & { className?: string };

export const View = (props: ViewProps) => useCssElement(RNView, props, { className: "style" });
View.displayName = "CSS(View)";

export type TextProps = RNTextProps & { className?: string };

export const Text = (props: TextProps) => useCssElement(RNText, props, { className: "style" });
Text.displayName = "CSS(Text)";

// RN's full PressableProps `children` union (ReactNode | (state) => ReactNode)
// pushes the inferred generic past the TS type-instantiation limit, so the
// public surface narrows children to ReactNode. The internal cast is the
// matching workaround so useCssElement's generic inference picks the smaller
// type. Consumers needing the state-callback variant should use the raw
// `Pressable` from "react-native".
export type PressableProps = Omit<RNPressableProps, "children"> & {
  className?: string;
  children?: ReactNode;
};
const PressableComponent = RNPressable as ComponentType<PressableProps>;

export const Pressable = (props: PressableProps) =>
  useCssElement(PressableComponent, props, { className: "style" });
Pressable.displayName = "CSS(Pressable)";

export type TextInputProps = RNTextInputProps & { className?: string };

export const TextInput = (props: TextInputProps) =>
  useCssElement(RNTextInput, props, { className: "style" });
TextInput.displayName = "CSS(TextInput)";

export type ActivityIndicatorProps = RNActivityIndicatorProps & { className?: string };

export const ActivityIndicator = (props: ActivityIndicatorProps) =>
  useCssElement(RNActivityIndicator, props, { className: "style" });
ActivityIndicator.displayName = "CSS(ActivityIndicator)";
