import type { PluginMessage } from "../../shared/types";

export async function discoverFigmaSources(): Promise<void> {
  const sources: { id: string; name: string; type: string; count: number; detail?: string }[] = [];

  // Local variables — grouped by collection
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();

    const collStats = new Map<string, { colors: number; floats: number; strings: number }>();
    for (const coll of collections) {
      collStats.set(coll.id, { colors: 0, floats: 0, strings: 0 });
    }
    for (const v of variables) {
      const c = collStats.get(v.variableCollectionId);
      if (!c) continue;
      if (v.resolvedType === "COLOR") c.colors++;
      else if (v.resolvedType === "FLOAT") c.floats++;
      else if (v.resolvedType === "STRING") c.strings++;
    }

    for (const coll of collections) {
      const c = collStats.get(coll.id)!;
      const total = c.colors + c.floats + c.strings;
      if (total === 0) continue;
      const parts: string[] = [];
      if (c.colors > 0) parts.push(`${c.colors} colors`);
      if (c.floats > 0) parts.push(`${c.floats} numbers`);
      if (c.strings > 0) parts.push(`${c.strings} strings`);
      sources.push({ id: `vars:${coll.id}`, name: coll.name, type: "local-variables", count: total, detail: parts.join(", ") });
    }
  } catch (e) {
    console.warn("Could not read variables:", e);
  }

  // Local paint styles
  try {
    const paintStyles = await figma.getLocalPaintStylesAsync();
    if (paintStyles.length > 0) {
      sources.push({ id: "styles:paint", name: "Color Styles", type: "local-styles", count: paintStyles.length, detail: `${paintStyles.length} paint styles` });
    }
  } catch (e) {
    console.warn("Could not read paint styles:", e);
  }

  // Local components — always offer, skip expensive scan (count happens on import)
  sources.push({ id: "local:components", name: "Local Components", type: "local-components", count: 0, detail: "Components in this file" });

  // Team library — skip entirely during discovery (often hangs)
  // Users can still import local variables, styles, and components

  const msg: PluginMessage = { type: "figma-sources-result", sources };
  figma.ui.postMessage(msg);
}

export async function importFigmaTokens(sourceIds: string[]): Promise<void> {
  const tokens: Record<string, string> = {};
  const componentNames: string[] = [];
  const selectedSet = new Set(sourceIds);

  // Import variable collections (batch)
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collModeMap = new Map<string, string>();
    for (const coll of collections) {
      if (selectedSet.has(`vars:${coll.id}`) && coll.modes.length > 0) {
        collModeMap.set(coll.id, coll.modes[0].modeId);
      }
    }

    if (collModeMap.size > 0) {
      const variables = await figma.variables.getLocalVariablesAsync();
      for (const v of variables) {
        const modeId = collModeMap.get(v.variableCollectionId);
        if (!modeId) continue;
        const value = v.valuesByMode[modeId];
        if (value === undefined) continue;
        const name = v.name.replace(/\//g, "-").toLowerCase();

        if (v.resolvedType === "COLOR" && typeof value === "object" && "r" in value) {
          const c = value as { r: number; g: number; b: number; a: number };
          const hex = `#${Math.round(c.r * 255).toString(16).padStart(2, "0")}${Math.round(c.g * 255).toString(16).padStart(2, "0")}${Math.round(c.b * 255).toString(16).padStart(2, "0")}`;
          tokens[name] = hex;
        } else if (v.resolvedType === "FLOAT" && typeof value === "number") {
          tokens[name] = `${value}px`;
        } else if (v.resolvedType === "STRING" && typeof value === "string") {
          tokens[name] = value;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read variables:", e);
  }

  // Import paint styles
  if (selectedSet.has("styles:paint")) {
    try {
      const paintStyles = await figma.getLocalPaintStylesAsync();
      for (const style of paintStyles) {
        if (style.paints.length > 0 && style.paints[0].type === "SOLID") {
          const paint = style.paints[0] as SolidPaint;
          const name = style.name.replace(/\//g, "-").toLowerCase();
          const hex = `#${Math.round(paint.color.r * 255).toString(16).padStart(2, "0")}${Math.round(paint.color.g * 255).toString(16).padStart(2, "0")}${Math.round(paint.color.b * 255).toString(16).padStart(2, "0")}`;
          tokens[name] = hex;
        }
      }
    } catch (e) {
      console.warn("Could not read paint styles:", e);
    }
  }

  // Import local components — scan current page only (full doc scan freezes large files)
  if (selectedSet.has("local:components")) {
    try {
      const componentNodes = figma.currentPage.findAllWithCriteria({ types: ["COMPONENT"] });
      const seen = new Set<string>();
      for (const comp of componentNodes) {
        if (!seen.has(comp.name)) {
          seen.add(comp.name);
          componentNames.push(comp.name);
        }
      }
    } catch (e) {
      console.warn("Could not read components:", e);
    }
  }

  const fileName = figma.root.name;
  const msg: PluginMessage = { type: "figma-tokens-result", tokens, components: componentNames, fileName };
  figma.ui.postMessage(msg);
}

export async function handleFigmaImportMessage(msg: PluginMessage): Promise<boolean> {
  switch (msg.type) {
    case "get-figma-sources":
      try {
        await discoverFigmaSources();
      } catch (e) {
        console.warn("discoverFigmaSources failed:", e);
        figma.ui.postMessage({ type: "figma-sources-result", sources: [] });
      }
      return true;
    case "import-figma-tokens":
      try {
        await importFigmaTokens(msg.sourceIds);
      } catch (e) {
        console.warn("importFigmaTokens failed:", e);
        figma.ui.postMessage({ type: "figma-tokens-result", tokens: {}, components: [], fileName: figma.root.name });
      }
      return true;
    default:
      return false;
  }
}
