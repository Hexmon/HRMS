import * as React from "react";
import { flushSync } from "react-dom";
import { ThemeContext } from "@/lib/theme";
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  THEME_SYSTEM_QUERY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme-utils";

type ViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

function shouldReduceMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function supportsViewTransition(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as ViewTransitionDocument).startViewTransition === "function"
  );
}

async function runThemeTransition({
  sourceElement,
  commit,
}: {
  sourceElement?: HTMLElement | null;
  commit: () => void;
}) {
  if (
    typeof window === "undefined" ||
    !sourceElement ||
    shouldReduceMotion() ||
    !supportsViewTransition()
  ) {
    commit();
    return;
  }

  const rect = sourceElement.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const root = document.documentElement;

  root.style.setProperty("--theme-vt-x", `${x}px`);
  root.style.setProperty("--theme-vt-y", `${y}px`);
  root.style.setProperty("--theme-vt-r", `${endRadius}px`);
  root.classList.add("theme-transitioning");

  const transition = (document as ViewTransitionDocument).startViewTransition?.(() => {
    flushSync(commit);
  });

  if (!transition) {
    root.classList.remove("theme-transitioning");
    commit();
    return;
  }

  try {
    await transition.ready;
    root.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 680,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
    await transition.finished;
  } finally {
    root.classList.remove("theme-transitioning");
    root.style.removeProperty("--theme-vt-x");
    root.style.removeProperty("--theme-vt-y");
    root.style.removeProperty("--theme-vt-r");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference()),
  );

  const commitPreference = React.useCallback((nextPreference: ThemePreference) => {
    const nextResolved = applyTheme(nextPreference);
    setPreferenceState(nextPreference);
    setResolvedTheme(nextResolved);
  }, []);

  React.useEffect(() => {
    const nextResolved = applyTheme(preference);
    setResolvedTheme(nextResolved);
  }, [preference]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.(THEME_SYSTEM_QUERY);
    if (!media) return;

    const handleChange = () => {
      if (readStoredPreference() !== "system") return;
      const nextResolved = applyTheme("system");
      setPreferenceState("system");
      setResolvedTheme(nextResolved);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener?.(handleChange);
    return () => media.removeListener?.(handleChange);
  }, []);

  const setPreference = React.useCallback(
    (nextPreference: ThemePreference, options?: { sourceElement?: HTMLElement | null }) => {
      void runThemeTransition({
        sourceElement: options?.sourceElement,
        commit: () => commitPreference(nextPreference),
      });
    },
    [commitPreference],
  );

  const toggleTheme = React.useCallback(
    (sourceElement?: HTMLElement | null) => {
      setPreference(resolvedTheme === "dark" ? "light" : "dark", { sourceElement });
    },
    [resolvedTheme, setPreference],
  );

  const value = React.useMemo(
    () => ({ preference, resolvedTheme, setPreference, toggleTheme }),
    [preference, resolvedTheme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
