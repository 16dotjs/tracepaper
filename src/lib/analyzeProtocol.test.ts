import { describe, it, expect } from "vitest";
import { parseSSEBuffer } from "./analyzeProtocol";

describe("parseSSEBuffer", () => {
  it("parses a single complete SSE event", () => {
    const { events, remainder } = parseSSEBuffer(
      `data: {"type":"stage","stage":"tree"}\n\n`,
    );
    expect(events).toEqual([{ type: "stage", stage: "tree" }]);
    expect(remainder).toBe("");
  });

  it("parses multiple events present in one buffer", () => {
    const buffer = `data: {"type":"stage","stage":"repo-info"}\n\ndata: {"type":"stage","stage":"tree"}\n\n`;
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(2);
  });

  it("leaves an incomplete trailing event in the remainder for the next chunk", () => {
    const buffer = `data: {"type":"stage","stage":"tree"}\n\ndata: {"type":"stage"`;
    const { events, remainder } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(remainder).toBe('data: {"type":"stage"');
  });

  it("skips a malformed event without throwing or losing valid ones around it", () => {
    const buffer = `data: not valid json\n\ndata: {"type":"joining"}\n\n`;
    const { events } = parseSSEBuffer(buffer);
    expect(events).toEqual([{ type: "joining" }]);
  });

  it("returns no events and no remainder for an empty buffer", () => {
    const { events, remainder } = parseSSEBuffer("");
    expect(events).toEqual([]);
    expect(remainder).toBe("");
  });
});
