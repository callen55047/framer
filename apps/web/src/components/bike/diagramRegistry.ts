import type { ComponentType } from "react";
import {
  AntiSquatAnnotation,
  BbDropAnnotation,
  BbHeightAnnotation,
  ChainstayAnnotation,
  HeadTubeAngleAnnotation,
  ReachAnnotation,
  SeatTubeAngleAnnotation,
  StackAnnotation,
  SuspensionTravelAnnotation,
  WheelSizeAnnotation,
  WheelbaseAnnotation,
} from "./annotations.js";
import type { AnnotationProps } from "./projection.js";

type AnnotationComponent = ComponentType<AnnotationProps>;

export const ANNOTATION_REGISTRY: Record<string, AnnotationComponent> = {
  reach: ReachAnnotation,
  stack: StackAnnotation,
  chainstay: ChainstayAnnotation,
  "bb-drop": BbDropAnnotation,
  "bb-height": BbHeightAnnotation,
  wheelbase: WheelbaseAnnotation,
  "wheel-size": WheelSizeAnnotation,
  "head-tube-angle": HeadTubeAngleAnnotation,
  "seat-tube-angle": SeatTubeAngleAnnotation,
  "anti-squat": AntiSquatAnnotation,
  "suspension-travel": SuspensionTravelAnnotation,
};

export const INTERACTIVE_DIAGRAMS = new Set(["suspension-travel", "anti-squat"]);
