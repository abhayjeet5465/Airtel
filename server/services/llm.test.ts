import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { phraseExplanation } from "./llm.ts";

const plan = [
  { name: "Biz Fibre 300", quantity: 3, reasons: "Fibre 300 Mbps: enough speed for several sites. One per location." },
  { name: "Business Postpaid 299", quantity: 3, reasons: "You asked for this. Priced per phone line." },
];
const needs = { segment: "multi", cityTier: 2, employees: 12, sites: 3, wants: {} } as const;
const modelSays = (content: string) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))));

describe("phraseExplanation guard", () => {
  beforeEach(() => { process.env.LLM_API_KEY = "test"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.LLM_API_KEY; });

  it("keeps a summary that only repeats quantities, reason numbers and exact product names", async () => {
    modelSays("You get 3 Biz Fibre 300 connections at 300 Mbps and 3 Business\u00A0Postpaid\u00A0299 lines.");
    expect(await phraseExplanation("en", plan, needs as never)).toContain("Business Postpaid 299");
  });

  it("rejects a number from a product name used as a price", async () => {
    modelSays("Business Postpaid service costs 299 per line.");
    expect(await phraseExplanation("en", plan, needs as never)).toBeNull();
  });

  it("rejects invented numbers, including Devanagari digits", async () => {
    modelSays("आपको ५ कैमरे मिलेंगे।");
    expect(await phraseExplanation("hi", plan, needs as never)).toBeNull();
  });

  it("rejects any mention of money or markdown", async () => {
    modelSays("Only ₹ a little each month.");
    expect(await phraseExplanation("en", plan, needs as never)).toBeNull();
    modelSays("**Biz Fibre 300** for your team.");
    expect(await phraseExplanation("en", plan, needs as never)).toBeNull();
  });
});
