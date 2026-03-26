import { useState } from "react";
import type { ColorMapping } from "../../shared/types";
import styles from "./TokenMap.module.css";

interface TokenMapProps {
  mappings: ColorMapping[];
  profileName?: string;
}

const DISPLAY_LIMIT = 3;

export function TokenMap({ mappings, profileName }: TokenMapProps) {
  const [expanded, setExpanded] = useState(false);
  if (mappings.length === 0) return null;

  const mapped = mappings.filter((m) => m.tokenName);
  const unknown = mappings.filter((m) => !m.tokenName);
  const total = mappings.length;
  const needsExpand = total > DISPLAY_LIMIT;
  const visible = expanded ? mappings : mappings.slice(0, DISPLAY_LIMIT);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>Token Coverage</span>
        <span className={`${styles.ratio} ${unknown.length === 0 ? styles.ratioAllMapped : ""}`}>
          {mapped.length}/{total}
        </span>
      </div>
      <p className={styles.description}>
        Colors found in your design. Mapped colors become CSS custom properties. Unmapped ones get hardcoded if not influenced by a skill or context.
      </p>

      {unknown.length > 0 && profileName && (
        <div className={styles.hint}>
          {unknown.length} color{unknown.length > 1 ? "s" : ""} not in &ldquo;{profileName}&rdquo;. AI might hardcode!
        </div>
      )}
      {!profileName && (
        <div className={styles.hint}>
          Create a Design System Profile to map colors to tokens.
        </div>
      )}

      <div className={styles.list}>
        {visible.map((m) => (
          <div key={m.hex} className={`${styles.row} ${m.tokenName ? styles.rowMapped : styles.rowUnknown}`}>
            <span className={styles.swatch} style={{ backgroundColor: m.hex }} />
            <span className={styles.hex}>{m.hex}</span>
            <span className={styles.arrow}>{"\u2192"}</span>
            {m.tokenName ? (
              <span className={styles.name}>{m.tokenName}</span>
            ) : (
              <span className={`${styles.name} ${styles.nameUnknown}`}>unknown</span>
            )}
            <span className={styles.count}>{m.count}×</span>
          </div>
        ))}
      </div>

      {needsExpand && (
        <button className={`btn-link ${styles.toggle}`} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show all ${total} colors`}
        </button>
      )}
    </div>
  );
}
