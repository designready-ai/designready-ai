import { serializeNode } from "../serializer";
import type { PluginMessage, ViewportVariant } from "../../shared/types";

export function sendSelection(): void {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    const msg: PluginMessage = { type: "no-selection" };
    figma.ui.postMessage(msg);
    return;
  }

  let node = selection[0];
  let resolvedFromSet = false;

  // ComponentSet selected → resolve to Default variant
  if (node.type === "COMPONENT_SET") {
    const defaultVariant = findDefaultVariant(node as ComponentSetNode);
    if (defaultVariant) {
      resolvedFromSet = true;
      node = defaultVariant;
    }
  }

  const serialized = serializeNode(node);
  const msg: PluginMessage = {
    type: "selection-change",
    node: serialized,
    name: node.name,
    selectionCount: selection.length,
    resolvedFromComponentSet: resolvedFromSet,
    componentSetName: resolvedFromSet ? selection[0].name : undefined,
  };
  figma.ui.postMessage(msg);
}

function findDefaultVariant(componentSet: ComponentSetNode): ComponentNode | null {
  const children = componentSet.children as ComponentNode[];
  if (children.length === 0) return null;

  // Try to find a variant with "Default" in its properties
  for (const child of children) {
    if (child.type !== "COMPONENT") continue;
    const props = child.variantProperties;
    if (!props) continue;
    const values = Object.values(props).map((v) => v.toLowerCase());
    if (values.includes("default")) return child;
  }

  // Fallback: first child component
  const first = children.find((c) => c.type === "COMPONENT");
  return first ?? null;
}

function detectViewportType(width: number): "mobile" | "tablet" | "desktop" | "unknown" {
  if (width <= 428) return "mobile";
  if (width <= 1024) return "tablet";
  if (width >= 1200) return "desktop";
  return "unknown";
}

function extractBaseName(name: string): string {
  return name
    .replace(/\s*[/\-_]\s*(desktop|mobile|tablet|sm|md|lg|xl|xxl)\s*$/i, "")
    .replace(/\s*\(\s*(desktop|mobile|tablet|sm|md|lg|xl|xxl)\s*\)\s*$/i, "")
    .trim();
}

function findVariants(selectedNode: SceneNode, resolvedNode?: SceneNode): ViewportVariant[] {
  const page = figma.currentPage;
  const baseName = extractBaseName(selectedNode.name);
  const variants: ViewportVariant[] = [];

  for (const child of page.children) {
    if (child.type !== "FRAME" && child.type !== "COMPONENT" && child.type !== "COMPONENT_SET") continue;
    if (child.id === selectedNode.id) continue;

    const childBase = extractBaseName(child.name);
    if (childBase.toLowerCase() !== baseName.toLowerCase()) continue;

    // For sibling ComponentSets, resolve to their default variant for dimensions
    const siblingResolved = child.type === "COMPONENT_SET"
      ? findDefaultVariant(child as ComponentSetNode) ?? child
      : child;

    variants.push({
      nodeId: child.id,
      name: child.name,
      width: Math.round(siblingResolved.width),
      height: Math.round(siblingResolved.height),
      viewportType: detectViewportType(siblingResolved.width),
      node: serializeNode(siblingResolved),
    });
  }

  // Current selection: use resolved dimensions if available
  const current = resolvedNode ?? selectedNode;
  variants.unshift({
    nodeId: selectedNode.id,
    name: selectedNode.name,
    width: Math.round(current.width),
    height: Math.round(current.height),
    viewportType: detectViewportType(current.width),
  });

  return variants;
}

function resolveNode(node: SceneNode): SceneNode {
  if (node.type === "COMPONENT_SET") {
    return findDefaultVariant(node as ComponentSetNode) ?? node;
  }
  return node;
}

function sendBatchSelection(): void {
  const selection = figma.currentPage.selection;
  const nodes = selection.map((node) => serializeNode(resolveNode(node)));
  const msg: PluginMessage = { type: "batch-selection-result", nodes };
  figma.ui.postMessage(msg);
}

export function handleSelectionMessage(msg: PluginMessage): boolean {
  switch (msg.type) {
    case "request-selection":
      sendSelection();
      return true;
    case "request-batch-selection":
      sendBatchSelection();
      return true;
    case "request-variants": {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) return true;
      const original = selection[0];
      const resolved = resolveNode(original);
      // Use original for sibling matching (page-level), resolved for dimensions
      const variants = findVariants(original, resolved !== original ? resolved : undefined);
      const response: PluginMessage = { type: "variants-result", variants };
      figma.ui.postMessage(response);
      return true;
    }
    case "resize":
      figma.ui.resize(Math.max(320, Math.round(msg.width)), Math.max(400, Math.round(msg.height)));
      return true;
    case "select-node": {
      const target = figma.getNodeById(msg.nodeId);
      if (target && "type" in target && target.type !== "DOCUMENT" && target.type !== "PAGE") {
        const sceneNode = target as SceneNode;
        figma.currentPage.selection = [sceneNode];
        figma.viewport.scrollAndZoomIntoView([sceneNode]);
        if (msg.notify) {
          figma.notify(msg.notify, { timeout: 4000 });
        }
      }
      return true;
    }
    default:
      return false;
  }
}
