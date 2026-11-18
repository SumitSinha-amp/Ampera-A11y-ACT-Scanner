import { describe, expect, it } from "vitest";
import { outcomeWcag } from "./outcome-wcag";

describe("outcome-specific WCAG mapping", () => {
  const names = { sc: ["1.3.1", "4.1.2"], level: ["A"] };
  it("maps only the R8 review outcome to Labels or Instructions", () => {
    expect(outcomeWcag("ACT-R8", "Potential Issue", names)).toEqual({ sc: ["3.3.2"], level: ["A"] });
    expect(outcomeWcag("ACT-R8", "Issue", names)).toBe(names);
    expect(outcomeWcag("ACT-R12", "Potential Issue", names)).toBe(names);
  });
});
