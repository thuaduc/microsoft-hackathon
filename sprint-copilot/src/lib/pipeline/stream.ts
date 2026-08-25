import type { PipelineEvent } from "@/types";

// Reads a POST response body as newline-delimited JSON, calling onEvent for
// each parsed line as soon as it arrives. Used instead of EventSource
// because EventSource can't send a POST body (needed for /api/run/confirm's
// edited selection).
export async function readNdjsonStream(
  response: Response,
  onEvent: (event: PipelineEvent) => void
): Promise<void> {
  if (!response.body) throw new Error("Response has no body to stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) onEvent(JSON.parse(line) as PipelineEvent);
    }
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as PipelineEvent);
}
