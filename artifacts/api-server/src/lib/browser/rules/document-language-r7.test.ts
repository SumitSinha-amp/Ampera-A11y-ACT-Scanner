import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

const policy = "Medical reasons to cancel your domestic travel, and receive up to INR3500 compensation against airline cancellation charges per person per segment.";
const french = "Les lecteurs peuvent consulter cette page pour découvrir les offres disponibles et réserver leurs vacances en toute sécurité. Veuillez choisir votre destination et les dates de votre prochain voyage.";
const spanish = "Accessible Universidad es una universidad ficticia, y esta es su página de ficción. Esta página está diseñada para demostrar una variedad de problemas de diseño web que se traducen en problemas para los visitantes con discapacidad.";

describe.skipIf(!existsSync(chromium))("ACT-R7 rendered language evidence", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(body: string, rules = ["ACT-R7"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<html lang="en"><head><title>Language evidence</title></head><body>${body}</body></html>`);
      await page.addScriptTag({ content: bundle });
      return await page.evaluate(selected =>
        (window as any).__ampera.runAllRules({ rules: selected }).issues, rules);
    } finally { await page.close(); }
  }

  it("does not flag the Cleartrip English policy or use it as heading evidence", async () => {
    expect(await scan(`<h2>Medical cancellation</h2><ul><li>${policy}</li></ul><p>${policy}</p>`)).toEqual([]);
  });

  it("does not infer missing declarations under SIA-R7", async () => {
    expect(await scan(`<p>${policy}</p><p>${french}</p><p>${spanish}</p>`)).toEqual([]);
  });

  it("offers undeclared foreign prose as custom review suggestions only", async () => {
    const issues = await scan(`<p>${policy}</p><p>${french}</p><p>${spanish}</p>`, ["ACT-R132"]);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue: any) => issue.description)).toEqual([
      expect.stringContaining('suggest "fr"'),
      expect.stringContaining('suggest "es"'),
    ]);
    expect(issues.every((issue: any) => issue.type === "Potential Issue" && issue.ruleId === "ACT-R132")).toBe(true);
  });

  it("respects existing language declarations and excludes hidden foreign text", async () => {
    expect(await scan(`<section lang="fr"><p>${french}</p></section><p lang="es">${spanish}</p><p hidden>${french}</p>`, ["ACT-R7", "ACT-R132"])).toEqual([]);
  });

  it("keeps invalid explicit language declarations reportable", async () => {
    const issues = await scan('<p lang="not_a_language">Invalid language declaration.</p>');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "ACT-R7", type: "Issue", displayTitle: "Language is not valid" });
  });

  it("validates registered language subtags rather than just regex shape", async () => {
    const issues = await scan('<p lang="xx">Invalid code.</p><p lang="en-US">Valid code.</p><p lang="FR">Valid case.</p>');
    expect(issues).toHaveLength(1);
    expect(issues[0].elementContext).toContain('lang="xx"');
  });

  it("does not validate empty unused declarations or head metadata", async () => {
    expect(await scan('<div lang="xx"></div><p lang="">English.</p><div lang="xx" hidden>Hidden</div>')).toEqual([]);
  });

  it("recognizes accessible-name-only content", async () => {
    const issues = await scan('<button lang="xx" aria-label="Continue"></button>');
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe("ACT-R7");
  });

  it("checks body declarations, ignores inherited html lang, and preserves empty inheritance", async () => {
    const issues = await scan('<div lang="xx"><p lang="">Inherited declaration.</p></div><div lang="yy"><p lang="fr">Bonjour.</p></div>');
    expect(issues).toHaveLength(1);
    expect(issues[0].elementContext).toContain('lang="xx"');
  });

  it("follows the primary-subtag expectation rather than validating trailing subtags", async () => {
    expect(await scan('<p lang="en-madeup">English text.</p>')).toEqual([]);
  });

  it("does not skip visually visible text solely because it is aria-hidden", async () => {
    expect(await scan('<p lang="xx" aria-hidden="true">Visible invalid declaration.</p>')).toHaveLength(1);
  });

  it("does not suggest language changes from isolated labels or mixed sentences", async () => {
    expect(await scan(`<h2>Bienvenido!</h2><button>Réserver</button><p>Cleartrip Myntra Paris London Berlin</p><p>${french} ${policy}</p>`, ["ACT-R132"])).toEqual([]);
  });

  it("joins inline markup into coherent paragraph evidence", async () => {
    const issues = await scan(`<p>${french.replace("consulter cette page", "<strong>consulter cette page</strong>")}</p>`, ["ACT-R132"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("Potential Issue");
  });

  it("keeps Cleartrip's actual English sentence out of both checks", async () => {
    expect(await scan(`<ul><li>${policy}</li></ul>`, ["ACT-R7", "ACT-R132"])).toEqual([]);
  });

  it("does not emit R7 findings when another rule is selected", async () => {
    expect(await scan(`<p>${french}</p>`, ["ACT-R4"])).toEqual([]);
  });
});
