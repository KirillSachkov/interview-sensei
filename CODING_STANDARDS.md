# Review standards

What the Standards reviewer holds a change to, beyond what tooling enforces. It grows through `retro`: a mistake a review missed becomes a check when it is mechanical and a rule here when it is a judgement call.

- Agent instructions and skills follow `.agents/skills/writing-for-agents/SKILL.md`.
- The English and Russian versions of a human document carry the same decisions, evidence and required actions. A translation adds no permission or requirement.
- A term in code, tests and documents is the one `DOMAIN.md` defines.

- Keep session authentication in the adapters. The Goals and Scenarios module owns the decision to open or create a workspace.
- When changing a transport contract, trace both the browser loader and the HTTP adapter through the schema in `packages/contracts`.
- React components use loaders and event handlers. An external subscription belongs in a named `apps/web/src/adapters/<name>.ts` hook with a matching `tests/adapters/<name>.lifecycle.test.ts` that exercises setup and cleanup.
