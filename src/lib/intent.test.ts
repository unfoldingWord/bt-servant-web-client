import { describe, expect, it } from "vitest";
import { INTENT_KEYS, parseIntent } from "./intent";

describe("parseIntent", () => {
  it("accepts every key the marketing site links with", () => {
    for (const key of INTENT_KEYS) expect(parseIntent(key)).toBe(key);
  });

  it("rejects anything that is not a known key", () => {
    expect(parseIntent("my private prayer request")).toBeUndefined();
    expect(parseIntent("UNDERSTAND")).toBeUndefined();
    expect(parseIntent("understand ")).toBeUndefined();
    expect(parseIntent("")).toBeUndefined();
    expect(parseIntent(undefined)).toBeUndefined();
    expect(parseIntent(["understand"])).toBeUndefined();
  });
});
