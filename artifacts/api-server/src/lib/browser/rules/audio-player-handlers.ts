import { parse, type Node } from "acorn";

interface Expression extends Node {
  callee?: Expression;
  object?: Expression;
  property?: Expression;
  arguments?: Expression[];
  value?: unknown;
  name?: string;
}

/** Read literal jQuery click bindings from inline code without executing it.
 * This also works when a second jQuery version replaced the global instance
 * after the page registered its players.
 */
export function getInlineAudioHandlers(): { target: Element; code: string }[] {
  const handlers: { target: Element; code: string }[] = [];
  let budget = 1_000_000;
  for (const script of document.querySelectorAll("script:not([src])")) {
    const code = script.textContent ?? "";
    if (code.length > 250_000 || code.length > budget ||
        !code.includes("getElementById") || !/\.play\s*\(/.test(code)) continue;
    budget -= code.length;
    let tree: Node;
    try { tree = parse(code, { ecmaVersion: "latest", sourceType: "script" }); }
    catch { continue; }
    const pending = [tree];
    while (pending.length) {
      const node = pending.pop()! as Expression;
      if (node.type === "CallExpression") {
        const member = node.callee;
        const method = member?.property?.name;
        const binding = member?.object;
        const name = binding?.callee?.name;
        const selector = binding?.arguments?.[0]?.value;
        const args = node.arguments ?? [];
        const callback = method === "click" ? args[0]
          : method === "on" && args[0]?.value === "click" ? args[1] : undefined;
        if ((name === "$" || name === "jQuery") && typeof selector === "string" &&
            callback && (callback.type === "FunctionExpression" || callback.type === "ArrowFunctionExpression")) {
          try {
            for (const target of document.querySelectorAll(selector)) {
              handlers.push({ target, code: code.slice(callback.start, callback.end) });
            }
          } catch { /* Invalid or jQuery-only selectors are not guessed. */ }
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === "object" && typeof child.type === "string") pending.push(child);
          }
        } else if (value && typeof value === "object" && "type" in value) {
          pending.push(value as Node);
        }
      }
    }
  }
  return handlers;
}
