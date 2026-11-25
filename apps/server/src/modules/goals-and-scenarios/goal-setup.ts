interface GoalDetails {
  role: string | null;
  level: string | null;
  market: string | null;
}

export interface GoalSetupDraft {
  revision: number;
  details: GoalDetails;
  current:
    | { kind: "question"; text: string }
    | {
        kind: "proposal";
        text: string;
        version: number;
        turnId?: string | undefined;
      }
    | null;
}

interface DialogueTurn {
  turnId: string;
  message: string;
  reply: string;
}

export interface GoalSetup {
  draft: GoalSetupDraft;
  history: DialogueTurn[];
}

export interface GoalSetupTurn extends DialogueTurn {
  draft: GoalSetupDraft;
  path: string[];
}

export interface StoredGoalSetupTurn {
  result: GoalSetupTurn;
  lastProposalVersion: number;
}

interface GoalSetupStore {
  history(workspaceId: string): Promise<StoredGoalSetupTurn[]>;
  find(
    workspaceId: string,
    turnId: string,
  ): Promise<StoredGoalSetupTurn | undefined>;
  append(workspaceId: string, turn: StoredGoalSetupTurn): Promise<boolean>;
}

interface GoalSetupCommand {
  turnId: string;
  message: string;
  revision: number;
}

export interface GoalSetupInterpretation {
  changes: { [Key in keyof GoalDetails]?: GoalDetails[Key] | undefined };
  reply: string;
  replyKind: "conversation" | "proposal" | "reword_proposal";
}

export interface GoalSetupContext extends GoalSetup {
  lastProposalVersion: number;
}

interface GoalSetupDecision {
  kind: "conversation" | "new_proposal";
  draft: GoalSetupDraft;
  lastProposalVersion: number;
  reply: string;
}

export interface GoalSetupExecution {
  message: string;
  load(): Promise<GoalSetupContext>;
  decide(
    context: GoalSetupContext,
    interpretation: GoalSetupInterpretation,
  ): GoalSetupDecision | undefined;
  save(decision: GoalSetupDecision, path: string[]): Promise<GoalSetupTurn>;
}

export type RunGoalSetup = (
  execution: GoalSetupExecution,
) => Promise<GoalSetupTurn>;

export class GoalSetupConflict extends Error {}

const emptyDraft: GoalSetupDraft = {
  revision: 0,
  details: { role: null, level: null, market: null },
  current: null,
};

function decide(
  { draft, lastProposalVersion }: GoalSetupContext,
  { changes, reply, replyKind }: GoalSetupInterpretation,
  turnId: string,
): GoalSetupDecision | undefined {
  const details: GoalDetails = {
    role: changes.role === undefined ? draft.details.role : changes.role,
    level: changes.level === undefined ? draft.details.level : changes.level,
    market:
      changes.market === undefined ? draft.details.market : changes.market,
  };
  const complete =
    details.role !== null && details.level !== null && details.market !== null;
  const changed =
    details.role !== draft.details.role ||
    details.level !== draft.details.level ||
    details.market !== draft.details.market;
  const previousProposal =
    draft.current?.kind === "proposal" ? draft.current : undefined;
  const proposal = changed ? undefined : previousProposal;
  const proposalReply = replyKind !== "conversation";
  const reword = replyKind === "reword_proposal";
  if (reword && !proposal) return undefined;
  if (changed && previousProposal?.text === reply) return undefined;
  if (proposalReply ? !complete : complete && !proposal) return undefined;

  const showProposal =
    proposalReply && (!proposal || (reword && proposal.text !== reply));
  const version = showProposal ? lastProposalVersion + 1 : lastProposalVersion;
  const current: GoalSetupDraft["current"] = showProposal
    ? { kind: "proposal", text: reply, version, turnId }
    : (proposal ?? { kind: "question", text: reply });
  return {
    kind: showProposal ? "new_proposal" : "conversation",
    draft: { revision: draft.revision + 1, details, current },
    lastProposalVersion: version,
    reply,
  };
}

function assertSameCommand(previous: GoalSetupCommand, next: GoalSetupCommand) {
  if (previous.message !== next.message || previous.revision !== next.revision)
    throw new GoalSetupConflict();
}

export function goalSetups(store: GoalSetupStore) {
  const running = new Map<
    string,
    { command: GoalSetupCommand; task: Promise<GoalSetupTurn> }
  >();
  return {
    open(sessionWorkspaceId: string | undefined, workspaceId: string) {
      if (sessionWorkspaceId !== workspaceId) return undefined;

      async function load(): Promise<GoalSetupContext> {
        const turns = await store.history(workspaceId);
        const latest = turns.at(-1);
        return {
          draft: latest?.result.draft ?? emptyDraft,
          lastProposalVersion: latest?.lastProposalVersion ?? 0,
          history: turns.map(({ result: { turnId, message, reply } }) => ({
            turnId,
            message,
            reply,
          })),
        };
      }

      async function find(turnId: string) {
        return (await store.find(workspaceId, turnId))?.result;
      }

      async function replay(command: GoalSetupCommand) {
        const previous = await find(command.turnId);
        if (previous)
          assertSameCommand(
            {
              turnId: previous.turnId,
              message: previous.message,
              revision: previous.draft.revision - 1,
            },
            command,
          );
        return previous;
      }

      async function execute(command: GoalSetupCommand, run: RunGoalSetup) {
        const previous = await replay(command);
        if (previous) return previous;
        try {
          return await run({
            message: command.message,
            async load() {
              const context = await load();
              if (context.draft.revision !== command.revision)
                throw new GoalSetupConflict();
              return context;
            },
            decide: (context, interpretation) =>
              decide(context, interpretation, command.turnId),
            async save(decision, path) {
              const result = {
                turnId: command.turnId,
                message: command.message,
                reply: decision.reply,
                draft: decision.draft,
                path,
              };
              const saved = await store.append(workspaceId, {
                result,
                lastProposalVersion: decision.lastProposalVersion,
              });
              if (!saved) throw new GoalSetupConflict();
              return result;
            },
          });
        } catch (error) {
          if (error instanceof GoalSetupConflict) {
            const saved = await replay(command);
            if (saved) return saved;
          }
          throw error;
        }
      }

      return {
        async read(): Promise<GoalSetup> {
          const { draft, history } = await load();
          return { draft, history };
        },
        find,
        async submit(
          command: GoalSetupCommand,
          run: RunGoalSetup,
        ): Promise<GoalSetupTurn> {
          const key = `${workspaceId}/${command.turnId}`;
          const active = running.get(key);
          if (active) {
            assertSameCommand(active.command, command);
            return active.task;
          }
          const task = execute(command, run);
          running.set(key, { command, task });
          try {
            return await task;
          } finally {
            running.delete(key);
          }
        },
      };
    },
  };
}
