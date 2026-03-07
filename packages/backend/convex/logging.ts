export class WideEvent {
  private fields: Record<string, unknown>;
  private startTime: number;

  constructor(operation: string) {
    this.fields = { op: operation };
    this.startTime = Date.now();
  }

  set(keyOrObj: string | Record<string, unknown>, value?: unknown): this {
    if (typeof keyOrObj === "string") {
      this.fields[keyOrObj] = value;
    } else {
      Object.assign(this.fields, keyOrObj);
    }
    return this;
  }

  setError(error: unknown): this {
    this.fields.error = true;
    this.fields.errorMessage = error instanceof Error ? error.message : String(error);
    return this;
  }

  emit(): void {
    this.fields.durationMs = Date.now() - this.startTime;
    console.log(JSON.stringify(this.fields));
  }
}
