import { Link } from "@tanstack/react-router";

import type { TargetSummary } from "@/shared/api";

import { AgentPicker } from "./agent-picker";
import { TargetSwitcher } from "./target-switcher";

/**
 * The bar over the canvas: the Target switcher on the left; the Target's agent and the link to
 * «Проверка агента» on the right. Without a Target only the link remains.
 */
export function TopBar({ target }: { target: TargetSummary | null }) {
  return (
    <header className="top-bar">
      {target === null ? (
        <span />
      ) : (
        <nav className="island top-island" aria-label="Цель">
          <TargetSwitcher target={target} />
        </nav>
      )}
      <div className="island top-island">
        {target === null ? null : <AgentPicker targetId={target.id} />}
        <Link to="/agent-check" className="button ghost">
          Проверка агента
        </Link>
      </div>
    </header>
  );
}

/** The bar of «Проверка агента»: only the way back to the canvas. */
export function BackToCanvasBar() {
  return (
    <header className="top-bar">
      <nav className="island top-island" aria-label="Навигация">
        <Link to="/" className="button ghost">
          ← К холсту
        </Link>
      </nav>
    </header>
  );
}
