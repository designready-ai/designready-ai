import { useState, useEffect, useCallback, useRef } from "react";
import { useSelection } from "./hooks/useSelection";
import { useScan } from "./hooks/useScan";
import { useProfiles } from "./hooks/useProfiles";
import { ScoreOverview } from "./components/ScoreOverview";
import { PromptExport } from "./components/PromptExport";
import { FixPanel } from "./components/FixPanel";
import { ProfileManager } from "./components/ProfileManager";
import { TokenMap } from "./components/TokenMap";
import { AtomicBadge, LevelIcon, LEVEL_CONFIG } from "./components/AtomicBadge";
import { BatchPanel } from "./components/BatchPanel";
import { AutoLayoutFix } from "./components/AutoLayoutFix";
import { useBatchScan } from "./hooks/useBatchScan";

type NavTab = "scan" | "setup";

export function App() {
  const { selectedNode, selectionName, selectionCount, resolvedFromComponentSet, componentSetName, refreshSelection } =
    useSelection();
  const { result, isScanning, error, scan, reset, variants } = useScan();
  const {
    result: batchResult,
    isScanning: isBatchScanning,
    error: batchError,
    scan: batchScan,
    reset: batchReset,
  } = useBatchScan();
  const { profiles, activeProfile, activeId, saveProfile, selectProfile, deleteProfile } = useProfiles();
  const lastNodeIdRef = useRef<string | null>(null);
  const lastNameRef = useRef("");
  const pendingRescanRef = useRef(false);
  const [activeTab, setActiveTab] = useState<NavTab>("scan");

  const isMultiSelect = selectionCount > 1;

  useEffect(() => {
    if (selectedNode?.id && selectedNode.id !== lastNodeIdRef.current) {
      lastNodeIdRef.current = selectedNode.id;
      reset();
      batchReset();
    } else if (pendingRescanRef.current && selectedNode) {
      pendingRescanRef.current = false;
      scan(selectedNode, activeProfile);
    }
    if (selectionName) {
      lastNameRef.current = selectionName;
    }
  }, [selectedNode, selectionName, reset, batchReset, scan, activeProfile]);

  const handleScan = () => {
    if (selectedNode) scan(selectedNode, activeProfile);
  };

  const handleBatchScan = () => batchScan(activeProfile);

  const handleSelectNode = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: "select-node", nodeId } }, "*");
  }, []);

  const handleFixesApplied = useCallback(() => {
    pendingRescanRef.current = true;
    refreshSelection();
  }, [refreshSelection]);

  const hasResult = !!result;

  // Resize plugin window: narrow when idle, wide when showing results
  useEffect(() => {
    const width = hasResult ? 768 : 480;
    parent.postMessage({ pluginMessage: { type: "resize", width, height: 768 } }, "*");
  }, [hasResult, batchResult]);

  const hasScanned = hasResult || !!batchResult;

  // State 1 + 2: No selection OR selected but not scanned → same layout, different content
  if (!hasScanned) {
    return (
      <div className="app app-dashboard">
        <header className="dashboard-topbar">
          <h1 className="dashboard-logo">
            DesignReady<span className="brand-dot">.ai</span>
          </h1>
        </header>
        <div className="dashboard-empty">
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" opacity="0.4" />
                <path d="M20 24h8M24 20v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              </svg>
            </div>
            <div className="empty-title">
              {/* eslint-disable-next-line react-hooks/refs -- intentional */}
              {selectedNode ? `Selected: ${selectionName || lastNameRef.current}` : "Select a frame"}
            </div>
            <div className="empty-hint">
              Score your Figma designs for AI-readiness, fix common issues, and generate structured code prompts. Each prompt trains a reusable skill for your design system.
            </div>
            {selectedNode && (
              <>
                {(error || batchError) && <p className="topbar-error">{error || batchError}</p>}
                <div className="scan-prompt-buttons">
                  <button className="btn-primary btn-scan-center" onClick={handleScan} disabled={isScanning || isBatchScanning}>
                    {isScanning ? "Scanning..." : "Scan Component"}
                  </button>
                  {isMultiSelect && (
                    <button className="btn-secondary btn-scan-center" onClick={handleBatchScan} disabled={isScanning || isBatchScanning}>
                      {isBatchScanning ? "Scanning..." : `Batch Scan (${selectionCount})`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <ResizeHandle />
      </div>
    );
  }

  // State 3: Scanned → full dashboard
  return (
    <div className="app app-dashboard">
      <header className="dashboard-topbar">
        <h1 className="dashboard-logo">
          DesignReady<span className="brand-dot">.ai</span>
        </h1>

        <div className="topbar-selection">
          <span className="topbar-component-label">{selectedNode ? "Selected" : "Last scan"}</span>
          {result?.atomicInfo && (
            <LevelIcon
              level={result.atomicInfo.level}
              color={LEVEL_CONFIG[result.atomicInfo.level]?.color ?? "#999"}
              size={14}
            />
          )}
          {/* eslint-disable-next-line react-hooks/refs -- intentional: show last known name */}
          <span
            className="topbar-component-name"
            style={result?.atomicInfo ? { color: LEVEL_CONFIG[result.atomicInfo.level]?.color } : undefined}
          >
            {selectionName || lastNameRef.current || "—"}
          </span>
          {resolvedFromComponentSet && (
            <span className="topbar-hint">from &ldquo;{componentSetName}&rdquo;</span>
          )}
        </div>

        <div className="topbar-actions">
          {result && selectedNode && (
            <button className="btn-secondary btn-sm" onClick={handleScan} disabled={isScanning}>
              {isScanning ? "..." : "Rescan"}
            </button>
          )}
        </div>
      </header>

      {/* Tab Bar — only after scan */}
      <nav className="dashboard-tabs">
        {([
          { id: "scan" as NavTab, label: "Scan" },
          { id: "setup" as NavTab, label: "Setup" },
        ]).map((tab) => (
          <button
            key={tab.id}
            className={`tab-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="dashboard-content">
        {activeTab === "scan" && (
          <div className="panel-scan">
            {hasResult ? (
              <div className="scan-layout">
              {/* Row 1: Score | Prompt — same height */}
              <div className="scan-grid">
                <ScoreOverview score={result.score} categories={result.categories} />
                <PromptExport
                  promptCompact={result.promptCompact ?? ""}
                  score={result.score}
                />

                {/* Row 2: Quick Fixes | TokenMap — same height */}
                <div className="quick-fixes-card">
                  <span className="quick-fixes-title">Quick Fixes</span>
                  <AutoLayoutFix hasSelection={!!selectedNode} onApplied={handleFixesApplied} embedded />
                  <FixPanel issues={result.issues} onFixesApplied={handleFixesApplied} embedded />
                </div>
                {result.colorMappings && result.colorMappings.length > 0 ? (
                  <TokenMap mappings={result.colorMappings} profileName={activeProfile?.name} />
                ) : <div />}
              </div>

              {/* Responsive Variants (full width, conditional) */}
              {(() => {
                const seen = new Set<number>();
                const unique = variants.filter((v) => {
                  if (seen.has(v.width)) return false;
                  seen.add(v.width);
                  return true;
                });
                if (unique.length <= 1) return null;
                return (
                  <div className="variants-section">
                    <span className="variants-label">Responsive Variants</span>
                    <div className="variants-badge">
                      {unique.map((v) => (
                        <span
                          key={v.nodeId}
                          className={`variant-chip ${v.nodeId === selectedNode?.id ? "active" : ""}`}
                        >
                          {v.viewportType === "desktop"
                            ? "Desktop"
                            : v.viewportType === "tablet"
                              ? "Tablet"
                              : v.viewportType === "mobile"
                                ? "Mobile"
                                : "?"}{" "}
                          {v.width}px
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Full-width: Atomic Badge + Export Plan */}
              {result.atomicInfo && <AtomicBadge info={result.atomicInfo} exportPlan={result.exportPlan} />}
              </div>
            ) : batchResult ? (
              <BatchPanel result={batchResult} onSelectNode={handleSelectNode} />
            ) : (
              <div className="panel-placeholder">
                Select a component in Figma and click Scan to analyze.
              </div>
            )}
          </div>
        )}

        {activeTab === "setup" && (
          <div className="panel-setup">
            <ProfileManager
              profiles={profiles}
              activeId={activeId}
              onSelect={selectProfile}
              onSave={saveProfile}
              onDelete={deleteProfile}
            />
          </div>
        )}
      </div>

      <ResizeHandle />
    </div>
  );
}

// ── Resize Handle ──

function ResizeHandle() {
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startW = document.documentElement.clientWidth;
      startH = document.documentElement.clientHeight;
      handle!.setPointerCapture(e.pointerId);
      handle!.addEventListener("pointermove", onPointerMove);
      handle!.addEventListener("pointerup", onPointerUp);
    }

    function onPointerMove(e: PointerEvent) {
      const w = startW + (e.clientX - startX);
      const h = startH + (e.clientY - startY);
      parent.postMessage({ pluginMessage: { type: "resize", width: w, height: h } }, "*");
    }

    function onPointerUp(e: PointerEvent) {
      handle!.releasePointerCapture(e.pointerId);
      handle!.removeEventListener("pointermove", onPointerMove);
      handle!.removeEventListener("pointerup", onPointerUp);
    }

    handle.addEventListener("pointerdown", onPointerDown);
    return () => handle.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={handleRef} className="resize-handle">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
