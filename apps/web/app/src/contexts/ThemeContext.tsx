"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";


export type ThemeMode = "light" | "dark";
export type ThemeDesign = "futuristic" | "professional" | "cool";

type ThemeContextType = {
  mode: ThemeMode;
  design: ThemeDesign;
  setMode: (mode: ThemeMode) => void;
  setDesign: (design: ThemeDesign) => void;
  toggleMode: () => void;
  /** Call this after loading user preferences to hydrate theme from backend */
  initFromPreferences: (design: ThemeDesign, mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_MODE_KEY = "themeMode";
const THEME_DESIGN_KEY = "themeDesign";
const DEFAULT_MODE: ThemeMode = "dark";
const DEFAULT_DESIGN: ThemeDesign = "futuristic";

function applyThemeAttrs(design: ThemeDesign, mode: ThemeMode) {
  document.documentElement.setAttribute("data-design", design);
  document.documentElement.setAttribute("data-theme", mode);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [design, setDesignState] = useState<ThemeDesign>(DEFAULT_DESIGN);

  // Load saved theme on mount
  useEffect(() => {
    const savedMode = (localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null) || DEFAULT_MODE;
    const savedDesign = (localStorage.getItem(THEME_DESIGN_KEY) as ThemeDesign | null) || DEFAULT_DESIGN;
    setModeState(savedMode);
    setDesignState(savedDesign);
    applyThemeAttrs(savedDesign, savedMode);
  }, []);

  // Apply theme + save to localStorage
  useEffect(() => {
    applyThemeAttrs(design, mode);
    localStorage.setItem(THEME_MODE_KEY, mode);
    localStorage.setItem(THEME_DESIGN_KEY, design);
  }, [mode, design]);

  const setMode = (newMode: ThemeMode) => setModeState(newMode);
  const setDesign = (newDesign: ThemeDesign) => setDesignState(newDesign);
  const toggleMode = () => setModeState((prev) => (prev === "light" ? "dark" : "light"));
  const initFromPreferences = (newDesign: ThemeDesign, newMode: ThemeMode) => {
    setDesignState(newDesign);
    setModeState(newMode);
  };

  return (
    <ThemeContext.Provider value={{ mode, design, setMode, setDesign, toggleMode, initFromPreferences }}>
      {children}
    </ThemeContext.Provider>
  );
}


export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export default ThemeProvider;