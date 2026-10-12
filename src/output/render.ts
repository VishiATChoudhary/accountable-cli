export function renderJson(data: unknown): string {
  return JSON.stringify(data);
}

export function emit(data: unknown, opts: { json: boolean }): void {
  if (opts.json) {
    console.log(renderJson(data));
  } else {
    console.dir(data, { depth: null });
  }
}
