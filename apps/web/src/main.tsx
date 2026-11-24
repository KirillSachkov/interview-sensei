import { createRoot } from "react-dom/client";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";
import "./style.css";
const host = document.getElementById("root");
if (!host) throw new Error("Missing application root");
const root = createRoot(host);
async function loadWorkspace() {
  root.render(<p role="status">Открываем рабочую область…</p>);
  try {
    const response = await fetch(guestWorkspacePath, { method: "POST" });
    if (!response.ok) throw new Error("Workspace unavailable");
    guestWorkspace.parse(await response.json());
    root.render(<h1>К какому собеседованию хочешь подготовиться?</h1>);
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
