import { and, asc, eq, ne } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { TargetRepository } from "../domain/ports.ts";
import type { Target } from "../domain/target.ts";
import { preferences, sections, targets } from "./schema.ts";

function toTarget(row: typeof targets.$inferSelect): Target {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
export function drizzleTargetRepository(database: Database): TargetRepository {
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
    get: async (id) => {
      const [row] = await database.select().from(targets).where(eq(targets.id, id));
      return row === undefined ? undefined : toTarget(row);
    },
    list: async () =>
      database
        .select({
          id: targets.id,
          name: targets.name,
          status: targets.status,
          level: targets.level,
        })
        .from(targets)
        .where(ne(targets.status, "archived"))
        .orderBy(asc(targets.createdAt), asc(targets.id)),
    activeDemo: async () => {
      const [row] = await database
        .select()
        .from(targets)
        .where(and(eq(targets.demo, true), eq(targets.status, "active")));
      return row === undefined ? undefined : toTarget(row);
    },
    setAgent: async (id, agent) => setAgent(database, id, agent),
    sections: async (id) =>
      database
        .select()
        .from(sections)
        .where(eq(sections.targetId, id))
        .orderBy(asc(sections.position)),
    preferences: async (id) => activePreferences(database, id),
  };
}

async function setAgent(database: Database, id: string, agent: string | null) {
  const updated = await database
    .update(targets)
    .set({ agent })
    .where(eq(targets.id, id))
    .returning({ id: targets.id });
  return updated.length > 0;
}

async function activePreferences(database: Database, id: string) {
  const rows = await database
    .select()
    .from(preferences)
    .where(and(eq(preferences.targetId, id), eq(preferences.active, true)))
    .orderBy(asc(preferences.createdAt), asc(preferences.id));
  return rows.map((rule) => toPreference(rule));
}

function toPreference(rule: typeof preferences.$inferSelect) {
  return { ...rule, createdAt: rule.createdAt.toISOString() };
}
