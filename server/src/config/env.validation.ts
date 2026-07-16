import { z } from "zod";

const envSchema = z.object({
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters long"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type EnvironmentVariables = z.infer<typeof envSchema>;

/**
 * Validates process.env (merged with the parsed .env file) at application
 * bootstrap. Wired into ConfigModule.forRoot({ validate }) in app.module.ts.
 *
 * On failure, throws with a message naming the offending variable(s) so a
 * developer with a missing/invalid var sees exactly which one, not a stack
 * trace from whichever service first tried to read it.
 */
export function validate(
  config: Record<string, unknown>
): Record<string, unknown> {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration - ${issues}`);
  }

  // Merge validated/defaulted values back over the raw config so unrelated
  // env vars (DB_HOST, THROTTLE_LIMIT, etc.) are preserved untouched.
  return { ...config, ...result.data };
}
