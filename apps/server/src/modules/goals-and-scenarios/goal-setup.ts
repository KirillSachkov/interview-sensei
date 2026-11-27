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

const detailFields = ["role", "level", "market"] as const;
const detailQuestions = {
  role: "Какая роль тебе интересна?",
  level: "Какой уровень рассматриваешь?",
  market: "На каком рынке ищешь работу?",
};

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}\p{N}+#]+/gu) ?? [];
}

function mentionsGoRole(messageWords: string[]): boolean {
  const levels = ["junior", "middle", "senior", "lead"];
  const rolePrefixes = ["роль", "позиция", "позицию", "ищу", "интересует"];
  const intention = [
    "хочу",
    "готовлюсь",
    "готовиться",
    "собеседование",
    "собеседования",
  ];
  return messageWords.some((word, index) => {
    if (word !== "go") return false;
    const previous = messageWords[index - 1] ?? "";
    const next = messageWords[index + 1] ?? "";
    return (
      messageWords.length === 1 ||
      levels.includes(previous) ||
      levels.includes(next) ||
      rolePrefixes.includes(previous) ||
      (previous === "на" && intention.includes(messageWords[index - 2] ?? ""))
    );
  });
}

function matchesDetailWord(
  candidateWord: string | undefined,
  detailWord: string,
  field: keyof GoalDetails,
): boolean {
  if (candidateWord === detailWord) return true;
  if (field === "role" && detailWord.endsWith("разработчик"))
    return ["а", "у", "ом", "е"].some(
      (ending) => candidateWord === detailWord + ending,
    );
  if (field === "market" && detailWord.endsWith("ия"))
    return ["и", "ю", "ей"].some(
      (ending) => candidateWord === detailWord.slice(0, -1) + ending,
    );
  return false;
}

function mentionsDetail(
  messageWords: string[],
  field: keyof GoalDetails,
  value: string,
): boolean {
  const detailWords = words(value);
  if (detailWords.length === 0) return false;

  if (
    field === "role" &&
    value.toLowerCase() === "go-разработчик" &&
    mentionsGoRole(messageWords)
  )
    return true;

  return messageWords.some((_, start) =>
    detailWords.every((word, offset) =>
      matchesDetailWord(messageWords[start + offset], word, field),
    ),
  );
}

function decide(
  { draft, lastProposalVersion }: GoalSetupContext,
  interpretation: GoalSetupInterpretation,
  { message, turnId }: GoalSetupCommand,
): GoalSetupDecision | undefined {
  const details = { ...draft.details };
  const messageWords = words(message);
  let ignoredChange = false;
  for (const field of detailFields) {
    const value = interpretation.changes[field];
    if (value === undefined || value === details[field]) continue;
    if (value === null || mentionsDetail(messageWords, field, value))
      details[field] = value;
    else ignoredChange = true;
  }

  const missing = detailFields.find((field) => details[field] === null);
  const complete = missing === undefined;
  const changed = detailFields.some(
    (field) => details[field] !== draft.details[field],
  );
  const previousProposal =
    draft.current?.kind === "proposal" ? draft.current : undefined;
  const proposal = changed ? undefined : previousProposal;
  let response: Pick<GoalSetupInterpretation, "reply" | "replyKind"> =
    interpretation;
  if (missing === "role" || (ignoredChange && missing !== undefined)) {
    response = { replyKind: "conversation", reply: detailQuestions[missing] };
  } else if (ignoredChange && proposal) {
    response = {
      replyKind: "conversation",
      reply: "Что хочешь уточнить в цели подготовки?",
    };
  } else if (ignoredChange) {
    response = {
      replyKind: "proposal",
      reply: `Подготовиться к собеседованиям. Роль — ${details.role}, уровень — ${details.level}, рынок — ${details.market}.`,
    };
  }
  const { reply, replyKind } = response;
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
              decide(context, interpretation, command),
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
