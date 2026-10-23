import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe.skipIf(!existsSync(chromium))("ACT-R82 automatic findings and Alfa review questions", () => {
  let browser: Browser;
  let engine: string;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, rules: string[] | null = ["ACT-R82"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Error review test</title>
        </head><body>${html}<script>
        window.validationEvents=0;window.formSubmits=0;window.focusEvents=0;
        document.addEventListener('invalid',()=>window.validationEvents++,true);
        document.addEventListener('submit',e=>{window.formSubmits++;e.preventDefault()},true);
        document.addEventListener('focus',()=>window.focusEvents++,true);
        </script></body></html>`);
      await page.evaluate(engine);
      return await page.evaluate((rules) => {
        const w = window as unknown as {
          validationEvents: number; formSubmits: number; focusEvents: number;
          __ampera: { runAllRules: (options: { rules?: string[] }) => {
            issues: { ruleId: string; type: string; selector: string; description: string; elementContext: string }[];
            stats: { ruleId: string; totalChecked: number; scope: string }[];
            ruleStatuses: { ruleId: string; status: string }[];
          } };
        };
        const before = document.body.innerHTML;
        const active = document.activeElement;
        const result = w.__ampera.runAllRules({ rules: rules ?? undefined });
        return {
          issues: result.issues.filter((issue) => issue.ruleId === "ACT-R82"),
          stats: result.stats.filter((stat) => stat.ruleId === "ACT-R82"),
          status: result.ruleStatuses.find((status) => status.ruleId === "ACT-R82"),
          unchanged: before === document.body.innerHTML && active === document.activeElement,
          events: [w.validationEvents, w.formSubmits, w.focusEvents],
        };
      }, rules);
    } finally { await page.close(); }
  }

  it.each(["input", "textarea", "select"])("preserves existing automatic %s findings without duplicate reviews", async (tag) => {
    const html = tag === "input" ? '<input id="field" aria-invalid="true">' : `<${tag} id="field" aria-invalid="true"></${tag}>`;
    const result = await scan(html);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      type: "Issue",
      description: "Input marked aria-invalid but has no associated error message — add aria-describedby pointing to a descriptive error element",
    });
    expect(result.stats).toEqual([{ ruleId: "ACT-R82", totalChecked: 1, scope: "element" }]);
  });
  it("does not clear a legacy Issue when only aria-errormessage is supplied", async () => {
    const result = await scan('<input id="field" aria-invalid="true" aria-errormessage="message"><p id="message">Enter a valid email address.</p>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Issue");
  });
  it("retains legacy described-by and local-error acceptance, adding only manual questions", async () => {
    const linked = await scan('<input aria-invalid="true" aria-describedby="hint"><p id="hint">Please enter an email address.</p>');
    const local = await scan('<div><input aria-invalid="true"><span class="error">Email address is required.</span></div>');
    expect(linked.issues.map((issue) => issue.type)).toEqual(["Potential Issue"]);
    expect(local.issues.map((issue) => issue.type)).toEqual(["Potential Issue"]);
  });
  it.each([
    "checkbox", "combobox", "listbox", "menuitemcheckbox", "menuitemradio",
    "radio", "searchbox", "slider", "spinbutton", "switch", "textbox",
  ])("covers Alfa role %s without needing aria-invalid", async (role) => {
    const result = await scan(`<div id="field" role="${role}" aria-label="Example field"></div>`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ selector: "div#field", type: "Potential Issue" });
    expect(result.issues[0].description).toContain("not evidence of an error or a confirmed failure");
    expect(result.status?.status).toBe("executed");
  });
  it("covers native roles, hidden/dormant controls, and role-token fallbacks", async () => {
    const result = await scan(`<input type="checkbox"><input type="radio"><select><option>Country</option></select>
      <input type="search"><input type="range"><input type="number"><textarea></textarea>
      <div hidden><input type="text"></div><div role="bogus textbox"></div>`);
    expect(result.issues).toHaveLength(9);
    expect(result.issues.every((issue) => issue.type === "Potential Issue")).toBe(true);
    expect(result.stats[0].totalChecked).toBe(9);
  });
  it("does not manufacture reviews for non-applicable roles or hidden-value inputs", async () => {
    const result = await scan('<button>Submit</button><input type="hidden"><div role="button">Action</div><svg role="textbox"></svg>');
    expect(result.issues).toEqual([]);
    expect(result.status?.status).toBe("not-applicable");
  });
  it.each([
    "hidden", 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"', 'style="opacity:0"',
  ])("reviews non-perceivable error indicators: %s", async (attributes) => {
    const result = await scan(`<input aria-invalid="true" aria-describedby="message"><p id="message" ${attributes}>Email address is required.</p>`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.issues[0].description).toContain("hidden from assistive technology");
  });
  it("does not treat a visible wrapper with hidden error text as perceivable text", async () => {
    const result = await scan('<input aria-describedby="message"><div id="message" style="width:200px;height:30px"><span hidden>Email is required.</span></div>');
    expect(result.issues[0].description).toContain("lacks perceivable descriptive text");
  });
  it("supports separate identifying and explanatory indicators", async () => {
    const result = await scan(`<label for="field">Email</label>
      <input id="field" aria-invalid="true" aria-describedby="identity resolution">
      <p id="identity">Email has an error.</p><p id="resolution">Use an address containing an @ sign.</p>`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.issues[0].description).toContain("different indicators");
    expect(result.issues[0].elementContext).toContain("identity");
    expect(result.issues[0].elementContext).toContain("resolution");
  });
  it("accepts image alternatives as potential perceivable indicator content", async () => {
    const result = await scan(`<div role="textbox" aria-errormessage="message">Email</div>
      <span id="message"><img width="24" height="24" alt="Email must contain an @ sign"></span>`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].description).not.toContain("lacks perceivable");
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it("covers custom-role errors, missing references, and visual-only error styling", async () => {
    const result = await scan('<div role="combobox" aria-invalid="true" aria-errormessage="missing">Choose</div><div role="textbox" class="invalid">Email</div>');
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((issue) => issue.type === "Potential Issue")).toBe(true);
    expect(result.issues[0].description).toContain("not found: missing");
    expect(result.issues[1].description).toContain("no associated textual error indicator");
  });
  it("reports a generic summary once, not one failure per possible field", async () => {
    const result = await scan(`<form><div id="error"><div class="errorHeading">ERROR</div>
      <p>Your form has errors. Please correct them and resubmit.</p></div>
      <div>Name: <input name="name"></div><div>Email: <input name="email"></div><div>Captcha: <input name="captcha"></div></form>`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ selector: "div#error", type: "Potential Issue" });
    expect(result.issues[0].description).toContain("number of failures require manual verification");
    expect(result.issues[0].elementContext).toContain("not confirmed failures");
    expect(result.stats[0].totalChecked).toBe(3);
  });
  it("associates summaries that identify fields using links or textual names", async () => {
    const result = await scan(`<form><div class="error-summary"><a href="#email">Email is invalid</a><p>Name is required.</p></div>
      <label for="email">Email</label><input id="email"><label for="name">Name</label><input id="name"></form>`);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((issue) => issue.selector.startsWith("input#"))).toBe(true);
    expect(result.issues.every((issue) => issue.type === "Potential Issue")).toBe(true);
  });
  it("supports explicitly referenced summaries and native controls outside the form", async () => {
    const result = await scan(`<div id="error" role="alert">Your form has errors. Please correct them.</div>
      <form id="signup" aria-describedby="error"><input name="email"></form>
      <input form="signup" name="name">`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ selector: "div#error", type: "Potential Issue" });
    expect(result.issues[0].elementContext).toContain("(name)");
    expect(result.stats[0].totalChecked).toBe(2);
  });
  it("does not infer field identity from a substring in an unrelated word", async () => {
    const result = await scan('<form><div class="error">Your username is incorrect.</div><input name="name"><input name="email"></form>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].selector).toContain("div.error");
  });
  it("keeps judgments about vague or color-only indicators as Potential Issues", async () => {
    const vague = await scan('<form><div><label for="field">Email</label><input id="field"><span class="error">Invalid</span></div></form>');
    const colorOnly = await scan('<div class="has-error"><input style="border:2px solid red"></div>');
    expect(vague.issues).toHaveLength(1);
    expect(vague.issues[0].type).toBe("Potential Issue");
    expect(vague.issues[0].description).toContain("explains the cause");
    expect(colorOnly.issues).toHaveLength(1);
    expect(colorOnly.issues[0].description).toContain("no associated textual error indicator");
    expect(colorOnly.issues[0].type).toBe("Potential Issue");
  });
  it("isolates unrelated forms and ignores success announcements and empty placeholders", async () => {
    const result = await scan(`<form><div class="error">Your form has errors</div><input name="first"></form>
      <form><div role="alert">Saved successfully</div><span id="error-placeholder"></span><input name="second"></form>`);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.filter((issue) => issue.description.includes("form-level error"))).toHaveLength(1);
    expect(result.issues.filter((issue) => issue.description.includes("No error indicator is currently observed"))).toHaveLength(1);
  });
  it("never submits, focuses fields, mutates the DOM, or dispatches validation events", async () => {
    const result = await scan('<form><input type="email" required value="abc@"><button type="submit">Submit</button></form>');
    expect(result.events).toEqual([0, 0, 0]);
    expect(result.unchanged).toBe(true);
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it("runs in standard scans, preserves mixed outcomes, and respects selected rules", async () => {
    const html = '<input id="confirmed" aria-invalid="true"><div role="textbox" id="review">Custom field</div>';
    const standard = await scan(html, null);
    expect(standard.issues.map((issue) => issue.type)).toEqual(["Issue", "Potential Issue"]);
    const excluded = await scan(html, ["ACT-R90"]);
    expect(excluded.issues).toEqual([]);
    expect(excluded.status?.status).toBe("not-selected");
  });
});
