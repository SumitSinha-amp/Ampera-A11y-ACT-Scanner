/**
 * Rule-Based Accessibility Fix Engine
 * Runs entirely in the browser — no API calls, zero latency.
 * For each ACT rule violation, provides context-aware "why" + "how to fix" guidance.
 */

export interface FixSuggestion {
  why: string;
  howToFix: string;
  codeExample?: string;
  confidence: "high" | "medium" | "low";
  needsExternalAI: boolean;
}

interface ParsedEl {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  html: string;
}

function parseEl(html: string): ParsedEl {
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const el = doc.body.firstElementChild;
    if (!el) return { tag: "", attrs: {}, text: "", html };
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
    return { tag: el.tagName.toLowerCase(), attrs, text: (el.textContent ?? "").trim(), html };
  } catch {
    return { tag: "", attrs: {}, text: "", html };
  }
}

function attr(el: ParsedEl, name: string): string {
  return el.attrs[name] ?? "";
}

function short(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function codeBlock(code: string): string {
  return code.trim();
}

type Handler = (p: { ruleId: string; description: string; el: ParsedEl; selector: string }) => FixSuggestion;

const HIGH: FixSuggestion["confidence"] = "high";
const MED: FixSuggestion["confidence"] = "medium";
const LOW: FixSuggestion["confidence"] = "low";

// ─── Rule Handlers ────────────────────────────────────────────────────────────

const handlers: Record<string, Handler> = {

  // ── Images ───────────────────────────────────────────────────────────────────

  "ACT-R5": ({ el }) => {
    const src = attr(el, "src") || attr(el, "data-src") || "image.png";
    const srcBase = src.split("/").pop()?.split("?")[0] ?? "image";
    const isDecorative = el.tag === "img" && !attr(el, "role") && !attr(el, "alt");
    return {
      why: `This image (<code>${short(el.html, 50)}</code>) has no <code>alt</code> attribute. Screen readers will announce the filename "${srcBase}" instead of meaningful content, leaving visually impaired users without context.`,
      howToFix: isDecorative
        ? `If the image is purely decorative, add <code>alt=""</code> so screen readers skip it. If it conveys meaning, describe that meaning in the alt text.`
        : `Add a concise <code>alt</code> attribute describing what the image shows or its function.`,
      codeExample: codeBlock(`<!-- Informative image -->
<img src="${short(src, 40)}" alt="Brief description of what the image shows" />

<!-- Decorative image (no meaning) -->
<img src="${short(src, 40)}" alt="" role="presentation" />`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R6": ({ el }) => {
    const currentAlt = attr(el, "alt");
    const tag = el.tag;
    const isInsideLink = el.html.includes("<a ");
    return {
      why: `This ${tag === "img" ? "image" : "element"} is used as a ${isInsideLink ? "link" : "button"} but ${currentAlt ? `has a non-descriptive alt "${short(currentAlt, 40)}"` : "has no alt text"}. Screen reader users cannot determine the ${isInsideLink ? "link destination" : "button action"}.`,
      howToFix: `The alt text should describe the ${isInsideLink ? "destination or purpose of the link" : "action the button performs"}, not the image appearance.`,
      codeExample: codeBlock(isInsideLink
        ? `<a href="/products">\n  <img src="arrow.png" alt="View all products" />\n</a>`
        : `<button>\n  <img src="search-icon.png" alt="Search" />\n</button>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Links ─────────────────────────────────────────────────────────────────────

  "ACT-R14": ({ el, description }) => {
    const text = el.text || description;
    const href = attr(el, "href") || "#";
    return {
      why: `The link text "${short(text, 50)}" is used multiple times on this page but points to different destinations. When screen reader users navigate by links, they hear the same text with no way to distinguish which link goes where.`,
      howToFix: `Make each link's visible text unique, or use <code>aria-label</code> / <code>aria-describedby</code> to add a unique accessible name that gives context.`,
      codeExample: codeBlock(`<!-- Option 1: Unique visible text -->
<a href="${short(href, 40)}">View More Products</a>
<a href="/blog">View More Articles</a>

<!-- Option 2: Hidden context via aria-label -->
<a href="${short(href, 40)}" aria-label="View more — Products section">View More</a>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R15": ({ el }) => {
    const text = el.text || attr(el, "aria-label") || "link";
    const href = attr(el, "href") || "#";
    return {
      why: `The link "${short(text, 50)}" doesn't convey its purpose when read out of context. Generic phrases like "click here", "read more", or "learn more" are meaningless to screen reader users navigating a list of links.`,
      howToFix: `Either change the visible text to describe the destination, or supplement it with <code>aria-label</code>.`,
      codeExample: codeBlock(`<!-- Before -->
<a href="${short(href, 40)}">Read more</a>

<!-- After: descriptive text -->
<a href="${short(href, 40)}">Read more about our accessibility policy</a>

<!-- After: aria-label -->
<a href="${short(href, 40)}" aria-label="Read more about our accessibility policy">Read more</a>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R62": ({ el }) => {
    const text = el.text || "link";
    return {
      why: `The link text "${short(text, 50)}" is ambiguous without surrounding context. Screen reader users often navigate via a links list where surrounding context is stripped away.`,
      howToFix: `Add visually hidden text inside the link or use <code>aria-label</code> to provide full context.`,
      codeExample: codeBlock(`<!-- Using visually hidden span -->
<a href="/report.pdf">
  Download
  <span class="sr-only"> Annual Accessibility Report (PDF)</span>
</a>

<!-- Using aria-label -->
<a href="/report.pdf" aria-label="Download Annual Accessibility Report PDF">Download</a>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Forms ─────────────────────────────────────────────────────────────────────

  "ACT-R13": ({ el }) => {
    const inputType = attr(el, "type") || "text";
    const inputId = attr(el, "id") || "field-name";
    const placeholder = attr(el, "placeholder");
    return {
      why: `This <code>${el.tag}</code> input (type="${inputType}") has no associated <code>&lt;label&gt;</code>. ${placeholder ? `The placeholder "${short(placeholder, 40)}" disappears when typing and is not a substitute for a label.` : "Without a label, screen readers can't tell users what information to enter."}`,
      howToFix: `Associate a <code>&lt;label&gt;</code> element using <code>for</code>/<code>id</code> pairing, or use <code>aria-label</code> / <code>aria-labelledby</code>.`,
      codeExample: codeBlock(`<!-- Option 1: Visible label (preferred) -->
<label for="${inputId}">Email address</label>
<input type="${inputType}" id="${inputId}" />

<!-- Option 2: aria-label for space-constrained layouts -->
<input type="${inputType}" id="${inputId}" aria-label="Email address" />`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R46": ({ el }) => {
    const id = attr(el, "id") || "select-id";
    return {
      why: `This <code>&lt;select&gt;</code> dropdown has no associated label. Screen readers will announce it as "combo box" with no indication of what the user is choosing.`,
      howToFix: `Add a <code>&lt;label for="..."&gt;</code> pointing to the select's <code>id</code>.`,
      codeExample: codeBlock(`<label for="${id}">Country</label>
<select id="${id}">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R50": ({ el }) => {
    return {
      why: `This form error is conveyed only through color or visual styling. Users who are colorblind or using a screen reader cannot perceive the error state.`,
      howToFix: `Identify the specific field in error with text, not just color. Use <code>aria-describedby</code> to associate the error message with the input, and <code>aria-invalid="true"</code> to signal the error state.`,
      codeExample: codeBlock(`<label for="email">Email</label>
<input
  id="email"
  type="email"
  aria-invalid="true"
  aria-describedby="email-error"
/>
<p id="email-error" role="alert">
  ⚠ Enter a valid email address (e.g. user@example.com)
</p>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R51": ({ description }) => {
    return {
      why: `Status messages (success confirmations, counts, loading states) are injected dynamically. Screen readers only announce content in focus or in ARIA live regions — this message "${short(description, 60)}" is likely missed.`,
      howToFix: `Wrap the status message in an element with <code>role="status"</code> (polite) or <code>role="alert"</code> (assertive) so screen readers announce it automatically.`,
      codeExample: codeBlock(`<!-- Polite announcement (doesn't interrupt) -->
<div role="status" aria-live="polite">
  3 results found
</div>

<!-- Alert (interrupts immediately — use for errors) -->
<div role="alert">
  Form submission failed. Please check your inputs.
</div>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R55": ({ el }) => {
    const inputType = attr(el, "type") || "text";
    const name = attr(el, "name") || attr(el, "autocomplete") || "";
    return {
      why: `This input (type="${inputType}") is missing the <code>autocomplete</code> attribute. Browsers and assistive technologies need this to help users with cognitive disabilities auto-fill common personal data.`,
      howToFix: `Add the <code>autocomplete</code> attribute with the appropriate token for this field type.`,
      codeExample: codeBlock(`<!-- Common autocomplete values -->
<input type="text" autocomplete="name" />
<input type="email" autocomplete="email" />
<input type="tel" autocomplete="tel" />
<input type="text" autocomplete="street-address" />
<input type="text" autocomplete="postal-code" />
<input type="password" autocomplete="current-password" />`),
      confidence: name ? HIGH : MED,
      needsExternalAI: false,
    };
  },

  "ACT-R74": ({ el }) => {
    return {
      why: `When a form field has an error, the error message must suggest how to correct it (not just that an error occurred). Users with cognitive or visual disabilities rely on specific guidance to understand what's wrong and how to fix it.`,
      howToFix: `The error message should include: (1) what was wrong, (2) an example of the correct format.`,
      codeExample: codeBlock(`<!-- Vague (fails) -->
<p id="date-error">Invalid date</p>

<!-- Descriptive (passes) -->
<p id="date-error">
  Enter the date in DD/MM/YYYY format — e.g. 25/12/2024
</p>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Headings ──────────────────────────────────────────────────────────────────

  "ACT-R19": ({ el }) => {
    const tag = el.tag || "h2";
    return {
      why: `This <code>&lt;${tag}&gt;</code> heading is empty. Screen reader users navigate pages by headings — an empty heading creates a confusing navigation landmark with no label.`,
      howToFix: `Either add visible text content to the heading, or remove it entirely if it serves no structural purpose. If the heading should be visually hidden (for accessibility), use a visually-hidden class rather than leaving it empty.`,
      codeExample: codeBlock(`<!-- Remove if unnecessary -->
<!-- <${tag}></${tag}> -->

<!-- Or add visually-hidden text -->
<${tag} class="sr-only">Section Title</${tag}>

<!-- .sr-only CSS -->
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R64": ({ description }) => {
    const match = description.match(/h(\d).*h(\d)/i);
    const from = match?.[1] ?? "1";
    const to = match?.[2] ?? "3";
    return {
      why: `The heading hierarchy jumps from <code>&lt;h${from}&gt;</code> to <code>&lt;h${to}&gt;</code>, skipping level${parseInt(to) - parseInt(from) > 1 ? "s" : ""} in between. Screen reader users rely on heading levels to understand document structure — skipped levels break the logical outline.`,
      howToFix: `Headings must descend sequentially (h1 → h2 → h3). If the visual styling is the concern, use CSS to change the appearance — not a different heading level.`,
      codeExample: codeBlock(`<!-- Wrong: skipped h2 -->
<h1>Page Title</h1>
<h3>Subsection</h3>  <!-- ⚠ skips h2 -->

<!-- Correct: sequential -->
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>

<!-- If you need h3 styling without the level, use CSS -->
<h2 class="visually-h3">Section</h2>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Page Structure ────────────────────────────────────────────────────────────

  "ACT-R20": ({ description }) => {
    const hasTitle = description.toLowerCase().includes("empty") || description.toLowerCase().includes("missing");
    return {
      why: `${hasTitle ? "The page <code>&lt;title&gt;</code> is empty or missing." : "The page title does not adequately describe the page."} Screen reader users hear the title first when a page loads — it's their primary way of confirming they're on the right page.`,
      howToFix: `The title should follow the pattern <em>Page Name — Site Name</em>. Each page must have a unique, descriptive title.`,
      codeExample: codeBlock(`<head>
  <!-- Bad -->
  <title>Home</title>

  <!-- Good: describes page + identifies site -->
  <title>Accessibility Scanner Dashboard — Ampera A11y Suite</title>
  <title>Scan Results: keysight.com — Ampera A11y Suite</title>
</head>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R35": ({ el }) => {
    const tag = el.tag || "div";
    return {
      why: `This content (<code>&lt;${tag}&gt;</code>) is not inside any landmark region (header, main, nav, footer, aside, section with label). Screen reader users navigate by landmarks to jump directly to sections — orphaned content is inaccessible to landmark navigation.`,
      howToFix: `Wrap the content in an appropriate HTML landmark element or add a <code>role</code> attribute.`,
      codeExample: codeBlock(`<!-- Wrap in appropriate landmark -->
<main>
  <${tag}>Your content here</${tag}>
</main>

<!-- Or add role to existing container -->
<div role="main">
  <${tag}>Your content here</${tag}>
</div>

<!-- Named region for non-standard landmarks -->
<section aria-label="Featured Products">
  <${tag}>Your content here</${tag}>
</section>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R36": ({ el }) => {
    return {
      why: `The page is missing a <code>lang</code> attribute on the <code>&lt;html&gt;</code> element (or the language is incorrect). Screen readers use this to select the correct language engine for pronunciation — without it, content may be read with the wrong accent or mispronounced entirely.`,
      howToFix: `Add the correct BCP 47 language tag to the <code>&lt;html&gt;</code> element.`,
      codeExample: codeBlock(`<!-- English -->
<html lang="en">

<!-- American English -->
<html lang="en-US">

<!-- British English -->
<html lang="en-GB">

<!-- French -->
<html lang="fr">

<!-- If parts of the page are in a different language -->
<p>The French for hello is <span lang="fr">bonjour</span>.</p>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── ARIA / IDs ────────────────────────────────────────────────────────────────

  "ACT-R3": ({ el, description }) => {
    const id = attr(el, "id") || description.match(/id="([^"]+)"/)?.[1] || "element-id";
    return {
      why: `The ID "${short(id, 50)}" is duplicated. ARIA relationships (<code>aria-labelledby</code>, <code>aria-describedby</code>, <code>for</code>) target IDs — when an ID is duplicated, the browser uses only the first match, causing the wrong element to be referenced.`,
      howToFix: `IDs must be unique per page. Rename duplicates with a suffix or a more specific name.`,
      codeExample: codeBlock(`<!-- Wrong: duplicate IDs -->
<label for="name">First Name</label>
<input id="name" type="text" />  <!-- first -->
<input id="name" type="text" />  <!-- duplicate — label points to wrong input -->

<!-- Fixed: unique IDs -->
<label for="first-name">First Name</label>
<input id="first-name" type="text" />

<label for="last-name">Last Name</label>
<input id="last-name" type="text" />`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R58": ({ el }) => {
    const id = attr(el, "id");
    return {
      why: `${id ? `The ID "${short(id, 40)}" appears more than once on this page.` : "Duplicate IDs were detected on this page."} The HTML spec requires IDs to be unique. Duplicate IDs cause unpredictable behavior with ARIA references and can break AT navigation.`,
      howToFix: `Audit all elements with this ID and rename them to be unique. Use data attributes or classes for shared styling hooks instead of shared IDs.`,
      codeExample: codeBlock(`<!-- Wrong -->
<div id="modal">First modal</div>
<div id="modal">Second modal</div>

<!-- Fixed -->
<div id="modal-confirmation">Confirm action</div>
<div id="modal-delete">Delete item</div>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R44": ({ el }) => {
    const tag = el.tag;
    return {
      why: `This <code>&lt;${tag}&gt;</code> table element lacks proper header associations. Screen readers announce cell content together with its header — without <code>&lt;th&gt;</code> elements or <code>scope</code>/<code>aria-label</code>, data cells have no context.`,
      howToFix: `Add <code>&lt;th scope="col"&gt;</code> for column headers and <code>&lt;th scope="row"&gt;</code> for row headers. For complex tables, use <code>id</code> + <code>headers</code> attributes.`,
      codeExample: codeBlock(`<table>
  <caption>Monthly Sales</caption>
  <thead>
    <tr>
      <th scope="col">Month</th>
      <th scope="col">Revenue</th>
      <th scope="col">Units</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">January</th>
      <td>$12,400</td>
      <td>248</td>
    </tr>
  </tbody>
</table>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Colour / Contrast ─────────────────────────────────────────────────────────

  "ACT-R30": ({ description }) => {
    const ratioMatch = description.match(/(\d+\.?\d*):1/);
    const ratio = ratioMatch?.[1] ?? "3.5";
    return {
      why: `The text contrast ratio is approximately ${ratio}:1, below the WCAG AA minimum of 4.5:1 for normal text. Low contrast makes text hard to read for users with low vision, cataracts, or in bright ambient light.`,
      howToFix: `Darken the text color or lighten the background until you reach at least 4.5:1 contrast. Use a contrast checker tool (WebAIM Contrast Checker or browser DevTools) to verify.`,
      codeExample: codeBlock(`/* Common failing patterns and fixes */

/* Grey text on white — fails */
color: #999999;  /* 2.85:1 — fail */

/* Darker grey — passes AA */
color: #767676;  /* 4.54:1 — pass AA */
color: #595959;  /* 7.0:1 — pass AAA */

/* Brand blue on white */
/* #4A90E2 fails (3.1:1) — use #1A5FAD instead (5.9:1) */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R31": ({ description }) => {
    const ratioMatch = description.match(/(\d+\.?\d*):1/);
    const ratio = ratioMatch?.[1] ?? "2.5";
    return {
      why: `The large/bold text has a contrast ratio of approximately ${ratio}:1, below the WCAG AA minimum of 3:1 for large text (18pt+ or 14pt+ bold). Even large text needs sufficient contrast for users with low vision.`,
      howToFix: `Increase contrast to at least 3:1. Large text (18px+ regular or 14px+ bold) has a lower threshold than normal text, so slight darkening usually fixes it.`,
      codeExample: codeBlock(`/* Large text minimum: 3:1 */
/* Normal text minimum: 4.5:1 */

/* Heading that fails */
h2 { color: #AAAAAA; font-size: 24px; }  /* 2.32:1 — fail */

/* Fixed */
h2 { color: #767676; font-size: 24px; }  /* 4.54:1 — pass */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R32": ({ description }) => {
    return {
      why: `This visible video appears to have no audio and no declared audio-description track. People who cannot see the video need the visual information conveyed through an audio alternative.`,
      howToFix: `Add an audio-description track, or provide an alternative version of the video whose audio describes the important visual information. Verify that the alternative covers meaningful actions, text, and scene changes.`,
      codeExample: codeBlock(`<!-- Provide an audio-description track for a visual-only video -->
<video controls>
  <source src="/media/process-demo.mp4" type="video/mp4" />
  <track
    kind="descriptions"
    src="/media/process-demo-descriptions.vtt"
    srclang="en"
    label="Audio descriptions"
  />
</video>`),
      confidence: MED,
      needsExternalAI: false,
    };
  },

  // ── Text Spacing ──────────────────────────────────────────────────────────────

  "ACT-R68": ({ el }) => {
    const tag = el.tag || "div";
    return {
      why: `This element has a fixed height that clips its text content when user-defined spacing overrides are applied (per WCAG 1.4.12 Text Spacing). Users who override line-height or letter-spacing for readability will see truncated content.`,
      howToFix: `Remove fixed <code>height</code> on text containers. Use <code>min-height</code> instead, and avoid <code>overflow: hidden</code> without a scrollable fallback.`,
      codeExample: codeBlock(`/* Failing pattern */
.card {
  height: 80px;         /* fixed — clips when text spacing increases */
  overflow: hidden;
}

/* Fixed */
.card {
  min-height: 80px;     /* grows with content */
  /* overflow: hidden;  — removed */
}

/* If overflow hidden is needed for layout, use max-height + overflow-y: auto */
.card {
  min-height: 80px;
  max-height: 200px;
  overflow-y: auto;
}`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R91": ({ description }) => {
    const match = description.match(/letter.spacing.*?([\d.]+)/i);
    const val = match?.[1] ?? "0.05em";
    return {
      why: `The CSS <code>letter-spacing</code> is set to ${val}, and the element prevents users from overriding it via <code>!important</code> or a non-overridable inline style. WCAG 1.4.12 requires that users can increase letter-spacing to 0.12em without loss of content.`,
      howToFix: `Remove <code>!important</code> from the <code>letter-spacing</code> declaration, and avoid inline styles that cannot be overridden.`,
      codeExample: codeBlock(`/* Failing */
.text { letter-spacing: 0.02em !important; }

/* Fixed — allows user override */
.text { letter-spacing: 0.02em; }

/* Also check inline styles in HTML */
<!-- Bad -->
<p style="letter-spacing: 0.02em">...</p>

<!-- Better: use a class -->
<p class="tracking-tight">...</p>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R92": ({ description }) => {
    return {
      why: `The <code>word-spacing</code> property is applied in a way that prevents user overrides. WCAG 1.4.12 requires that users can increase word-spacing to 0.16em without loss of content or functionality.`,
      howToFix: `Remove <code>!important</code> from <code>word-spacing</code> declarations and avoid inline styles.`,
      codeExample: codeBlock(`/* Failing */
.paragraph { word-spacing: -0.05em !important; }

/* Fixed */
.paragraph { word-spacing: normal; }

/* Test: simulate user override in DevTools */
* { word-spacing: 0.16em !important; }
/* — then verify no content is lost or clipped */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R93": ({ description }) => {
    const match = description.match(/line.height.*?([\d.]+)/i);
    const val = match?.[1] ?? "1.2";
    return {
      why: `The <code>line-height</code> is ${val}, and users cannot override it to the WCAG minimum of 1.5× the font size. Users with dyslexia or low vision depend on increased line spacing for readability.`,
      howToFix: `Set a relative <code>line-height</code> (unitless multiplier ≥ 1.5 is ideal) without <code>!important</code>, so users can override it.`,
      codeExample: codeBlock(`/* Failing — blocks override */
p { line-height: 1.1 !important; }
p { line-height: 16px !important; }  /* fixed px also blocks scaling */

/* Fixed */
p { line-height: 1.5; }       /* unitless: scales with font size */
p { line-height: 150%; }      /* also fine */

/* Test your page with */
* { line-height: 1.5 !important; } /* in DevTools — check nothing breaks */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Focus / Interaction ───────────────────────────────────────────────────────

  "ACT-R28": ({ description }) => {
    return {
      why: `The focus order does not match the visual layout, or a focus trap prevents keyboard users from moving past a component. Keyboard-only users navigate sequentially — an illogical focus order or trap makes the interface unusable without a mouse.`,
      howToFix: `(1) Ensure DOM order matches visual order. (2) Remove <code>tabindex</code> values > 0 — they create out-of-order tab sequences. (3) For modals/dialogs, implement a proper focus trap that only traps while open and releases on close.`,
      codeExample: codeBlock(`<!-- Bad: positive tabindex breaks natural order -->
<button tabindex="3">First visually</button>
<button tabindex="1">Second visually</button>  <!-- focused first! -->
<button tabindex="2">Third visually</button>

<!-- Good: let DOM order control tab order -->
<button>First</button>
<button>Second</button>
<button>Third</button>

<!-- For elements that shouldn't receive focus -->
<div tabindex="-1">Not in tab order, but focusable via JS</div>`),
      confidence: MED,
      needsExternalAI: true,
    };
  },

  "ACT-R72": ({ el }) => {
    const tag = el.tag || "button";
    return {
      why: `This <code>&lt;${tag}&gt;</code> element does not show a visible focus indicator when navigated to via keyboard. Keyboard users rely on the focus ring to know which element is active — without it, the interface is effectively unusable without a mouse.`,
      howToFix: `Never use <code>outline: none</code> or <code>outline: 0</code> without providing an equivalent custom focus style. Use <code>:focus-visible</code> to show focus rings only for keyboard navigation (not mouse clicks).`,
      codeExample: codeBlock(`/* Bad — removes focus indicator entirely */
button:focus { outline: none; }
*:focus { outline: 0; }

/* Good — custom focus style */
button:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Or use box-shadow (more design-friendly) */
button:focus-visible {
  box-shadow: 0 0 0 3px rgba(0, 95, 204, 0.4);
  outline: none;
}`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R79": ({ description }) => {
    const sizeMatch = description.match(/(\d+)×(\d+)|(\d+)\s*x\s*(\d+)/i);
    const w = sizeMatch?.[1] ?? sizeMatch?.[3] ?? "?";
    const h = sizeMatch?.[2] ?? sizeMatch?.[4] ?? "?";
    return {
      why: `The interactive target is ${w !== "?" ? `${w}×${h}px` : "too small"}, below the WCAG 2.5.8 minimum of 24×24px. Small targets cause accidental activations and are difficult to use with motor impairments or on touch devices.`,
      howToFix: `Increase the target's click area to at least 24×24px using <code>padding</code>, <code>min-width</code>/<code>min-height</code>, or a larger overall element. Use <code>padding</code> rather than changing the visual size if design constraints apply.`,
      codeExample: codeBlock(`/* Bad — tiny icon button */
.icon-btn { width: 16px; height: 16px; }

/* Good — increase padding to expand tap target */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;   /* 44px is recommended for touch (WCAG 2.5.5) */
  min-height: 44px;
  padding: 10px;
}`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R85": ({ el }) => {
    return {
      why: `The focused element does not have sufficient contrast between the focus indicator and adjacent colors. WCAG 2.4.11 requires a 3:1 contrast ratio for the focus indicator, and a minimum area of a 2px perimeter offset around the component.`,
      howToFix: `Ensure the focus indicator: (1) has 3:1 contrast with adjacent colors, (2) covers at least a 2px border around the component, (3) is not obscured by other content.`,
      codeExample: codeBlock(`/* Fails: light blue ring on white barely visible */
:focus-visible { outline: 2px solid #aac4ff; }

/* Passes: high-contrast ring */
:focus-visible {
  outline: 3px solid #0050d8;   /* 4.5:1 on white */
  outline-offset: 3px;
}

/* Check contrast with: WebAIM Contrast Checker */
/* Focus color vs background where the ring appears */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Video / Audio ─────────────────────────────────────────────────────────────

  "ACT-R22": ({ el }) => {
    const src = attr(el, "src") || attr(el, "data-src") || "video.mp4";
    return {
      why: `This <code>&lt;video&gt;</code> element does not have captions. Deaf and hard-of-hearing users cannot access audio content without captions. Also affects users watching in noisy environments or with audio off.`,
      howToFix: `Add a <code>&lt;track&gt;</code> element with <code>kind="captions"</code> and a WebVTT (.vtt) caption file. For pre-recorded videos, closed captions are required at WCAG AA.`,
      codeExample: codeBlock(`<video controls>
  <source src="${short(src, 40)}" type="video/mp4" />

  <!-- Add captions track -->
  <track
    kind="captions"
    src="captions-en.vtt"
    srclang="en"
    label="English captions"
    default
  />

  <!-- Also add audio description if visuals convey info -->
  <track
    kind="descriptions"
    src="descriptions-en.vtt"
    srclang="en"
    label="Audio descriptions"
  />
</video>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Layout / Reflow ───────────────────────────────────────────────────────────

  "ACT-R52": ({ description }) => {
    return {
      why: `The page orientation is locked (forced portrait or landscape). Users who mount devices in fixed orientations (e.g., wheelchair-mounted tablets) cannot rotate to their preferred view.`,
      howToFix: `Remove the orientation lock from CSS and meta viewport. If a specific orientation is genuinely essential (e.g. a piano keyboard app), that's allowed — but most web content doesn't qualify.`,
      codeExample: codeBlock(`/* Remove orientation lock in CSS */
@media (orientation: portrait) {
  body { transform: rotate(90deg); }  /* Bad — forces landscape */
}

/* Remove in JavaScript */
/* screen.orientation.lock("portrait") — avoid unless truly essential */

/* Check your meta viewport — don't restrict orientation */
<meta name="viewport" content="width=device-width, initial-scale=1">
/* NOT: content="width=device-width, orientation=portrait" */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R67": ({ el }) => {
    const tag = el.tag || "div";
    return {
      why: `Content in this <code>&lt;${tag}&gt;</code> requires horizontal scrolling at 320px viewport width. WCAG 1.4.10 Reflow requires that content can be presented without horizontal scrolling at 320px (equivalent to 400% zoom on a 1280px screen).`,
      howToFix: `Use responsive CSS: <code>max-width: 100%</code>, flexible grid/flex layouts, and avoid fixed pixel widths wider than the mobile viewport.`,
      codeExample: codeBlock(`/* Bad — fixed wide layout */
.container { width: 1200px; }
.table { width: 800px; }

/* Good — responsive */
.container { max-width: 100%; overflow-x: hidden; }

/* For tables that need to stay wide */
.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* Images */
img { max-width: 100%; height: auto; }

/* Test: DevTools → Responsive → 320px width */`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  // ── Motion / Animation ────────────────────────────────────────────────────────

  "ACT-R70": ({ el }) => {
    const tag = el.tag;
    return {
      why: `This <code>&lt;${tag}&gt;</code> content auto-plays animation/video that cannot be paused, stopped, or hidden. Users with vestibular disorders (motion sensitivity) or attention difficulties are harmed by uncontrolled moving content.`,
      howToFix: `Respect <code>prefers-reduced-motion</code> media query. Add pause/stop controls. Autoplay is only acceptable if: it lasts ≤5 seconds, OR the user can pause/stop it.`,
      codeExample: codeBlock(`/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* For video: don't autoplay, or provide controls */
<video controls preload="none">  <!-- Not autoplay -->
  <source src="hero-video.mp4" />
</video>

/* If autoplay is needed — mute and provide pause button */
<video autoplay muted loop aria-label="Background animation">
  <source src="bg.mp4" />
</video>
<button onclick="toggleVideo()">Pause background video</button>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R76": ({ description }) => {
    return {
      why: `This authentication step presents a cognitive function test (CAPTCHA, puzzle, memorized password) without an accessible alternative. Users with cognitive disabilities, blindness, or motor impairments may be unable to complete the authentication.`,
      howToFix: `Provide at least one of: (1) an alternative that doesn't rely on cognitive tests, (2) a mechanism to assist (e.g. copy-paste allowed for passwords), or (3) a customer support bypass option.`,
      codeExample: codeBlock(`<!-- Preferred: use passkeys or email magic links -->
<!-- No CAPTCHA needed -->

<!-- If CAPTCHA is required: provide audio alternative -->
<div id="captcha">
  <img src="captcha.png" alt="" />
  <button>Play audio version</button>
  <a href="/support">Contact support if you need help</a>
</div>

<!-- Always allow paste in password fields -->
<input type="password" autocomplete="current-password" />
<!-- Don't disable paste via JS event handlers -->`),
      confidence: MED,
      needsExternalAI: true,
    };
  },

  "ACT-R77": ({ description }) => {
    return {
      why: `This functionality requires a dragging movement and does not offer a single-pointer alternative (click, tap). Users with motor disabilities who cannot perform click-and-drag movements are excluded.`,
      howToFix: `Provide a way to perform the same action without dragging: buttons to move items, a keyboard-accessible alternative, or touch-friendly handles.`,
      codeExample: codeBlock(`<!-- Draggable list item — always add keyboard alternative -->
<li draggable="true"
    aria-grabbed="false"
    role="option">
  Item
  <!-- Up/Down buttons as alternative to drag -->
  <button aria-label="Move item up">↑</button>
  <button aria-label="Move item down">↓</button>
</li>

<!-- For sliders: always support keyboard arrow keys -->
<input type="range" min="0" max="100" value="50"
       aria-label="Volume" />`),
      confidence: MED,
      needsExternalAI: false,
    };
  },

  // ── Skip / Navigation ─────────────────────────────────────────────────────────

  "ACT-R39": ({ description }) => {
    return {
      why: `There is no skip navigation link or the existing one is not functional. Keyboard and screen reader users must tab through all navigation links on every page before reaching the main content.`,
      howToFix: `Add a "Skip to main content" link as the first focusable element in the page. It can be visually hidden until focused.`,
      codeExample: codeBlock(`<!-- Add as FIRST element inside <body> -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<nav>...</nav>

<main id="main-content" tabindex="-1">
  <!-- page content -->
</main>

/* CSS — visually hidden but visible on focus */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px 16px;
  z-index: 9999;
  text-decoration: none;
}
.skip-link:focus {
  top: 0;
}`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R90": ({ description }) => {
    return {
      why: `Help mechanisms (contact links, chatbots, support links) appear in different locations across pages. Consistent placement helps users with cognitive disabilities find help reliably.`,
      howToFix: `Ensure help links and mechanisms appear in the same relative position on every page (e.g. always in the header, or always in the footer).`,
      codeExample: codeBlock(`<!-- Place consistently in header navigation -->
<header>
  <nav aria-label="Main">
    <a href="/home">Home</a>
    <a href="/products">Products</a>
    <a href="/help">Help</a>  <!-- always here, every page -->
  </nav>
</header>`),
      confidence: MED,
      needsExternalAI: false,
    };
  },

  "ACT-R99": ({ el }) => {
    return {
      why: `This element uses <code>aria-hidden="true"</code> but contains focusable children (links, buttons, inputs). Screen readers will skip the container, but keyboard users can still Tab into the hidden children — creating ghost focus traps that are invisible to AT users.`,
      howToFix: `Either remove <code>aria-hidden</code>, or ensure all focusable descendants have <code>tabindex="-1"</code> or are removed from the DOM when hidden.`,
      codeExample: codeBlock(`<!-- Bad: focusable button inside aria-hidden -->
<div aria-hidden="true">
  <button>Click me</button>  <!-- keyboard accessible but AT can't see it -->
</div>

<!-- Option 1: Remove aria-hidden -->
<div>
  <button>Click me</button>
</div>

<!-- Option 2: Also hide from keyboard -->
<div aria-hidden="true" inert>
  <button tabindex="-1">Click me</button>
</div>

<!-- Modern: use 'inert' attribute -->
<div inert>...</div>  <!-- hides from both AT and keyboard -->`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R105": ({ el }) => {
    const tag = el.tag || "div";
    return {
      why: `This <code>&lt;${tag}&gt;</code> element has an interactive role (button, link, etc.) but is not keyboard operable — it responds to mouse click but not Enter/Space keypress. Keyboard-only users cannot activate it.`,
      howToFix: `Use a native <code>&lt;button&gt;</code> or <code>&lt;a&gt;</code> element when possible. If a custom element is required, add <code>tabindex="0"</code> and keyboard event handlers.`,
      codeExample: codeBlock(`<!-- Bad: div acting as button -->
<div onclick="doAction()" style="cursor: pointer">Click me</div>

<!-- Good: use native button -->
<button onclick="doAction()">Click me</button>

<!-- If custom element needed -->
<div
  role="button"
  tabindex="0"
  onclick="doAction()"
  onkeydown="e => (e.key==='Enter'||e.key===' ') && doAction()"
>
  Click me
</div>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R110": ({ el }) => {
    return {
      why: `This element has conflicting or invalid ARIA role/state attributes. Invalid ARIA is often worse than no ARIA — it creates false announcements that confuse screen reader users.`,
      howToFix: `Validate ARIA usage. Each role has allowed properties — check the ARIA spec for which attributes are valid with this role.`,
      codeExample: codeBlock(`<!-- Check the ARIA spec for valid role+attribute combinations -->
<!-- https://www.w3.org/TR/wai-aria-1.2/ -->

<!-- Example: aria-checked only valid on role="checkbox/radio/switch/menuitemcheckbox" -->
<!-- Bad -->
<div role="button" aria-checked="true">Toggle</div>

<!-- Good: use the right role -->
<button role="switch" aria-checked="true">Dark mode</button>

<!-- Run axe DevTools or WAVE to audit ARIA validity -->`),
      confidence: MED,
      needsExternalAI: true,
    };
  },

  "ACT-R111": ({ el }) => {
    const tag = el.tag || "div";
    return {
      why: `This <code>&lt;${tag}&gt;</code> uses an ARIA landmark role or HTML landmark element without a unique accessible name. When multiple landmarks of the same type appear on a page, screen reader users can't distinguish between them in the landmark list.`,
      howToFix: `Add <code>aria-label</code> or <code>aria-labelledby</code> to each landmark to give it a unique name.`,
      codeExample: codeBlock(`<!-- Bad: two <nav> elements look identical -->
<nav>Main navigation</nav>
<nav>Footer links</nav>

<!-- Good: each has a unique label -->
<nav aria-label="Main">Main navigation</nav>
<nav aria-label="Footer">Footer links</nav>

<!-- For sections -->
<section aria-labelledby="section-1-heading">
  <h2 id="section-1-heading">Products</h2>
</section>`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R115": ({ el }) => {
    return {
      why: `Content that appears on hover (tooltip, dropdown, sub-menu) cannot be dismissed, does not remain on hover, or disappears before users can read it. Users with low vision who zoom in, or with motor disabilities, need stable hover content.`,
      howToFix: `Hover content must: (1) be dismissible with Esc without moving focus, (2) remain hoverable (user can move pointer over the popup), (3) persist until hover ends or user dismisses.`,
      codeExample: codeBlock(`/* Tooltip pattern that passes WCAG 1.4.13 */
[data-tooltip]:hover .tooltip,
[data-tooltip]:focus .tooltip {
  display: block;   /* show on hover AND focus */
}

.tooltip {
  /* allow pointer to move into tooltip without it closing */
  pointer-events: auto;
}

/* JavaScript: close on Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllTooltips();
});`),
      confidence: HIGH,
      needsExternalAI: false,
    };
  },

  "ACT-R117": ({ description }) => {
    return {
      why: `This interactive component is missing keyboard accessibility support required by its ARIA pattern. Components like menus, trees, grids, and carousels have defined keyboard interaction patterns (arrow keys, Home/End, etc.) that screen reader and keyboard users expect.`,
      howToFix: `Implement the keyboard interaction pattern defined in the ARIA Authoring Practices Guide (APG) for this component type.`,
      codeExample: codeBlock(`<!-- ARIA Authoring Practices Guide patterns -->
<!-- https://www.w3.org/WAI/ARIA/apg/patterns/ -->

<!-- Menu button pattern: -->
<button aria-haspopup="true" aria-expanded="false" aria-controls="menu">
  Options ▾
</button>
<ul id="menu" role="menu">
  <li role="menuitem" tabindex="-1">Edit</li>
  <li role="menuitem" tabindex="-1">Delete</li>
</ul>
<!-- Keyboard: Enter/Space opens, Arrow keys navigate,
     Esc closes, Tab moves focus out -->`),
      confidence: MED,
      needsExternalAI: true,
    };
  },

  // ── Default fallback ──────────────────────────────────────────────────────────

  "default": ({ ruleId, description, el }) => {
    const tag = el.tag;
    return {
      why: `This element${tag ? ` (<code>&lt;${tag}&gt;</code>)` : ""} violates ${ruleId}: ${short(description, 120)}. This is a context-specific issue that requires reviewing the element in its surrounding page structure.`,
      howToFix: `Review the WCAG success criterion linked to ${ruleId} and check this element against the guideline's requirements. Consider using the browser's accessibility tree (DevTools → Accessibility) to inspect how assistive technology perceives this element.`,
      codeExample: undefined,
      confidence: LOW,
      needsExternalAI: true,
    };
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function analyzeIssue(params: {
  ruleId: string;
  description: string;
  element: string | null;
  selector: string | null;
}): FixSuggestion {
  const { ruleId, description, element, selector } = params;
  const el = parseEl(element ?? "");
  const handler = handlers[ruleId] ?? handlers["default"];
  return handler({ ruleId, description, el, selector: selector ?? "" });
}

export function ruleHasHighConfidence(ruleId: string): boolean {
  const h = handlers[ruleId];
  if (!h) return false;
  const dummy = h({ ruleId, description: "", el: { tag: "", attrs: {}, text: "", html: "" }, selector: "" });
  return dummy.confidence === "high";
}

export const COVERED_RULES = new Set(Object.keys(handlers).filter(k => k !== "default"));
