import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

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
    list: async () => list(database, ne(targets.status, "archived")),
    archived: async () => list(database, eq(targets.status, "archived")),
    setStatus: async (id, status) => setFields(database, id, { status }),
    erase: async (id, transaction) => erase(transaction, id),
    activeDemo: async () => activeDemo(database),
    setAgent: async (id, agent) => setFields(database, id, { agent }),
    setSectionEnabled: async (targetId, sectionId, enabled) =>
      setSectionEnabled(database, { targetId, sectionId, enabled }),
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

async function list(database: Database, condition: SQL) {
  return database
    .select({ id: targets.id, name: targets.name, status: targets.status, level: targets.level })
    .from(targets)
    .where(condition)
    .orderBy(asc(targets.createdAt), asc(targets.id));
}

/** The Interview plan and the Preferences go first: they reference the Target. */
async function erase(executor: Executor, id: string) {
  await executor.delete(sections).where(eq(sections.targetId, id));
  await executor.delete(preferences).where(eq(preferences.targetId, id));
  await executor.delete(targets).where(eq(targets.id, id));
}

async function activeDemo(database: Database) {
  const [row] = await database
    .select()
    .from(targets)
    .where(and(eq(targets.demo, true), eq(targets.status, "active")));
  return row === undefined ? undefined : toTarget(row);
}

async function setFields(
  database: Database,
  id: string,
  fields: Partial<Pick<Target, "agent" | "status">>,
) {
  const updated = await database
    .update(targets)
    .set(fields)
    .where(eq(targets.id, id))
    .returning({ id: targets.id });
  return updated.length > 0;
}

async function setSectionEnabled(
  database: Database,
  { targetId, sectionId, enabled }: { targetId: string; sectionId: string; enabled: boolean },
) {
  const updated = await database
    .update(sections)
    .set({ enabled })
    .where(and(eq(sections.targetId, targetId), eq(sections.id, sectionId)))
    .returning({ id: sections.id });
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
