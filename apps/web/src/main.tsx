import { createRoot } from "react-dom/client";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";
import { goalSetupClient, readGoalSetup } from "./goal-setup-client.js";
import { GoalSetup } from "./goal-setup.js";
import "./style.css";
const host = document.getElementById("root");
if (!host) throw new Error("Missing application root");
const root = createRoot(host);
async function loadWorkspace() {
  root.render(<p role="status">Открываем рабочую область…</p>);
  try {
    const response = await fetch(guestWorkspacePath, { method: "POST" });
    if (!response.ok) throw new Error("Workspace unavailable");
    const { workspaceId } = guestWorkspace.parse(await response.json());
    const setup = await readGoalSetup(workspaceId);
    root.render(<GoalSetup client={goalSetupClient(workspaceId, setup)} />);
  } catch {
    root.render(
      <section>
        <p role="alert">Не удалось открыть рабочую область.</p>
        <button onClick={() => void loadWorkspace()}>Попробовать снова</button>
      </section>,
    );
  }
}
void loadWorkspace();
