import { describe, it, expect, vi } from "vitest";
import { dedupeInFlight } from "./inFlight";

describe("dedupeInFlight", () => {
  it("coalesces concurrent calls with the same key into one execution", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const key = `test-${Math.random()}`;

    const [a, b] = await Promise.all([
      dedupeInFlight(key, fn),
      dedupeInFlight(key, fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe("result");
    expect(b).toBe("result");
  });

  it("allows a new execution once the previous one has settled", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const key = `test-${Math.random()}`;

    await dedupeInFlight(key, fn);
    await dedupeInFlight(key, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight entry even when the function throws, so retries are not blocked", async () => {
    const key = `test-${Math.random()}`;
    const failingFn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(dedupeInFlight(key, failingFn)).rejects.toThrow("boom");

    const succeedingFn = vi.fn().mockResolvedValue("ok");
    const result = await dedupeInFlight(key, succeedingFn);

    expect(result).toBe("ok");
    expect(succeedingFn).toHaveBeenCalledTimes(1);
  });

  it("uses different keys independently", async () => {
    const fnA = vi.fn().mockResolvedValue("a");
    const fnB = vi.fn().mockResolvedValue("b");

    const [a, b] = await Promise.all([
      dedupeInFlight("key-a", fnA),
      dedupeInFlight("key-b", fnB),
    ]);

    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });
});
