import path from "node:path";

/** The environment variable that overrides the data directory. */
export const dataDirectoryVariable = "INTERVIEW_SENSEI_DATA_DIR";

/**
 * The directory that holds all application data: `~/.interview-sensei` unless the
 * `INTERVIEW_SENSEI_DATA_DIR` variable names another one. A relative value is resolved against
 * the working directory.
 */
export function resolveDataDirectory(
  context: Readonly<{
    env: Readonly<Record<string, string | undefined>>;
    home: string;
    workingDirectory: string;
  }>,
): string {
  const override = context.env[dataDirectoryVariable];
  if (override === undefined || override === "") {
    return path.join(context.home, ".interview-sensei");
  }
  return path.resolve(context.workingDirectory, override);
}
