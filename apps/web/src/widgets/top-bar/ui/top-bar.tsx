import { Link } from "@tanstack/react-router";

import { NewTargetButton } from "@/features/new-target";
import type { TargetSummary } from "@/shared/api";

import { SettingsMenu } from "./settings-menu";
import { TargetMenu } from "./target-menu";
import { TargetSwitcher } from "./target-switcher";

/**
 * The bar over the canvas: the Target switcher, «Меню цели» and «Новая цель» on the left; the
 * «Настройки» on the right. Without a Target only «Настройки» remains. The Target's agent is chosen
 * in the setup chat.
 */
export function TopBar({ target }: { target: TargetSummary | null }) {
  return (
    <header className="top-bar">
      {target === null ? (
        <span />
      ) : (
        <nav className="island top-island" aria-label="Цель">
          <TargetSwitcher target={target} />
          <TargetMenu target={target} />
          <NewTargetButton />
        </nav>
      )}
      <div className="island top-island">
        <SettingsMenu />
      </div>
    </header>
  );
}

/** The bar of the service page `/agent-check`: only the way back to the canvas. */
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
