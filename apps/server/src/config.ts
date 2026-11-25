import { z } from "zod";
const database = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});
const http = database.extend({
  PUBLIC_ORIGIN: z
    .url({ protocol: /^https?$/ })
    .refine((value) => URL.parse(value)?.origin === value),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  OLLAMA_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url({ protocol: /^https?$/ }).optional(),
  ),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:4b"),
});
function read<T>(schema: z.ZodType<T>) {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      "Проверь настройку " +
        result.error.issues.map((issue) => issue.path.join(".")).join(", "),
    );
  return result.data;
}
export const apiConfig = () => read(http);
export const workerConfig = () => read(database);
