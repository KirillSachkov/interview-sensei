// The download of the components after the Candidate's consent (spec #74): one download at a time,
// in the background, with its bytes so far for the progress bar.
import { componentSize, installPlan, modelIds } from "../domain/components.ts";
import type { Component, ComponentCatalog, ModelId } from "../domain/components.ts";
import type { ComponentStore } from "../domain/ports.ts";
import { modelFor, recognitionLanguages, TranscriptionError } from "../domain/recognition.ts";

/** What the download takes from the slice. */
export interface InstallationDependencies {
  /** The pinned components of this platform; null where the application does not recognize speech. */
  readonly catalog: ComponentCatalog | null;
  readonly store: ComponentStore;
  /** Receives the unexpected failures of a download. */
  readonly onError: (error: unknown) => void;
}

/** A running download: the chosen models and the bytes so far of all its components. */
interface Installation {
  readonly models: readonly ModelId[];
  downloaded: number;
  readonly total: number;
  readonly controller: AbortController;
  done: Promise<void>;
}

/** The running download and why the last one failed, in Russian. */
export interface InstallationState {
  installation: Installation | null;
  failure: string | null;
}

/** Every component of the catalog. */
export function allComponents(catalog: ComponentCatalog): Component[] {
  return [...catalog.shared, ...modelIds.map((id) => catalog.models[id])];
}

/** The reason of a failed download in Russian; an unexpected failure also goes to onError. */
function failureOf({ onError }: InstallationDependencies, error: unknown, signal: AbortSignal) {
  if (error instanceof TranscriptionError) {
    return error.message;
  }
  if (signal.aborted) {
    return "загрузка прервана";
  }
  onError(error);
  return "загрузка не удалась";
}

/** Downloads the components one at a time; a failure keeps the ones already installed. */
async function download(
  dependencies: InstallationDependencies,
  {
    state,
    installation,
    plan,
  }: { state: InstallationState; installation: Installation; plan: Component[] },
) {
  const { signal } = installation.controller;
  const onBytes = (bytes: number) => {
    installation.downloaded += bytes;
  };
  try {
    for (const component of plan) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one download at a time keeps the progress honest
      await dependencies.store.install(component, { onBytes, signal });
    }
    state.failure = null;
  } catch (error) {
    state.failure = failureOf(dependencies, error, signal);
  } finally {
    state.installation = null;
  }
}

/**
 * - `started`: the download runs in the background; `status` shows its progress.
 * - `installed`: the chosen models and the shared components are already installed.
 * - `running`: another download runs.
 * - `unavailable`: the application does not recognize speech on this platform.
 */
export type InstallOutcome = "started" | "installed" | "running" | "unavailable";

/** Starts the download of the plan in the background. */
function startDownload(
  dependencies: InstallationDependencies,
  {
    state,
    plan,
    models,
  }: { state: InstallationState; plan: Component[]; models: readonly ModelId[] },
): void {
  const installation: Installation = {
    models: modelIds.filter((id) => models.includes(id)),
    downloaded: 0,
    total: plan.reduce((sum, component) => sum + componentSize(component), 0),
    controller: new AbortController(),
    done: Promise.resolve(),
  };
  state.installation = installation;
  installation.done = download(dependencies, { state, installation, plan });
}

/** «Скачать»: the Candidate's consent to download the chosen models with the shared components. */
export async function install(
  dependencies: InstallationDependencies,
  state: InstallationState,
  models: readonly ModelId[],
): Promise<InstallOutcome> {
  const { catalog, store } = dependencies;
  if (catalog === null) {
    return "unavailable";
  }
  const plan = installPlan(catalog, {
    models,
    installed: await store.installed(allComponents(catalog)),
  });
  // Another request may have started a download while this one read the store.
  if (state.installation !== null) {
    return "running";
  }
  if (plan.length === 0) {
    return "installed";
  }
  startDownload(dependencies, { state, plan, models });
  return "started";
}

/** The running download as «Распознавание речи» shows it; null without one. */
function installationView({ installation }: InstallationState) {
  return installation === null
    ? null
    : {
        models: installation.models,
        downloaded: installation.downloaded,
        total: installation.total,
      };
}

const modelNames: Readonly<Record<ModelId, { name: string; languages: string }>> = {
  "gigaam-v3": { name: "GigaAM v3", languages: "русский" },
  "parakeet-v3": { name: "Parakeet TDT 0.6B v3", languages: "25 европейских языков" },
};

/**
 * The state of recognition for the processing card and «Распознавание речи»: each model with its
 * size and whether it is installed, the shared components, the running download, the last
 * failure, and each language of recognition with the installed model that hears it.
 */
export async function status(dependencies: InstallationDependencies, state: InstallationState) {
  const { catalog, store } = dependencies;
  if (catalog === null) {
    return { available: false as const };
  }
  const installed = await store.installed(allComponents(catalog));
  return {
    available: true as const,
    models: modelIds.map((id) => ({
      id,
      name: modelNames[id].name,
      languages: modelNames[id].languages,
      size: componentSize(catalog.models[id]),
      installed: installed.has(id),
    })),
    shared: {
      size: catalog.shared.reduce((sum, component) => sum + componentSize(component), 0),
      installed: catalog.shared.every((component) => installed.has(component.id)),
    },
    installation: installationView(state),
    failure: state.failure,
    languages: recognitionLanguages.map(({ code, name }) => ({
      code,
      name,
      model: modelFor(code, new Set(modelIds.filter((id) => installed.has(id)))),
    })),
  };
}

/** Stops a running download and waits for it. */
export async function stopDownload({ installation }: InstallationState): Promise<void> {
  if (installation !== null) {
    installation.controller.abort();
    await installation.done;
  }
}
