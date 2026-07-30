import { getSubtreeText } from "./dom-helpers";

export function getAccessibleName(el: Element, visited?: WeakSet<Element>): string {
  if (!visited) visited = new WeakSet();
  if (visited.has(el)) return "";
  visited.add(el);

  // 1. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const name = labelledBy
      .trim()
      .split(/\s+/)
      .map((id) => {
        const ref = document.getElementById(id);
        if (!ref || visited!.has(ref)) return "";
        // Referenced nodes use the same recursive name computation as their
        // owner. This matters for nested aria-labelledby, image alt text,
        // hidden referenced labels, and cycle protection.
        return getAccessibleName(ref, visited);
      })
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) return name;
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim().replace(/\s+/g, " ");

  // 3. Native sources by element type
  if (el instanceof HTMLInputElement) {
    const type = el.type?.toLowerCase() || "text";
    if (type === "image") return el.alt?.trim() || el.title?.trim() || "";
    if (type === "submit") return el.value?.trim() || "Submit";
    if (type === "reset") return el.value?.trim() || "Reset";
    if (type === "button") return el.value?.trim() || "";
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      const t = clone.textContent?.trim();
      if (t) return t;
    }
    if (el.placeholder) return el.placeholder;
  }

  if (el instanceof HTMLSelectElement) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      const t = clone.textContent?.trim();
      if (t) return t;
    }
  }

  if (el instanceof HTMLTextAreaElement) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      const t = clone.textContent?.trim();
      if (t) return t;
    }
    if (el.placeholder) return el.placeholder;
  }

  if (el instanceof HTMLImageElement) {
    return el.alt?.trim() || "";
  }

  // Alfa: SVG <title> as accessible name
  if (el.tagName.toLowerCase() === "svg") {
    const titleEl = el.querySelector("title");
    if (titleEl && titleEl.textContent?.trim()) return titleEl.textContent.trim();
  }

  // 4. title fallback
  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();

  // 5. Subtree text (strips aria-hidden children, includes img alt)
  // NOTE: el was added to `visited` above for aria-labelledby cycle detection;
  // remove it before descending or getSubtreeText bails out immediately and
  // every text-named element (headings, links) gets an empty name.
  visited.delete(el);
  return getSubtreeText(el, visited);
}

// ─── HELPER: getVisibleLabel (form field visible label) ──────────────────────
export function getVisibleLabel(el: Element): string {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      return clone.textContent?.trim() || "";
    }
    if (el instanceof HTMLInputElement && el.placeholder) return el.placeholder;
    if (el instanceof HTMLTextAreaElement && el.placeholder) return el.placeholder;
  }
  return el.textContent?.trim() || "";
}

// ─── HELPER: isInsideLandmark ─────────────────────────────────────────────────
// <section> is landmark ONLY with aria-label/aria-labelledby (not title).
export function isInsideLandmark(el: Element): boolean {
  const landmarkRoles = ["main","navigation","complementary","contentinfo","banner","search","form","region"];
  const alwaysLandmarkTags = ["main","nav","aside","form"];
  const sectioningTags = ["article","aside","main","nav","section"];
  let node: Element | null = el.parentElement;
  while (node && node !== document.body) {
    const tag = node.tagName.toLowerCase();
    if (alwaysLandmarkTags.includes(tag)) return true;
    if (tag === "section") {
      if (node.hasAttribute("aria-label") || node.hasAttribute("aria-labelledby")) return true;
    }
    if (tag === "header" || tag === "footer") {
      const parentTag = (node.parentElement?.tagName || "").toLowerCase();
      if (!sectioningTags.includes(parentTag)) return true;
    }
    const role = node.getAttribute("role");
    if (role && landmarkRoles.includes(role)) return true;
    node = node.parentElement;
  }
  return false;
}


// Siteimprove/Alfa do not count placeholder as a valid accessible name.
export function getFormFieldAccessibleName(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const name = labelledBy.trim().split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() || "")
      .filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) { const t = label.textContent?.trim(); if (t) return t; }
  }
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
    const t = clone.textContent?.trim();
    if (t) return t;
  }
  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();
  return "";
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN RULES FUNCTION
