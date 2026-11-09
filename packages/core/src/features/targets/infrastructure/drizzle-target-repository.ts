import { and, asc, eq, ne, sql } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Executor, Transaction } from "../../../shared/storage/index.ts";
import type { TargetRepository } from "../domain/ports.ts";
import type { Preference, Section, Target, TargetUpdate } from "../domain/target.ts";
import { preferences, sections, targets } from "./schema.ts";

function toTarget(row: typeof targets.$inferSelect): Target {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
export function drizzleTargetRepository(database: Database): TargetRepository<Transaction> {
  return {
    create: async (target, plan, rules) => {
      await database.transaction(async (transaction) => {
        await transaction
          .insert(targets)
          .values({ ...target, createdAt: new Date(target.createdAt) });
        if (plan.length > 0) {
          await transaction.insert(sections).values([...plan]);
        }
        if (rules.length > 0) {
          await transaction
            .insert(preferences)
            .values(rules.map((rule) => ({ ...rule, createdAt: new Date(rule.createdAt) })));
        }
      });
    },
    get: async (id, transaction) => {
      const [row] = await executorOf(database, transaction)
        .select()
        .from(targets)
        .where(eq(targets.id, id));
      return row === undefined ? undefined : toTarget(row);
    },
    list: async () => list(database),
    activeDemo: async () => {
      const [row] = await database
        .select()
        .from(targets)
        .where(and(eq(targets.demo, true), eq(targets.status, "active")));
      return row === undefined ? undefined : toTarget(row);
    },
    setAgent: async (id, agent) => setAgent(database, id, agent),
    update: async (id, change, transaction) =>
      executorOf(database, transaction).transaction(async (inner) => update(inner, id, change)),
    sections: async (id, transaction) =>
      executorOf(database, transaction)
        .select()
        .from(sections)
        .where(eq(sections.targetId, id))
        .orderBy(asc(sections.position)),
    preferences: async (id, transaction) =>
      activePreferences(executorOf(database, transaction), id),
    savePreferences: async (rules, transaction) =>
      savePreferences(executorOf(database, transaction), rules),
  };
}

/** Stores the fields and replaces the plan: the old Sections go first, so positions stay unique. */
async function update(
  executor: Executor,
  id: string,
  { sections: plan, ...fields }: Omit<TargetUpdate, "sections"> & { sections: readonly Section[] },
) {
  const updated = await executor
    .update(targets)
    .set(fields)
    .where(eq(targets.id, id))
    .returning({ id: targets.id });
  if (updated.length === 0) {
    return false;
  }
  await executor.delete(sections).where(eq(sections.targetId, id));
  if (plan.length > 0) {
    await executor.insert(sections).values([...plan]);
  }
  return true;
}

/** Inserts new Preferences and updates the existing ones of the same Target. */
async function savePreferences(executor: Executor, rules: readonly Preference[]) {
  if (rules.length === 0) {
    return;
  }
  await executor
    .insert(preferences)
    .values(rules.map((rule) => ({ ...rule, createdAt: new Date(rule.createdAt) })))
    .onConflictDoUpdate({
      target: preferences.id,
      set: {
        text: sql`excluded.text`,
        rejectedQuestionIds: sql`excluded.rejected_question_ids`,
        active: sql`excluded.active`,
      },
      setWhere: eq(preferences.targetId, sql`excluded.target_id`),
    });
}

async function list(database: Database) {
  return database
    .select({ id: targets.id, name: targets.name, status: targets.status, level: targets.level })
    .from(targets)
    .where(ne(targets.status, "archived"))
    .orderBy(asc(targets.createdAt), asc(targets.id));
}

async function setAgent(database: Database, id: string, agent: string | null) {
  const updated = await database
    .update(targets)
    .set({ agent })
    .where(eq(targets.id, id))
    .returning({ id: targets.id });
  return updated.length > 0;
}

async function activePreferences(executor: Executor, id: string) {
  const rows = await executor
    .select()
    .from(preferences)
    .where(and(eq(preferences.targetId, id), eq(preferences.active, true)))
    .orderBy(asc(preferences.createdAt), asc(preferences.id));
  return rows.map((rule) => toPreference(rule));
}

function toPreference(rule: typeof preferences.$inferSelect) {
  return { ...rule, createdAt: rule.createdAt.toISOString() };
}
