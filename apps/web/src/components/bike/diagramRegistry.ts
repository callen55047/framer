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
  WheelSizeAnnotation,
  WheelbaseAnnotation,
} from "./annotations.js";
import type { FramePoints, Point2D } from "@framer/schema/browser";

type AnnotationComponent = ComponentType<{
  pts: FramePoints;
  project: (p: Point2D) => Point2D;
}>;

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
};

export const INTERACTIVE_DIAGRAMS = new Set(["suspension-travel", "anti-squat"]);
