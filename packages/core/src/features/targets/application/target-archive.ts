import type { Transaction } from "../../../shared/storage/index.ts";
import type { TargetRepository } from "../domain/ports.ts";
import { archiveProblem, deletionProblem } from "../domain/target.ts";

type Repository = TargetRepository<Transaction>;

/** Moves an active Target to the archive; a string names why it cannot. */
export async function archive(repository: Repository, id: string) {
  const target = await repository.get(id);
  if (target === undefined) {
    return "target_not_found" as const;
  }
  const problem = archiveProblem(target);
  if (problem !== null) {
    return problem;
  }
  await repository.setStatus(id, "archived");
  return "archived" as const;
}

/**
 * Returns an archived Target to the active ones; a string names why it cannot. The demo Target
 * stays archived while another demo Target is active.
 */
export async function restore(repository: Repository, id: string) {
  const target = await repository.get(id);
  if (target === undefined) {
    return "target_not_found" as const;
  }
  if (target.status !== "archived") {
    return "target_not_archived" as const;
  }
  if (target.demo && (await repository.activeDemo()) !== undefined) {
    return "demo_exists" as const;
  }
  await repository.setStatus(id, "active");
  return "restored" as const;
}

/**
 * Whether the Target may be deleted for good with the name the Candidate typed: `deletable`, or a
 * string that names why not. Read it in the transaction that erases the Target.
 */
export async function deletion(
  repository: Repository,
  {
    id,
    typedName,
    transaction,
  }: { id: string; typedName: string | undefined; transaction: Transaction | undefined },
) {
  const target = await repository.get(id, transaction);
  if (target === undefined) {
    return "target_not_found" as const;
  }
  return deletionProblem(target, typedName) ?? ("deletable" as const);
}
