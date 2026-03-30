"use client";

import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeDesign, type ThemeMode } from "@/contexts/ThemeContext";
import type { PreferencesSectionProps } from "./types";
import styles from "../SettingsPage.module.css";
import themeStyles from "./ThemeSection.module.css";

type ThemeSectionProps = PreferencesSectionProps & {
  onThemeDraftChange?: () => void;
};

/* -------------------------------------------------------
 * THEME REGISTRY
 * To add a new design:
 * 1. Add an entry here
 * 2. Add a [data-design="..."][data-theme="dark|light"] block in globals.css
 * 3. Add the key to ThemeDesign type in ThemeContext.tsx
 * ------------------------------------------------------- */
const THEME_DESIGNS: Array<{
  id: ThemeDesign;
  label: string;
  description: string;
  darkPreview: { bg: string; surface: string; accent: string; text: string; border: string; glow: string };
  lightPreview: { bg: string; surface: string; accent: string; text: string; border: string; glow: string };
}> = [
  {
    id: "futuristic",
    label: "Futuristic",
    description: "Cyberpunk neon — vivid glows and space-age gradients",
    darkPreview:  { bg: "#0b1220", surface: "#101828", accent: "#00ffff", text: "#f3f6fb", border: "#314158", glow: "rgba(0,255,255,0.35)" },
    lightPreview: { bg: "#edf2ff", surface: "#ffffff", accent: "#0891b2", text: "#1a1a2e", border: "#e2e8f0", glow: "rgba(8,145,178,0.18)" },
  },
  {
    id: "professional",
    label: "Professional",
    description: "Clean and minimal — focused on clarity and business use",
    darkPreview:  { bg: "#111418", surface: "#1a1e24", accent: "#3b82f6", text: "#e2e6ec", border: "#2e343c", glow: "rgba(59,130,246,0.12)" },
    lightPreview: { bg: "#f8fafc", surface: "#ffffff", accent: "#2563eb", text: "#1e2530", border: "#e2e8f0", glow: "rgba(37,99,235,0.08)" },
  },
  {
    id: "cool",
    label: "Aurora",
    description: "Violet-teal aurora — dreamy depth with soft luminescence",
    darkPreview:  { bg: "#0e0f1a", surface: "#161728", accent: "#7c3aed", text: "#eaecff", border: "#2c2e50", glow: "rgba(124,58,237,0.35)" },
    lightPreview: { bg: "#f5f6ff", surface: "#ffffff", accent: "#7c3aed", text: "#1a1830", border: "#d8d0f0", glow: "rgba(124,58,237,0.15)" },
  },
];

function ThemePreviewCard({
  preview,
  label,
  isSelected,
}: {
  preview: { bg: string; surface: string; accent: string; text: string; border: string; glow: string };
  label: string;
  isSelected: boolean;
}) {
  return (
    <div
      className={themeStyles.previewCard}
      style={{
        background: preview.bg,
        border: `2px solid ${isSelected ? preview.accent : preview.border}`,
        boxShadow: isSelected ? `0 0 0 1px ${preview.accent}, 0 4px 16px ${preview.glow}` : "none",
      }}
    >
      {/* Mock nav bar */}
      <div className={themeStyles.previewNav} style={{ background: preview.surface, borderBottom: `1px solid ${preview.border}` }}>
        <div className={themeStyles.previewNavDot} style={{ background: preview.accent }} />
        <div className={themeStyles.previewNavLine} style={{ background: preview.border }} />
        <div className={themeStyles.previewNavLine} style={{ background: preview.border }} />
      </div>
      {/* Mock content */}
      <div className={themeStyles.previewBody}>
        <div className={themeStyles.previewCard2} style={{ background: preview.surface, border: `1px solid ${preview.border}` }}>
          <div className={themeStyles.previewAccentBar} style={{ background: preview.accent }} />
          <div className={themeStyles.previewTextLine} style={{ background: preview.text, opacity: 0.7 }} />
          <div className={themeStyles.previewTextLine} style={{ background: preview.text, opacity: 0.35, width: "60%" }} />
        </div>
        <div className={themeStyles.previewBtn} style={{ background: preview.accent }}>
          <div className={themeStyles.previewBtnLine} />
        </div>
      </div>
      <div className={themeStyles.previewLabel} style={{ color: preview.text, opacity: 0.8 }}>
        {label}
      </div>
      {isSelected && (
        <div className={themeStyles.previewCheck} style={{ background: preview.accent, color: preview.bg }}>✓</div>
      )}
    </div>
  );
}

export function ThemeSection({ preferences, setPreferences, onThemeDraftChange }: ThemeSectionProps) {
  const { design, mode, setDesign, setMode } = useTheme();

  const handleDesignChange = (newDesign: ThemeDesign) => {
    onThemeDraftChange?.();
    setDesign(newDesign);
    setPreferences((prev) => ({ ...prev, themeDesign: newDesign }));
  };

  const handleModeChange = (newMode: ThemeMode) => {
    onThemeDraftChange?.();
    setMode(newMode);
    setPreferences((prev) => ({ ...prev, themeMode: newMode }));
  };

  return (
    <div className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.cardIcon}>
            <Palette size={18} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Theme & Appearance</h2>
            <p className={styles.cardDescription}>Choose a design and color mode — changes apply instantly</p>
          </div>
        </div>
      </div>

      {/* Design Picker */}
      <div className={themeStyles.section}>
        <h3 className={themeStyles.sectionLabel}>Design</h3>
        <div className={themeStyles.designGrid}>
          {THEME_DESIGNS.map((themeDesign) => {
            const isSelected = design === themeDesign.id;
            const preview = mode === "light" ? themeDesign.lightPreview : themeDesign.darkPreview;
            return (
              <button
                key={themeDesign.id}
                className={`${themeStyles.designOption} ${isSelected ? themeStyles.designOptionSelected : ""}`}
                onClick={() => handleDesignChange(themeDesign.id)}
                type="button"
                aria-pressed={isSelected}
              >
                <ThemePreviewCard preview={preview} label={themeDesign.label} isSelected={isSelected} />
                <div className={themeStyles.designMeta}>
                  <span className={themeStyles.designLabel}>{themeDesign.label}</span>
                  <span className={themeStyles.designDescription}>{themeDesign.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Picker */}
      <div className={themeStyles.section}>
        <h3 className={themeStyles.sectionLabel}>Color Mode</h3>
        <div className={themeStyles.modeRow}>
          {(["dark", "light"] as ThemeMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`${themeStyles.modeBtn} ${mode === m ? themeStyles.modeBtnActive : ""}`}
              onClick={() => handleModeChange(m)}
              aria-pressed={mode === m}
            >
              {m === "dark" ? <Moon size={15} /> : <Sun size={15} />}
              <span>{m === "dark" ? "Dark" : "Light"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Other Preferences */}
      <div className={themeStyles.section}>
        <h3 className={themeStyles.sectionLabel}>Display</h3>

        <div className={styles.selectGroup}>
          <div className={styles.selectWrapper}>
            <label className={styles.selectLabel}>Default View</label>
            <select
              value={preferences.defaultView}
              onChange={(event) => setPreferences((prev) => ({ ...prev, defaultView: event.target.value }))}
              className={styles.selectInput}
            >
              <option value="trading">Trading</option>
              <option value="portfolio">Portfolio</option>
              <option value="analytics">Analytics</option>
            </select>
          </div>
        </div>

        <label className={styles.toggleItem}>
          <span className={styles.toggleLabel}>Show balance in navigation</span>
          <div className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={preferences.privacy.showBalanceInNav}
              onChange={(event) =>
                setPreferences((prev) => ({
                  ...prev,
                  privacy: { ...prev.privacy, showBalanceInNav: event.target.checked },
                }))
              }
              className={styles.toggleInput}
            />
            <span className={styles.toggleSlider} />
          </div>
        </label>
      </div>
    </div>
  );
}
