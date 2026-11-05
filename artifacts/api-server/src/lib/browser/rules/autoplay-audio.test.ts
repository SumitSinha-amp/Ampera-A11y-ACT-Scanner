import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { combineAutoplayOutcomes, type AutoplayOutcome } from "./autoplay-audio";

describe("Alfa R50 three-valued OR", () => {
  const outcomes: AutoplayOutcome[] = ["passed", "failed", "undetermined"];
  for (const duration of outcomes) for (const mechanism of outcomes) {
    it(`${duration} OR ${mechanism}`, () => {
      const expected = duration === "passed" || mechanism === "passed" ? "passed"
        : duration === "failed" && mechanism === "failed" ? "failed" : "undetermined";
      expect(combineAutoplayOutcomes(duration, mechanism)).toBe(expected);
    });
  }
});

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R50 autoplay audio composite and embedded review", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(html: string, options: { duration?: number; playbackRate?: number; audioTracks?: number; standard?: boolean; rules?: string[] } = {}) {
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on("request", request => { void request.abort(); });
      await page.setContent(`<!doctype html><html lang="en"><head><title>Autoplay fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate(options => {
        for (const media of document.querySelectorAll("audio,video")) {
          if (options.duration !== undefined) Object.defineProperty(media, "duration", { value: options.duration });
          if (options.playbackRate !== undefined) (media as HTMLMediaElement).playbackRate = options.playbackRate;
          if (options.audioTracks !== undefined) Object.defineProperty(media, "audioTracks", { value: { length: options.audioTracks } });
        }
        let calls = 0;
        HTMLMediaElement.prototype.play = function () { calls++; return Promise.resolve(); };
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules({ rules: options.standard ? undefined : options.rules ?? ["ACT-R50"] });
        return { ...result, unchanged: before === document.documentElement.outerHTML, playbackCalls: calls };
      }, options);
    } finally { await page.close(); }
  }
  const youtube = '<iframe id="music" width="0" height="0" src="https://www.youtube.com/embed/0pbaa-3fvn8?autoplay=1&amp;loop=1&amp;controls=0" allow="autoplay"></iframe>';
  it("finds the SpaceHey zero-dimension player once without proving audible playback", async () => {
    const result = await scan(youtube);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ ruleId: "ACT-R50", type: "Potential Issue", selector: "iframe#music" });
    expect(result.issues[0].description).toContain("zero dimensions");
    expect(result.issues[0].description).toContain("controls are disabled");
    expect(result.issues[0].description).toContain("ACT-R48: undetermined; ACT-R49: undetermined");
    expect(result.unchanged).toBe(true);
    expect(result.playbackCalls).toBe(0);
  });
  it("runs in standard scans, not only explicit selection", async () => {
    const result = await scan(youtube, { standard: true });
    expect(result.issues.filter((i: any) => i.ruleId === "ACT-R50")).toHaveLength(1);
  });
  it("does not leak prerequisite or unrelated findings in R50-only scans", async () => {
    const result = await scan('<audio autoplay src="/audio.mp3"></audio>' + youtube);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((i: any) => i.ruleId === "ACT-R50" && i.type === "Potential Issue")).toBe(true);
    expect(result.stats.find((s: any) => s.ruleId === "ACT-R50")?.totalChecked).toBe(2);
  });
  it("honors exclusion of R50", async () => {
    expect((await scan(youtube, { rules: ["ACT-R1"] })).issues.some((i: any) => i.ruleId === "ACT-R50")).toBe(false);
  });
  it.each([
    '<audio src="/audio.mp3"></audio>',
    '<audio autoplay></audio>',
    '<audio autoplay muted src="/audio.mp3"></audio>',
    '<video autoplay muted src="/movie.mp4"></video>',
    '<audio autoplay paused src="/audio.mp3"></audio>',
  ])("excludes native media outside Alfa applicability: %s", async html => {
    expect((await scan(html)).issues).toHaveLength(0);
  });
  it.each([1, 3])("excludes a known non-looping %s-second source", async duration => {
    expect((await scan('<audio autoplay src="/audio.mp3"></audio>', { duration })).issues).toHaveLength(0);
  });
  it("does not exempt a short looping source", async () => {
    expect((await scan('<audio autoplay loop src="/audio.mp3"></audio>', { duration: 1 })).issues[0].type).toBe("Potential Issue");
  });
  it("does not exempt a short source slowed down beyond three seconds", async () => {
    expect((await scan('<audio autoplay src="/audio.mp3"></audio>', { duration: 2, playbackRate: 0.5 })).issues[0].type).toBe("Potential Issue");
  });
  it("does not equate long container duration with verified audio-output duration", async () => {
    expect((await scan('<audio autoplay src="/audio.mp3"></audio>', { duration: 30 })).issues[0].type).toBe("Potential Issue");
  });
  it("accepts perceivable native controls even when duration remains unknown", async () => {
    expect((await scan('<audio controls autoplay src="/audio.mp3"></audio>')).issues).toHaveLength(0);
  });
  it.each([
    '<audio controls autoplay style="display:none" src="/audio.mp3"></audio>',
    '<div aria-hidden="true"><audio controls autoplay src="/audio.mp3"></audio></div>',
    '<audio controls autoplay style="width:0;height:0" src="/audio.mp3"></audio>',
  ])("does not accept inaccessible native controls: %s", async html => {
    expect((await scan(html)).issues[0].type).toBe("Potential Issue");
  });
  it("keeps custom controls unresolved instead of proving failure or accepting a button label", async () => {
    const result = await scan('<audio id="a" autoplay src="/audio.mp3"></audio><button aria-controls="a" onclick="document.getElementById(\'a\').pause()">Pause</button>');
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.playbackCalls).toBe(0);
    expect(result.unchanged).toBe(true);
  });
  it("excludes confirmed-silent video", async () => {
    expect((await scan('<video autoplay src="/movie.mp4"></video>', { audioTracks: 0 })).issues).toHaveLength(0);
  });
  it.each([undefined, 1])("covers video with unknown or present audio tracks: %s", async audioTracks => {
    expect((await scan('<video autoplay src="/movie.mp4"></video>', { audioTracks })).issues[0].type).toBe("Potential Issue");
  });
  it.each([
    'https://www.youtube-nocookie.com/embed/id?autoplay=1&controls=0',
    'https://player.vimeo.com/video/123?autoplay=1&controls=0',
  ])("reviews supported embedded autoplay: %s", async src => {
    expect((await scan(`<iframe src="${src}"></iframe>`)).issues[0].type).toBe("Potential Issue");
  });
  it.each([
    'https://www.youtube.com/embed/id?controls=0',
    'https://www.youtube.com/embed/id?autoplay=1&mute=1',
    'https://player.vimeo.com/video/123?autoplay=1&muted=1',
    'https://player.vimeo.com/video/123?autoplay=1&background=1',
    'https://www.youtube.com.evil.invalid/embed/id?autoplay=1',
    'https://example.com/?autoplay=1',
    'https://www.youtube.com/watch?v=id&autoplay=1',
  ])("does not infer audible autoplay from unrelated, idle or muted frames: %s", async src => {
    expect((await scan(`<iframe allow="autoplay" src="${src}"></iframe>`)).issues).toHaveLength(0);
  });
  it("does not certify iframe controls merely because their URL enables controls", async () => {
    expect((await scan('<iframe src="https://www.youtube.com/embed/id?autoplay=1&controls=1"></iframe>')).issues[0].type).toBe("Potential Issue");
  });
});
