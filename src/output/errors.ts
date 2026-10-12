export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public exitCode: 1 | 2 = 1,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function fail(err: unknown): never {
  if (err instanceof AppError) {
    process.stderr.write(
      JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }) + "\n",
    );
    process.exit(err.exitCode);
  }
  process.stderr.write(
    JSON.stringify({ error: { code: "INTERNAL", message: String((err as Error)?.message ?? err) } }) + "\n",
  );
  process.exit(2);
}
