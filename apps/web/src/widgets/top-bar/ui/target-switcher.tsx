import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { targetTitle } from "@/entities/target";
import { fetchTargets } from "@/shared/api";
import type { TargetSummary } from "@/shared/api";

import { Menu, MenuChoice } from "./menu";

/** The current Target's name; the menu opens the canvas of another Target. */
export function TargetSwitcher({ target }: { target: TargetSummary }) {
  const targets = useQuery({ queryKey: ["targets"], queryFn: fetchTargets });
  const navigate = useNavigate();
  return (
    <Menu label="Цели" button={<span className="target-name">{targetTitle(target)}</span>}>
      {(close) =>
        (targets.data ?? [target]).map((option) => (
          <MenuChoice
            key={option.id}
            checked={option.id === target.id}
            onChoose={() => {
              close();
              void navigate({ to: "/targets/$targetId", params: { targetId: option.id } });
            }}
          >
            {targetTitle(option)}
          </MenuChoice>
        ))
      }
    </Menu>
  );
}
