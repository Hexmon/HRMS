import { describe, expect, it } from "vitest";
import { BoundedMemoryCommandReplay } from "../memory-command-replay.js";

describe("bounded memory expense command replay", () => {
  it("replays an identical command and rejects cap+1 before business mutation", () => {
    const replay = new BoundedMemoryCommandReplay<{ version: number }>(1);
    let effects = 0;
    const run = () => ({ version: ++effects });

    expect(replay.execute({ key: "one", requestHash: "hash-one", action: "finance.approve", run }))
      .toEqual({ version: 1 });
    expect(replay.execute({ key: "one", requestHash: "hash-one", action: "finance.approve", run }))
      .toEqual({ version: 1 });
    expect(effects).toBe(1);

    expect(() => replay.execute({
      key: "two",
      requestHash: "hash-two",
      action: "finance.approve",
      run,
    })).toThrow("replay capacity is exhausted");
    expect(effects).toBe(1);
    expect(replay.size).toBe(1);
  });
});
