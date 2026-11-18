import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULE_REGISTRY } from "../registry";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R23 audio transcript review", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(html: string, rules?: string[]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<html lang="en"><head><title>Audio</title></head><body>${html}</body></html>`);
      await page.addScriptTag({ content: bundle });
      return await page.evaluate(selected => (window as any).__ampera.runAllRules({ rules: selected }), rules);
    } finally { await page.close(); }
  }
  it("runs in standard scans and excludes video", async () => {
    expect(RULE_REGISTRY.find(rule => rule.id === "ACT-R23")?.manual).toBe(false);
    const result = await scan('<audio controls src="/speech.mp3"></audio><video controls></video>');
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R23")).toHaveLength(1);
    expect(result.stats.find((stat: any) => stat.ruleId === "ACT-R23").totalChecked).toBe(1);
  });
  it("does not report unplayable hidden audio or idle controls-less audio", async () => {
    const result = await scan('<audio style="display:none" controls></audio><audio src="/idle.mp3"></audio>', ["ACT-R23"]);
    expect(result.issues).toHaveLength(0);
  });
  it.each([
    '<a href="/transcript">Read transcript</a>',
    '<p>Transcript: Hello and welcome to this audio presentation.</p>',
  ])("recognizes a perceivable transcript candidate %s", async alternative => {
    expect((await scan(`<div><audio controls></audio>${alternative}</div>`, ["ACT-R23"])).issues).toHaveLength(0);
  });
  it.each([
    '<p>No transcript available</p>',
    '<a style="display:none" href="/transcript">Transcript</a>',
    '<span id="title">Voice preview</span>',
  ])("does not treat missing, hidden, or generic descriptions as transcripts", async text => {
    expect((await scan(`<div><audio controls aria-describedby="title missing"></audio>${text}</div>`, ["ACT-R23"])).issues).toHaveLength(1);
  });
  const scriptedFixture = `
    <div>${Array.from({ length: 10 }, (_, i) => `<div class="sample" data-voice="voice${i}">Play ${i}</div>`).join("")}
    <audio id="backend" style="display:none" controls></audio></div>
    <script>
      let playbackCalls = 0;
      function playSample() {
        var name = $(this).attr("data-voice");
        var audio = document.getElementById("backend");
        var file = "/samples/" + name + ".mp3";
        audio.src = file; audio.play(); playbackCalls++;
      }
      window.jQuery = { _data: (el, key) => el.matches(".sample") ? {click: [{handler: playSample}]} : undefined };
    </script>`;
  it("finds ten distinct scripted samples without playing audio or duplicating the shared backend", async () => {
    const result = await scan(scriptedFixture, ["ACT-R23"]);
    expect(result.issues).toHaveLength(10);
    expect(new Set(result.issues.map((issue: any) => issue.selector)).size).toBe(10);
    expect(result.issues.every((issue: any) => issue.type === "Potential Issue")).toBe(true);
    expect(result.stats.find((stat: any) => stat.ruleId === "ACT-R23").totalChecked).toBe(10);
    expect(result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R23").status).toBe("executed");
  });
  it("preserves explicit rule selection", async () => {
    const result = await scan(scriptedFixture, ["ACT-R22"]);
    expect(result.issues.some((issue: any) => issue.ruleId === "ACT-R23")).toBe(false);
  });
  it("skips non-function event records without losing valid samples or other rule findings", async () => {
    const fixture = scriptedFixture.replace(
      "click: [{handler: playSample}]",
      `click: [{handler: false}, null, undefined, {}, {handler: "not a function"},
        {handler: {}}, {get handler() {throw new Error("unreadable handler")}},
        {handler: playSample}]`,
    );
    const result = await scan(`${fixture}<img src="/example.png">`, ["ACT-R23", "ACT-R2"]);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R23")).toHaveLength(10);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R2")).toHaveLength(1);
    expect(result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R23").status).toBe("executed");
  });
  it.each(["{click: {handler: false}}", "{click: false}", "{click: null}"])(
    "keeps native audio checks running with an unsupported event cache: %s",
    async events => {
      const result = await scan(`<audio controls src="/speech.mp3"></audio>
        <script>window.jQuery = {_data: () => (${events})};</script>`, ["ACT-R23"]);
      expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R23")).toHaveLength(1);
    },
  );
  it("keeps native audio checks running when the page event cache throws", async () => {
    const result = await scan(`<audio controls src="/speech.mp3"></audio>
      <script>window.jQuery = {_data: () => {throw new Error("unsupported cache")}};</script>`, ["ACT-R23"]);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R23")).toHaveLength(1);
  });
  it("R30-only scans assess ten scripted samples without leaking prerequisite findings", async () => {
    const result = await scan(scriptedFixture, ["ACT-R30"]);
    expect(result.issues).toHaveLength(10);
    expect(result.issues.every((issue: any) =>
      issue.ruleId === "ACT-R30" && issue.type === "Potential Issue" &&
      issue.description.includes("ACT-R23: undetermined; ACT-R29: undetermined"),
    )).toBe(true);
    expect(new Set(result.issues.map((issue: any) => issue.selector)).size).toBe(10);
    expect(result.stats).toEqual([{ ruleId: "ACT-R30", totalChecked: 10, scope: "element" }]);
    expect(result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R30").status).toBe("executed");
  });
  it("keeps standard R23 coverage alongside R30 and does not duplicate shared backends", async () => {
    const result = await scan(scriptedFixture);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R23")).toHaveLength(10);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R30")).toHaveLength(10);
    expect(result.stats.find((stat: any) => stat.ruleId === "ACT-R30").totalChecked).toBe(10);
  });
  it("retains legacy R30 coverage for visible native audio", async () => {
    const result = await scan('<audio controls src="/speech.mp3"></audio>', ["ACT-R30"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it("R30 does not treat an unverified transcript candidate as a passed R23", async () => {
    const result = await scan('<div><audio controls></audio><a href="/transcript">Read transcript</a></div>', ["ACT-R23", "ACT-R30"]);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R23")).toHaveLength(0);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R30")).toHaveLength(1);
    expect(result.issues[0].description).toContain("Possible transcript or alternative markup was detected");
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it("does not emit R30 for videos or inaccessible unbound hidden audio", async () => {
    const result = await scan('<video controls></video><audio controls hidden></audio>', ["ACT-R30"]);
    expect(result.issues).toHaveLength(0);
    expect(result.stats).toHaveLength(0);
  });
  it("keeps R30 separate from R29 emission, which is not a verified outcome", async () => {
    const result = await scan('<div><audio controls></audio><p>Audio alternative for the text on this page</p></div>', ["ACT-R29", "ACT-R30"]);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R29")).toHaveLength(0);
    expect(result.issues.filter((issue: any) => issue.ruleId === "ACT-R30")).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it("reads inline bindings when a later jQuery instance has no original event cache", async () => {
    const fixture = scriptedFixture.replace(
      'window.jQuery = { _data: (el, key) => el.matches(".sample") ? {click: [{handler: playSample}]} : undefined };',
      `window.$ = () => ({on() {}});
       $(".sample").on("click", function () {
         var name = $(this).attr("data-voice");
         var audio = document.getElementById("backend");
         var file = "/samples/" + name + ".mp3";
         audio.src = file; audio.play();
       });
       window.jQuery = { _data: () => undefined };`,
    );
    expect((await scan(fixture, ["ACT-R23"])).issues).toHaveLength(10);
  });
  it("does not read fake player bindings inside script string literals", async () => {
    const html = `<div class="sample" data-voice="one">Play</div><audio id="backend" hidden></audio>
      <script>const example = '$(".sample").on("click", function () {var name = $(this).attr("data-voice");var audio = document.getElementById("backend");var file = "/samples/" + name + ".mp3";audio.src=file;audio.play();})';</script>`;
    expect((await scan(html, ["ACT-R23"])).issues).toHaveLength(0);
  });
  it("ignores lookalike cards whose handlers do not play audio", async () => {
    const result = await scan(scriptedFixture.replace('audio.src = file; audio.play();', 'audio.src = file;'), ["ACT-R23"]);
    expect(result.issues).toHaveLength(0);
  });
});
