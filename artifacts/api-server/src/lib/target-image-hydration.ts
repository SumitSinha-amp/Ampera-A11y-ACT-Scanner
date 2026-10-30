import type { Frame, Page } from "puppeteer";

/**
 * Load only images inside pointer controls before measuring target geometry.
 * The caller's request gate allows these URLs, including responsive candidates;
 * unrelated page artwork, fonts and media stay blocked.
 */
export async function hydrateTargetImages(
  page: Page,
  allowedUrls: Set<string>,
  timeoutMs = 2000,
): Promise<void> {
  await Promise.all(page.frames().map(async (frame: Frame) => {
    try {
      const urls = await frame.evaluate(() => {
        const targets = "a,button,[role='button'],[role='link'],[onclick],[tabindex]";
        return Array.from(document.images).filter(img => img.closest(targets)).flatMap(img => {
          const values = [img.currentSrc, img.getAttribute("src"), img.getAttribute("data-src")];
          for (const node of [img, ...Array.from(img.closest("picture")?.querySelectorAll("source") ?? [])]) {
            const srcset = node.getAttribute("srcset") || node.getAttribute("data-srcset") || "";
            // Browser-selected currentSrc is authoritative; candidates allow a
            // responsive picture to select a different source on retry.
            for (const candidate of srcset.split(",")) values.push(candidate.trim().split(/\s+/)[0]);
          }
          return values.filter((value): value is string => !!value).flatMap(value => {
            try { return [new URL(value, document.baseURI).href]; } catch { return []; }
          });
        });
      });
      for (const url of urls) allowedUrls.add(url);
      await frame.evaluate(async (timeout) => {
        const images = Array.from(document.images).filter(img =>
          img.closest("a,button,[role='button'],[role='link'],[onclick],[tabindex]") &&
          (!img.complete || img.naturalWidth === 0),
        );
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settled = Promise.all(images.map(img => new Promise<void>(resolve => {
          let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
          const done = () => {
            if (cleanupTimer) clearTimeout(cleanupTimer);
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          img.loading = "eager";
          for (const source of Array.from(img.closest("picture")?.querySelectorAll("source") ?? [])) {
            const srcset = source.getAttribute("srcset") || source.getAttribute("data-srcset");
            if (srcset) { source.removeAttribute("srcset"); source.setAttribute("srcset", srcset); }
          }
          const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
          const src = img.getAttribute("src") || img.getAttribute("data-src") || img.currentSrc;
          if (srcset) { img.removeAttribute("srcset"); img.setAttribute("srcset", srcset); }
          if (src) { img.removeAttribute("src"); img.setAttribute("src", src); }
          // Release event listeners even if this resource never settles.
          cleanupTimer = setTimeout(done, timeout);
          if (!src && !srcset) done();
        })));
        await Promise.race([settled, new Promise<void>(resolve => { timer = setTimeout(resolve, timeout); })]);
        if (timer) clearTimeout(timer);
      }, timeoutMs);
    } catch {
      // Detached/inaccessible frames must not abort the main document scan.
      // Unresolved target artwork remains a review finding in the browser rule.
    }
  }));
}
