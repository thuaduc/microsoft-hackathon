import type { PipelineEvent, PipelineStage } from "@/types";

// Wraps a route handler body in a newline-delimited JSON stream: each
// emit(event) call flushes one line immediately, so the client sees
// progress as it happens rather than buffered until the response ends.
// If `run` throws anything not already reported via emit({type:"error"}),
// it's caught here as a last resort (no retries — same minimal-error-
// handling bar as the rest of the pipeline, see CLAUDE.md).
export function ndjsonStream(
  run: (emit: (event: PipelineEvent) => void) => Promise<void>,
  fallbackStage: PipelineStage
): Response {
  const encoder = new TextEncoder();
  // ReadableStream's start() callback runs synchronously during
  // construction, so controllerRef is always assigned before the async
  // IIFE below gets a chance to run — the assertion just tells TS that.
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });

  const emit = (event: PipelineEvent) => {
    controllerRef.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  };

  (async () => {
    try {
      await run(emit);
    } catch (err) {
      emit({
        type: "error",
        stage: fallbackStage,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      controllerRef.close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
