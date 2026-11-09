import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { targetTitle } from "@/entities/target";
import { fetchTargets } from "@/shared/api";
import type { TargetSummary } from "@/shared/api";

import { Menu, MenuChoice, MenuItem } from "./menu";

/** «черновик» beside the name of a draft Target, which the Candidate has not set up yet. */
function DraftMark({ target }: { target: TargetSummary }) {
  return target.status === "draft" ? <span className="tag">черновик</span> : null;
}

/**
 * The current Target's name; the menu opens the canvas of another Target, or the list «Архив»,
 * where the archived Targets went.
 */
export function TargetSwitcher({ target }: { target: TargetSummary }) {
  const targets = useQuery({ queryKey: ["targets"], queryFn: fetchTargets });
  const navigate = useNavigate();
  return (
    <Menu
      label="Цели"
      button={
        <span className="target-name">
          {targetTitle(target)}
          <DraftMark target={target} />
        </span>
      }
    >
      {(close) => (
        <>
          {(targets.data ?? [target]).map((option) => (
            <MenuChoice
              key={option.id}
              checked={option.id === target.id}
              onChoose={() => {
                close();
                void navigate({ to: "/targets/$targetId", params: { targetId: option.id } });
              }}
            >
              <span>
                {targetTitle(option)}
                <DraftMark target={option} />
              </span>
            </MenuChoice>
          ))}
          <MenuItem
            hint="цели, убранные в архив"
            onChoose={() => {
              close();
              void navigate({ to: "/archive" });
            }}
          >
            Архив
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
