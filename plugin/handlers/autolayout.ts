import type { PluginMessage, AutoLayoutCandidate, AutoLayoutSkipped } from "../../shared/types";
import { sendSelection } from "./selection";

// ── Analysis ──

interface ChildInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  node: SceneNode;
}

function getVisibleChildren(frame: FrameNode | ComponentNode | GroupNode): ChildInfo[] {
  return frame.children
    .filter((c) => c.visible && "x" in c && "width" in c)
    .map((c) => ({
      x: Math.round(c.x),
      y: Math.round(c.y),
      width: Math.round(c.width),
      height: Math.round(c.height),
      node: c as SceneNode,
    }));
}

function hasOverlap(children: ChildInfo[]): boolean {
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];
      const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
      const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
      if (overlapX && overlapY) return true;
    }
  }
  return false;
}

function detectDirection(children: ChildInfo[]): "HORIZONTAL" | "VERTICAL" | null {
  if (children.length < 2) return null;

  const sorted = [...children];
  const sortedByY = sorted.sort((a, b) => a.y - b.y);
  const sortedByX = [...children].sort((a, b) => a.x - b.x);

  // Check vertical: are children stacked top to bottom?
  let isVertical = true;
  for (let i = 1; i < sortedByY.length; i++) {
    const prev = sortedByY[i - 1];
    const curr = sortedByY[i];
    // Current top should be >= previous bottom (allow small overlap tolerance)
    if (curr.y < prev.y + prev.height - 2) {
      isVertical = false;
      break;
    }
  }

  // Check horizontal: are children laid out left to right?
  let isHorizontal = true;
  for (let i = 1; i < sortedByX.length; i++) {
    const prev = sortedByX[i - 1];
    const curr = sortedByX[i];
    if (curr.x < prev.x + prev.width - 2) {
      isHorizontal = false;
      break;
    }
  }

  if (isVertical && !isHorizontal) return "VERTICAL";
  if (isHorizontal && !isVertical) return "HORIZONTAL";

  // Both or neither — use spread
  const xSpread = Math.max(...children.map((c) => c.x + c.width)) - Math.min(...children.map((c) => c.x));
  const ySpread = Math.max(...children.map((c) => c.y + c.height)) - Math.min(...children.map((c) => c.y));

  if (ySpread > xSpread * 1.2) return "VERTICAL";
  if (xSpread > ySpread * 1.2) return "HORIZONTAL";

  return null; // ambiguous
}

function calculateGap(children: ChildInfo[], direction: "HORIZONTAL" | "VERTICAL"): number {
  const sorted =
    direction === "HORIZONTAL"
      ? [...children].sort((a, b) => a.x - b.x)
      : [...children].sort((a, b) => a.y - b.y);

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap =
      direction === "HORIZONTAL"
        ? curr.x - (prev.x + prev.width)
        : curr.y - (prev.y + prev.height);
    gaps.push(Math.max(0, Math.round(gap)));
  }

  if (gaps.length === 0) return 0;

  // Use median gap for robustness
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  return sortedGaps[Math.floor(sortedGaps.length / 2)];
}

function calculatePadding(
  frame: { width: number; height: number },
  children: ChildInfo[],
): { top: number; right: number; bottom: number; left: number } {
  const minX = Math.min(...children.map((c) => c.x));
  const minY = Math.min(...children.map((c) => c.y));
  const maxX = Math.max(...children.map((c) => c.x + c.width));
  const maxY = Math.max(...children.map((c) => c.y + c.height));

  return {
    top: Math.max(0, Math.round(minY)),
    right: Math.max(0, Math.round(frame.width - maxX)),
    bottom: Math.max(0, Math.round(frame.height - maxY)),
    left: Math.max(0, Math.round(minX)),
  };
}

function detectAlignment(
  children: ChildInfo[],
  direction: "HORIZONTAL" | "VERTICAL",
  frameSize: number,
  padding: { top: number; right: number; bottom: number; left: number },
): "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" {
  if (children.length < 2) return "MIN";

  // Check for space-between: first child at start, last at end
  if (direction === "HORIZONTAL") {
    const sorted = [...children].sort((a, b) => a.x - b.x);
    const firstAtStart = sorted[0].x <= padding.left + 2;
    const lastAtEnd = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width >= frameSize - padding.right - 2;
    if (firstAtStart && lastAtEnd && children.length >= 3) return "SPACE_BETWEEN";
  } else {
    const sorted = [...children].sort((a, b) => a.y - b.y);
    const firstAtStart = sorted[0].y <= padding.top + 2;
    const lastAtEnd = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height >= frameSize - padding.bottom - 2;
    if (firstAtStart && lastAtEnd && children.length >= 3) return "SPACE_BETWEEN";
  }

  // Check cross-axis alignment
  const crossPositions = direction === "HORIZONTAL"
    ? children.map((c) => c.y)
    : children.map((c) => c.x);

  const crossSizes = direction === "HORIZONTAL"
    ? children.map((c) => c.height)
    : children.map((c) => c.width);

  const containerCross = direction === "HORIZONTAL"
    ? frameSize  // actually need height but this is simplified
    : frameSize;

  // All same cross position → MIN alignment
  const allSameStart = crossPositions.every((p) => Math.abs(p - crossPositions[0]) <= 2);
  if (allSameStart) return "MIN";

  // Check if centered
  const contentCross = Math.max(...crossPositions.map((p, i) => p + crossSizes[i])) - Math.min(...crossPositions);
  const centerOffset = (containerCross - contentCross) / 2;
  const allCentered = crossPositions.every((p) => {
    return Math.abs(p - centerOffset) <= 4;
  });
  if (allCentered) return "CENTER";

  return "MIN";
}

function calculateConfidence(
  children: ChildInfo[],
  direction: "HORIZONTAL" | "VERTICAL",
  gap: number,
): number {
  let confidence = 0.7; // base

  // Consistent gap → higher confidence
  const sorted =
    direction === "HORIZONTAL"
      ? [...children].sort((a, b) => a.x - b.x)
      : [...children].sort((a, b) => a.y - b.y);

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const g =
      direction === "HORIZONTAL"
        ? curr.x - (prev.x + prev.width)
        : curr.y - (prev.y + prev.height);
    gaps.push(Math.round(g));
  }

  if (gaps.length > 0) {
    const variance = gaps.reduce((sum, g) => sum + Math.abs(g - gap), 0) / gaps.length;
    if (variance <= 1) confidence += 0.2; // very consistent
    else if (variance <= 4) confidence += 0.1;
    else confidence -= 0.1; // inconsistent
  }

  // More children → slightly higher confidence (clearer pattern)
  if (children.length >= 3) confidence += 0.05;

  // Gap on 4px grid → bonus
  if (gap % 4 === 0) confidence += 0.05;

  return Math.min(1, Math.max(0, Math.round(confidence * 100) / 100));
}

function analyzeFrame(
  node: SceneNode,
  depth: number,
  candidates: AutoLayoutCandidate[],
  skipped: AutoLayoutSkipped[],
): void {
  // Only analyze frames without auto layout
  const isFrame = node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET";
  if (!isFrame) return;

  const frame = node as FrameNode;

  // Recurse into children first (bottom-up)
  if ("children" in frame) {
    for (const child of frame.children) {
      analyzeFrame(child, depth + 1, candidates, skipped);
    }
  }

  // Skip if already has auto layout
  if (frame.layoutMode && frame.layoutMode !== "NONE") return;

  // Skip instances (can't modify internals)
  if (node.type === "INSTANCE") return;

  const children = getVisibleChildren(frame);

  // Skip single or no children
  if (children.length < 2) {
    if (children.length === 1) {
      skipped.push({
        nodeId: node.id,
        name: node.name,
        reason: "Only 1 visible child — no layout pattern to detect",
      });
    }
    return;
  }

  // Skip overlapping children
  if (hasOverlap(children)) {
    skipped.push({
      nodeId: node.id,
      name: node.name,
      reason: "Children overlap — likely decorative positioning",
    });
    return;
  }

  // Skip icon/illustration frames: all children are shapes (no frames, text, or instances)
  const SHAPE_TYPES = new Set(["VECTOR", "LINE", "ELLIPSE", "RECTANGLE", "STAR", "POLYGON", "BOOLEAN_OPERATION"]);
  const allShapes = children.every((c) => SHAPE_TYPES.has(c.node.type));
  if (allShapes) {
    skipped.push({
      nodeId: node.id,
      name: node.name,
      reason: "All children are shapes — likely an icon or illustration",
    });
    return;
  }

  // Detect direction
  const direction = detectDirection(children);
  if (!direction) {
    skipped.push({
      nodeId: node.id,
      name: node.name,
      reason: "Ambiguous layout — can't determine row vs column",
    });
    return;
  }

  const gap = calculateGap(children, direction);
  const padding = calculatePadding(
    { width: Math.round(frame.width), height: Math.round(frame.height) },
    children,
  );
  const frameSize = direction === "HORIZONTAL" ? Math.round(frame.height) : Math.round(frame.width);
  const alignment = detectAlignment(children, direction, frameSize, padding);
  const confidence = calculateConfidence(children, direction, gap);

  // Only include if confidence is high enough
  if (confidence < 0.6) {
    skipped.push({
      nodeId: node.id,
      name: node.name,
      reason: `Low confidence (${Math.round(confidence * 100)}%) — inconsistent spacing`,
    });
    return;
  }

  candidates.push({
    nodeId: node.id,
    name: node.name,
    depth,
    direction,
    gap,
    padding,
    alignment,
    childCount: children.length,
    confidence,
  });
}

// ── Apply ──

function applyAutoLayout(nodeIds: Set<string>): number {
  let count = 0;

  // Collect all candidate nodes with their analysis
  const nodesToConvert: { node: FrameNode; depth: number }[] = [];
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return 0;

  function collectNodes(node: SceneNode, depth: number) {
    if (nodeIds.has(node.id) && (node.type === "FRAME" || node.type === "COMPONENT")) {
      nodesToConvert.push({ node: node as FrameNode, depth });
    }
    if ("children" in node) {
      for (const child of (node as FrameNode).children) {
        collectNodes(child, depth + 1);
      }
    }
  }

  collectNodes(selection[0], 0);

  // Sort: deepest first (bottom-up)
  nodesToConvert.sort((a, b) => b.depth - a.depth);

  for (const { node: frame } of nodesToConvert) {
    const children = getVisibleChildren(frame);
    if (children.length < 2) continue;

    const direction = detectDirection(children);
    if (!direction) continue;

    const gap = calculateGap(children, direction);
    const padding = calculatePadding(
      { width: Math.round(frame.width), height: Math.round(frame.height) },
      children,
    );
    const frameSize = direction === "HORIZONTAL" ? Math.round(frame.height) : Math.round(frame.width);
    const alignment = detectAlignment(children, direction, frameSize, padding);

    // Apply Auto Layout
    frame.layoutMode = direction;
    frame.itemSpacing = gap;
    frame.paddingTop = padding.top;
    frame.paddingRight = padding.right;
    frame.paddingBottom = padding.bottom;
    frame.paddingLeft = padding.left;

    // Primary axis alignment
    if (alignment === "SPACE_BETWEEN") {
      frame.primaryAxisAlignItems = "SPACE_BETWEEN";
    } else {
      frame.primaryAxisAlignItems = alignment;
    }

    // Counter axis: center if children are centered, else MIN
    frame.counterAxisAlignItems = "MIN";
    const crossPositions = direction === "HORIZONTAL"
      ? children.map((c) => c.y)
      : children.map((c) => c.x);
    const allSameCross = crossPositions.every((p) => Math.abs(p - crossPositions[0]) <= 2);
    if (!allSameCross) {
      // Check if centered
      const crossSizes = direction === "HORIZONTAL"
        ? children.map((c) => c.height)
        : children.map((c) => c.width);
      const maxCross = Math.max(...crossSizes);
      const allCentered = children.every((c, i) => {
        const expectedCenter = (maxCross - crossSizes[i]) / 2;
        return Math.abs(crossPositions[i] - crossPositions[0] - expectedCenter) <= 4;
      });
      if (allCentered) {
        frame.counterAxisAlignItems = "CENTER";
      }
    }

    // Set frame sizing to hug contents
    frame.layoutSizingHorizontal = "HUG";
    frame.layoutSizingVertical = "HUG";

    // Preserve original frame size if it was larger than hug
    const origWidth = Math.round(frame.width);
    const origHeight = Math.round(frame.height);

    // Set children sizing: FIXED by default (preserve their sizes)
    for (const child of frame.children) {
      if ("layoutSizingHorizontal" in child) {
        (child as FrameNode).layoutSizingHorizontal = "FIXED";
        (child as FrameNode).layoutSizingVertical = "FIXED";
      }
    }

    // If frame was a specific size, restore it with FIXED
    if (frame.layoutMode === "HORIZONTAL" && origWidth > 0) {
      frame.layoutSizingHorizontal = "FIXED";
      frame.resize(origWidth, origHeight);
    } else if (frame.layoutMode === "VERTICAL" && origHeight > 0) {
      frame.layoutSizingVertical = "FIXED";
      frame.resize(origWidth, origHeight);
    }

    count++;
  }

  return count;
}

// ── Message Handler ──

export async function handleAutoLayoutMessage(msg: PluginMessage): Promise<boolean> {
  switch (msg.type) {
    case "request-autolayout-analysis": {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) return true;

      const candidates: AutoLayoutCandidate[] = [];
      const skipped: AutoLayoutSkipped[] = [];
      analyzeFrame(selection[0], 0, candidates, skipped);

      // Sort candidates by depth (deepest first for display)
      candidates.sort((a, b) => b.depth - a.depth);

      const response: PluginMessage = { type: "autolayout-analysis-result", candidates, skipped };
      figma.ui.postMessage(response);
      return true;
    }
    case "apply-autolayout": {
      const nodeIdSet = new Set(msg.nodeIds);
      const count = applyAutoLayout(nodeIdSet);
      const response: PluginMessage = { type: "autolayout-applied", count };
      figma.ui.postMessage(response);
      sendSelection();
      return true;
    }
    default:
      return false;
  }
}
