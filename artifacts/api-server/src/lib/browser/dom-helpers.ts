import { getAccessibleName } from "./accname";
import { isRendered } from "./visibility";

// ─── HELPER: CSS selector generation ────────────────────────────────────────

/** Classes that change between renders/sessions and make selectors fragile. */
function isStableClass(cls: string): boolean {
  if (cls.length < 3 || cls.length > 40) return false;
  // state/behavior classes toggled by JS
  if (/^(js-|is-|has-|active|open|hover|focus|visible|hidden|show|hide|selected|current|loading|loaded)/i.test(cls)) return false;
  // CSS-modules / build hashes: long digit runs or hash-like suffixes
  if (/\d{3,}/.test(cls)) return false;
  if (/(^|[_-])[a-z0-9]{6,}$/i.test(cls) && /[0-9]/.test(cls) && /[a-z]/i.test(cls) && !/[aeiou]{1}/i.test(cls.slice(-6))) return false;
  return true;
}

/** IDs that look auto-generated (React useId, uuid-ish, numeric suffixes). */
function isStableId(id: string): boolean {
  if (!id || id.length > 64) return false;
  if (/^:.*:$/.test(id)) return false;                 // React useId
  if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(id)) return false; // uuid fragment
  if (/\d{5,}/.test(id)) return false;                 // long numeric run
  return true;
}

function buildSegment(current: Element): string {
  let sel = current.tagName.toLowerCase();
  if (current.className && typeof current.className === "string") {
    const stable = current.className.trim().split(/\s+/).filter(isStableClass).slice(0, 2);
    if (stable.length) sel += `.${stable.map((c) => CSS.escape(c)).join(".")}`;
  }
  const parent: Element | null = current.parentElement;
  if (parent) {
    // nth-of-type is more robust than nth-child: unaffected by text/comment
    // siblings and by siblings of other tags being added/removed
    const sameTag = (Array.from(parent.children) as Element[]).filter((s) => s.tagName === current.tagName);
    if (sameTag.length > 1) {
      sel += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }
  }
  return sel;
}

export function getSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    if (current.id && isStableId(current.id)) {
      parts.unshift(`${current.tagName.toLowerCase()}#${CSS.escape(current.id)}`);
      break;
    }
    parts.unshift(buildSegment(current));
    current = current.parentElement;
  }
  const full = parts.join(" > ");

  // Verify the selector uniquely identifies the element; if a shorter suffix
  // is already unique, prefer it (shorter selectors survive DOM drift better)
  try {
    // Cap uniqueness probes to the 3 shortest suffixes — keeps per-element
    // cost bounded on very large DOMs while still preferring short selectors
    const minStart = Math.max(1, parts.length - 3);
    for (let start = parts.length - 1; start >= minStart; start--) {
      const candidate = parts.slice(start).join(" > ");
      const matches = document.querySelectorAll(candidate);
      if (matches.length === 1 && matches[0] === el) return candidate;
    }
    const matches = document.querySelectorAll(full);
    if (matches.length === 1 && matches[0] === el) return full;
    // Not unique — disambiguate the leaf with nth-of-type if missing
    if (matches.length > 1) {
      const idx = Array.from(matches).indexOf(el);
      if (idx >= 0 && !/:nth-of-type/.test(parts[parts.length - 1])) {
        return full; // keep hierarchical selector; caller tools fall back gracefully
      }
    }
  } catch { /* invalid selector edge case — fall through */ }
  return full;
}

export function outerHtmlSnippet(el: Element): string {
  const clone = el.cloneNode(false) as Element;
  return clone.outerHTML.substring(0, 2000);
}

export function elementContextForAI(el: Element): string {
  const STRIP_TAGS = ["picture", "source", "noscript", "script", "style", "svg", "video", "audio", "canvas", "iframe", "object", "embed"];
  function cleanClone(node: Element): Element {
    const c = node.cloneNode(true) as Element;
    for (const tag of STRIP_TAGS) {
      Array.from(c.querySelectorAll(tag)).forEach(function(child) { child.remove(); });
    }
    Array.from(c.querySelectorAll("img")).forEach(function(img) {
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("data:") || src.length > 120) img.removeAttribute("src");
      img.removeAttribute("srcset");
      img.removeAttribute("data-srcset");
      img.removeAttribute("data-src");
    });
    return c;
  }
  const clone = cleanClone(el);
  const parts: string[] = [clone.outerHTML];
  for (const attr of ["aria-labelledby", "aria-describedby"]) {
    const val = el.getAttribute(attr);
    if (val) {
      for (const id of val.trim().split(/\s+/)) {
        if (!id) continue;
        const target = document.getElementById(id);
        if (target) {
          parts.push(`\n<!-- ${attr} #${id} -->\n${target.outerHTML.substring(0, 600)}`);
        }
      }
    }
  }
  const hasAriaRef = el.hasAttribute("aria-labelledby") || el.hasAttribute("aria-describedby");
  const ownText = (el.textContent ?? "").trim();
  if (hasAriaRef && ownText.length < 30 && el.parentElement) {
    const parentClone = cleanClone(el.parentElement);
    parts.push(`\n<!-- parent element (sibling context) -->\n${parentClone.outerHTML.substring(0, 1200)}`);
  }
  return parts.join("").substring(0, 4000);
}

// ─── HELPER: isRendered ──────────────────────────────────────────────────────
// Alfa "isRendered" = CSS-only check (display:none / visibility:hidden / aria-hidden / [hidden]).

export function getSubtreeText(el: Element, visited?: WeakSet<Element>): string {
  if (!visited) visited = new WeakSet();
  if (visited.has(el)) return "";
  visited.add(el);
  let text = "";
  const BLOCK_TAGS = new Set(["div","p","section","article","aside","header","footer","main","nav","h1","h2","h3","h4","h5","h6","li","tr","td","th","blockquote","dt","dd","figcaption","summary"]);
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (child.getAttribute("aria-hidden") === "true") continue;
      const tag = child.tagName.toUpperCase();
      if (tag === "IMG") {
        const alt = child.getAttribute("alt");
        if (alt) text += alt + " ";
      } else {
        const childText = getSubtreeText(child, visited);
        if (childText) {
          // Add space between block-level children
          if (BLOCK_TAGS.has(child.tagName.toLowerCase()) && text && !text.endsWith(" ")) {
            text += " ";
          }
          text += childText;
        }
      }
    }
  }
  return text.trim().replace(/\s+/g, " ");
}

// ─── HELPER: getVisibleText (strips aria-hidden subtrees) ────────────────────
export function getVisibleText(el: Element): string {
  let text = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (child.getAttribute("aria-hidden") !== "true") {
        text += getVisibleText(child);
      }
    }
  });
  return text.trim().replace(/\s+/g, " ");
}

// ─── HELPER: getAccessibleName ────────────────────────────────────────────────
// AccName 1.1: aria-labelledby → aria-label → native sources → title → subtree.
// Alfa improvement: circular ref protection via visited WeakSet.
