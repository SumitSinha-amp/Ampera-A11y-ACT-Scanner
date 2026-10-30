/**
 * Recognize a small, non-executing subset of collapse scripts. Anything else
 * needs review: never click arbitrary controls, call page functions, or infer
 * behavior merely from aria-expanded / aria-controls.
 */
export function safeDisplayCollapseTarget(control: Element): HTMLElement | SVGElement | null {
  const handler = (control.getAttribute("onclick") || "").trim();
  const direct = /^document\.getElementById\(\s*(["'])([^"']+)\1\s*\)\.style\.display\s*=\s*(["'])none\3\s*;?$/.exec(handler);
  let targetId = direct?.[2];
  if (!targetId) {
    const call = /^(?:return\s+)?([A-Za-z_$][\w$]*)\(\s*(["'])([^"']+)\2\s*\)\s*;?$/.exec(handler);
    if (!call) return null;
    // Reading a descriptor avoids invoking getters installed by the page.
    const fn = Object.getOwnPropertyDescriptor(window, call[1])?.value;
    if (typeof fn !== "function") return null;
    const source = Function.prototype.toString.call(fn);
    // The published R97 toggleHidden example, with arbitrary identifiers.
    // Only two statements are allowed, with no other calls or side effects.
    const body = /^function\s*(?:[A-Za-z_$][\w$]*)?\s*\(\s*([\w$]+)\s*\)\s*\{\s*(?:const|let|var)\s+([\w$]+)\s*=\s*document\.getElementById\(\s*([\w$]+)\s*\)\s*;\s*([\w$]+)\.style\.display\s*=\s*([\s\S]+?)\s*;\s*\}$/.exec(source);
    if (!body || body[1] !== body[3] || body[2] !== body[4]) return null;
    const toggle = /^([\w$]+)\.style\.display\s*===\s*(["'])(none|)\2\s*\?\s*(["'])(none|)\4\s*:\s*(["'])(none|)\6$/.exec(body[5]);
    if (!toggle || toggle[1] !== body[2]) return null;
    const switchesToHidden = toggle[3] === "none"
      ? toggle[5] === "" && toggle[7] === "none"
      : toggle[5] === "none" && toggle[7] === "";
    if (!switchesToHidden) return null;
    targetId = call[3];
  }
  const target = document.getElementById(targetId) as Element | null;
  return target instanceof HTMLElement || target instanceof SVGElement ? target : null;
}
