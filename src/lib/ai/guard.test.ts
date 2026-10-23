import { describe, expect, it } from "vitest";
import { guardFacts, oneLine, paragraph } from "./guard";

describe("guardFacts", () => {
  it("keeps numbers the user wrote", () => {
    const r = guardFacts("Cut booking steps from 9 to 4, raising bookings by 18%.", "cut the steps from 9 to 4 and raised bookings 18%");
    expect(r.text).toBe("Cut booking steps from 9 to 4, raising bookings by 18%.");
    expect(r.replaced).toBe(0);
  });

  it("turns invented numbers into placeholders", () => {
    const r = guardFacts("Led a team of 12 to grow revenue by 35% in 6 months.", "led the team that grew revenue");
    expect(r.text).toBe("Led a team of [number] to grow revenue by [number] in [number] months.");
    expect(r.replaced).toBe(3);
    expect(r.placeholders).toEqual(["[number]", "[number]", "[number]"]);
  });

  it("matches numbers written differently", () => {
    expect(guardFacts("Reduced tickets by 1,200 a month.", "dropped monthly tickets by 1200").replaced).toBe(0);
    expect(guardFacts("Saved $3.5m.", "saved 3.5 million dollars").replaced).toBe(0);
  });

  it("catches invented years and money", () => {
    expect(guardFacts("Since 2019, saved $40k.", "saved money").text).toBe("Since [number], saved [number].");
  });

  it("lists placeholders the model wrote itself", () => {
    expect(guardFacts("Improved [metric] by [%].", "").placeholders).toEqual(["[metric]", "[%]"]);
  });
});

describe("cleaning model output", () => {
  it("strips labels, list markers and quotes", () => {
    expect(oneLine('Bullet: "Led the redesign of booking."\n\nThis bullet is stronger because...')).toBe("Led the redesign of booking.");
    expect(oneLine("- Built the design system")).toBe("Built the design system");
  });
  it("joins a summary into one paragraph", () => {
    expect(paragraph('Summary: "Designer with 6 years.\nKnown for research."')).toBe("Designer with 6 years. Known for research.");
  });
});
