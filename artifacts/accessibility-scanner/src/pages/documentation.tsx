import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ShieldCheck, FileText, ExternalLink } from "lucide-react";

const ruleReferences = [
  { id: "SIA-R1",   title: "Page has no title",                                          detail: "Every page must have a <title> element in the <head>. The title appears in the browser tab, history, and screen reader announcements, helping users understand where they are." },
  { id: "SIA-R2",   title: "Image without a text alternative",                           detail: "Informative images must have meaningful alt text. Decorative images should use alt=\"\" so screen readers skip them entirely." },
  { id: "SIA-R3",   title: "Element IDs are not unique",                                 detail: "All id attributes must be unique in the DOM. Duplicate IDs break label associations, aria-labelledby references, anchor links, and assistive-technology relationships." },
  { id: "SIA-R4",   title: "Page language has not been identified",                      detail: "The <html> element is missing a lang attribute. Screen readers need it to apply the correct pronunciation and voice profile for the page content." },
  { id: "SIA-R5",   title: "Page language is not valid",                                 detail: "The lang value on the <html> element is not a recognised BCP 47 code. Use a valid primary subtag such as \"en\", \"fr\", or \"zh-Hant\"." },
  { id: "SIA-R6",   title: "Language declarations are inconsistent",                     detail: "Multiple lang attributes on the page contain inconsistent or invalid values, which confuses assistive technologies trying to apply the correct speech engine." },
  { id: "SIA-R7",   title: "Content language changes are not identified",                detail: "When a section of content is written in a different language from the page lang, that element must declare its own lang attribute so assistive technologies switch voice correctly." },
  { id: "SIA-R8",   title: "Form field is not labeled",                                  detail: "Every input, select, and textarea must be associated with a visible <label> or carry an accessible name via aria-label or aria-labelledby so screen reader users know the field's purpose." },
  { id: "SIA-R9",   title: "Page refreshes or redirects without user control",           detail: "Automatic meta-refresh, redirects, or context changes must be avoidable or clearly communicated. Unexpected changes disorient screen reader and keyboard users." },
  { id: "SIA-R10",  title: "Personal data inputs missing autocomplete attributes",       detail: "Inputs that collect personal information (name, email, address, etc.) must expose valid HTML autocomplete tokens so browsers and assistive tools can suggest and auto-fill values." },
  { id: "SIA-R11",  title: "Link does not have a discernible name",                      detail: "Every link must have a non-empty accessible name — via visible text, aria-label, or aria-labelledby — so screen reader users understand the link destination." },
  { id: "SIA-R12",  title: "Button does not have a discernible name",                    detail: "Buttons must expose a meaningful accessible name through visible text, aria-label, or an equivalent so their action is identifiable without visual context." },
  { id: "SIA-R13",  title: "Inline frame does not have an accessible name",              detail: "Every <iframe> must include a title attribute that describes the embedded content, so screen reader users know what the frame contains before entering it." },
  { id: "SIA-R14",  title: "Visible label is not included in the accessible name",       detail: "The programmatic accessible name of a control must contain or closely match its visible label text, ensuring speech-input users can activate the control by speaking what they see." },
  { id: "SIA-R15",  title: "Multiple frames have identical accessible names",            detail: "Each iframe or frame must have a unique and descriptive title. Identical titles prevent users from distinguishing one embedded region from another." },
  { id: "SIA-R16",  title: "Required ARIA attribute is missing",                         detail: "Many ARIA roles require specific state or property attributes to convey meaning (e.g., aria-checked on a checkbox role). Missing required attributes break assistive-technology interpretation." },
  { id: "SIA-R17",  title: "Hidden content contains focusable elements",                 detail: "Elements inside aria-hidden=\"true\" regions or display:none containers must not contain keyboard-focusable children. Hidden content that remains in the tab order confuses all users." },
  { id: "SIA-R18",  title: "Unsupported ARIA attribute is used",                         detail: "Applying an ARIA attribute to a role that does not support it produces incorrect or meaningless semantics. Only use attributes defined as applicable for that role in the WAI-ARIA spec." },
  { id: "SIA-R19",  title: "Invalid value for ARIA attribute",                           detail: "ARIA attributes with enumerated values (such as aria-checked, aria-live, aria-sort) must use only the allowed values defined in the specification." },
  { id: "SIA-R20",  title: "Invalid ARIA attribute is used",                             detail: "Attributes starting with aria- that are not part of the WAI-ARIA specification must not be used, as assistive technologies will not recognise or convey them." },
  { id: "SIA-R21",  title: "Invalid ARIA role is used",                                  detail: "Only WAI-ARIA-defined role values may be used. Invalid or misspelled roles are ignored by assistive technologies, leaving elements without semantic meaning." },
  { id: "SIA-R22",  title: "Video does not have captions",                               detail: "Pre-recorded video content must include a synchronised caption track via <track kind=\"captions\"> so deaf and hard-of-hearing users can access all spoken dialogue and audio cues." },
  { id: "SIA-R23",  title: "Audio or video does not have a transcript or alternative",   detail: "Pre-recorded audio-only or video-only content must provide a text transcript or equivalent so users who cannot hear or see the media can access the same information." },
  { id: "SIA-R24",  title: "Media alternative may be insufficient",                      detail: "A text or audio alternative exists but may not fully convey all the information in the media. Review the alternative to ensure it is complete and equivalent." },
  { id: "SIA-R25",  title: "Accessible name does not match visible label",               detail: "The programmatic accessible name must include the visible label text. A mismatch means speech-input users say one thing but the browser acts on something else, preventing successful activation." },
  { id: "SIA-R26",  title: "Abbreviation does not have an expansion",                    detail: "Abbreviations and acronyms should be wrapped in <abbr title=\"…\"> with the full expansion so assistive technologies and users unfamiliar with the term can understand it." },
  { id: "SIA-R27",  title: "Audio-only content does not have a transcript",              detail: "Pre-recorded audio-only content (e.g., a podcast) must include a full text transcript so deaf users or those in sound-sensitive environments can access the content." },
  { id: "SIA-R28",  title: "Image button does not have a text alternative",              detail: "An input[type=\"image\"] acts as a submit button and must have an alt attribute or accessible name describing its action, not just its visual appearance." },
  { id: "SIA-R29",  title: "Video-only content does not have an alternative",            detail: "Video without audio (silent film, animation, screen recording) must include a text description or equivalent so blind users receive the same information." },
  { id: "SIA-R30",  title: "Enhanced contrast is insufficient (AAA 7:1)",               detail: "Text must meet at least a 7:1 contrast ratio against its background for WCAG Level AAA conformance. This benefits users with moderate to severe low vision." },
  { id: "SIA-R31",  title: "Line height is below recommended minimum",                   detail: "Line height (line-height) should be at least 1.5 times the font size. Insufficient line spacing makes text harder to read, particularly for users with dyslexia." },
  { id: "SIA-R32",  title: "Target size is too small",                                   detail: "Interactive elements should meet a minimum touch target area of 24×24 px (WCAG 2.5.8 AA) or 44×44 px (AAA) so users with motor impairments can activate them reliably." },
  { id: "SIA-R33",  title: "Media alternative may be insufficient",                      detail: "The detected alternative for this media element may not fully represent all its content. Verify that the alternative is accurate, complete, and equivalent." },
  { id: "SIA-R34",  title: "Heading is not followed by content",                         detail: "A heading element immediately followed by another heading without any content between them may indicate a structural or authoring error that confuses outline-based navigation." },
  { id: "SIA-R35",  title: "Content is not placed within landmark regions",              detail: "All visible body content should be contained within an appropriate ARIA landmark (main, nav, header, footer, etc.) so keyboard users can navigate directly to each region." },
  { id: "SIA-R36",  title: "Unsupported or prohibited ARIA usage",                       detail: "Certain ARIA attributes are explicitly forbidden on specific elements or roles. Using them overrides native semantics incorrectly and may break assistive-technology behaviour." },
  { id: "SIA-R37",  title: "Video does not have an audio description",                   detail: "Pre-recorded video must include a synchronised audio description track (or an alternative version) that describes important visual events not covered by the existing audio." },
  { id: "SIA-R38",  title: "Video alternative may be incomplete",                        detail: "A video alternative exists but may not describe all the visual information. Ensure all meaningful visuals are captured in the description or transcript." },
  { id: "SIA-R39",  title: "Image filename used as alternative text",                    detail: "The alt attribute appears to contain a raw filename (e.g., hero_img_final.jpg) rather than a meaningful description. Replace it with concise text that describes the image's content or purpose." },
  { id: "SIA-R40",  title: "Landmark region does not have an accessible name",           detail: "When more than one landmark of the same type exists on a page (e.g., two <nav> elements), each should have a unique aria-label or aria-labelledby to distinguish them." },
  { id: "SIA-R41",  title: "Links with identical text have different purposes",          detail: "Multiple links sharing the same visible text but pointing to different destinations are ambiguous. Differentiate them using aria-label, additional context, or more specific link text." },
  { id: "SIA-R42",  title: "ARIA role is not used in the correct context",               detail: "Certain ARIA roles require specific parent or child roles to be valid (e.g., option inside listbox). Incorrect nesting causes assistive technologies to misinterpret the widget." },
  { id: "SIA-R43",  title: "SVG or graphical element lacks accessible name",             detail: "An SVG that conveys meaning must expose an accessible name via a <title> child element, aria-label, or aria-labelledby. Pure decorative SVGs should use aria-hidden=\"true\"." },
  { id: "SIA-R44",  title: "Page orientation is restricted",                             detail: "Locking the display to portrait or landscape via CSS prevents users who mount their device in a fixed position from accessing content. Orientation should be unrestricted unless essential." },
  { id: "SIA-R45",  title: "Table headers are not properly defined",                     detail: "Data tables must use <th> elements with appropriate scope or headers attributes so assistive technologies can announce the correct column or row header for each data cell." },
  { id: "SIA-R46",  title: "Table cells are not associated with headers",                detail: "Data cells (<td>) must be programmatically associated with their headers — either by placing them under a <th scope=\"col\"> or by using the headers attribute — so screen readers can announce the relationship." },
  { id: "SIA-R47",  title: "Zooming is restricted",                                      detail: "The viewport meta tag must not disable user zooming (user-scalable=no or maximum-scale=1). Users with low vision depend on browser zoom to read content." },
  { id: "SIA-R48",  title: "Audio or media plays automatically",                         detail: "Media that auto-plays — especially audio — must include visible controls to pause or stop it within 3 seconds, or be silent and muted by default. Auto-play disrupts screen reader users." },
  { id: "SIA-R49",  title: "Media alternative may be missing or incomplete",             detail: "The detected media element appears to lack a complete accessible alternative. Provide a text transcript, audio description, or equivalent that conveys all the information in the media." },
  { id: "SIA-R50",  title: "Audio cannot be paused or stopped",                          detail: "Auto-playing audio without pause or stop controls violates WCAG 1.4.2. Provide visible controls so users can silence audio that interferes with their screen reader output." },
  { id: "SIA-R51",  title: "Audio control is missing",                                   detail: "An <audio> element is present without the controls attribute, leaving users unable to manage playback. Add the controls attribute or provide custom play/pause controls." },
  { id: "SIA-R52",  title: "Moving or auto-playing content may not be controllable",     detail: "Auto-playing videos, animations, or scrolling tickers must offer a mechanism to pause, stop, or hide them. Moving content can distract users with attention or cognitive difficulties." },
  { id: "SIA-R53",  title: "Headings are not structured properly",                       detail: "Heading levels must follow a logical hierarchy (h1 → h2 → h3) without skipping ranks. Proper structure allows screen reader users to navigate and understand the page outline." },
  { id: "SIA-R54",  title: "Status message not announced to assistive technologies",     detail: "Dynamic status updates (form confirmations, loading states, error counts) must use role=\"status\", aria-live, or an equivalent so screen readers announce them without moving focus." },
  { id: "SIA-R55",  title: "Landmark regions have duplicate accessible names",           detail: "Multiple landmark regions sharing the same name (e.g., two <section> elements both labelled \"Products\") make it impossible to distinguish them through assistive-technology navigation." },
  { id: "SIA-R56",  title: "Region roles may be misused",                                detail: "ARIA landmark roles must be applied consistently and correctly. Misusing roles (e.g., role=\"region\" without a name, or role=\"main\" used multiple times) breaks page navigation." },
  { id: "SIA-R57",  title: "Non-text contrast for UI components is insufficient",        detail: "Icons, input borders, focus rings, and other non-text UI components must have at least a 3:1 contrast ratio against adjacent colours (WCAG 1.4.11 AA)." },
  { id: "SIA-R58",  title: "Skip navigation link may be missing",                        detail: "A 'Skip to main content' link at the top of the page lets keyboard users bypass repeated navigation and jump directly to the primary content area." },
  { id: "SIA-R59",  title: "Page does not contain any headings",                         detail: "Pages should have a meaningful heading structure. Without headings, screen reader users cannot scan the page outline or jump between content sections efficiently." },
  { id: "SIA-R60",  title: "Grouped form controls do not have an accessible name",       detail: "Groups of related controls — radio buttons, checkboxes — must be wrapped in a <fieldset> element with a <legend> that describes the group's purpose." },
  { id: "SIA-R61",  title: "Page does not start with a level-1 heading",                detail: "The first heading on a page should be an <h1> that describes the page topic. Starting at <h2> or deeper deprives screen reader users of the top-level page summary." },
  { id: "SIA-R62",  title: "Links are not visually distinguishable from surrounding text", detail: "Links within body text must be distinguishable without relying on colour alone. Add an underline, bold weight, or another non-colour visual cue to identify hyperlinks." },
  { id: "SIA-R63",  title: "Embedded object does not have a text alternative",           detail: "An <object> element must provide accessible content via title, aria-label, or meaningful fallback text inside the element so its purpose is conveyed to all users." },
  { id: "SIA-R64",  title: "Heading element is empty",                                   detail: "Heading elements (h1–h6) must contain meaningful text. An empty heading is announced as a heading by screen readers but provides no information, wasting user navigation time." },
  { id: "SIA-R65",  title: "Focus indicator is not visible",                             detail: "Removing the browser's default focus outline without providing an equally visible custom replacement leaves keyboard users unable to tell where focus currently is." },
  { id: "SIA-R66",  title: "Enhanced text contrast is insufficient",                     detail: "Text should achieve at least a 7:1 contrast ratio against its background for WCAG AAA. This rule targets text or elements that fall below this enhanced threshold." },
  { id: "SIA-R67",  title: "Decorative image exposed to assistive technologies",         detail: "Images marked as decorative via role=\"presentation\" or role=\"none\" should not carry descriptive alt text. Providing alt text on a decorative image will be announced unnecessarily." },
  { id: "SIA-R68",  title: "Empty container element detected",                           detail: "A visible block-level element has no content. Empty containers may be rendering artefacts that should be removed, or they need meaningful content or aria-hidden to avoid confusion." },
  { id: "SIA-R69",  title: "Text contrast is insufficient (AA 4.5:1)",                  detail: "Normal-size text must meet a 4.5:1 contrast ratio and large text (18pt or 14pt bold) must meet 3:1 for WCAG Level AA. Insufficient contrast impairs readability for low-vision users." },
  { id: "SIA-R70",  title: "Deprecated HTML element is used",                            detail: "Obsolete elements such as <marquee>, <blink>, <center>, <font>, and <big> have been removed from the HTML spec. Replace them with CSS or semantic HTML equivalents." },
  { id: "SIA-R71",  title: "Text spacing is inconsistent",                               detail: "Inconsistent or excessive spacing adjustments applied through CSS may break the layout when users override text spacing via a user stylesheet (WCAG 1.4.12)." },
  { id: "SIA-R72",  title: "Text is written in all capital letters",                     detail: "Extended passages in ALL CAPS are significantly harder to read, especially for users with dyslexia. Use sentence case or title case for body text, and avoid text-transform:uppercase on long passages." },
  { id: "SIA-R73",  title: "Line height is too small",                                   detail: "Line height should be at least 1.5 times the font size. Cramped line spacing reduces readability for everyone, especially users with low vision or cognitive disabilities." },
  { id: "SIA-R74",  title: "Font size is fixed",                                         detail: "Using absolute font size units (px, pt) prevents text from scaling when users change their browser's default font size. Use relative units (em, rem, %) instead." },
  { id: "SIA-R75",  title: "Font size may be too small",                                 detail: "Text that is very small may be difficult to read and may not scale well. Ensure body text is at least 16px (1rem) and that all text remains legible when zoomed to 200%." },
  { id: "SIA-R76",  title: "Table is missing header cells",                              detail: "Data tables that present rows and columns of information must include <th> elements to identify header cells, enabling screen readers to announce the context of each data cell." },
  { id: "SIA-R77",  title: "Table data cells are not properly associated with headers",  detail: "Each <td> must be associated with its header either through column position (via <th scope=\"col\">) or explicitly through the headers attribute referencing the relevant <th> ids." },
  { id: "SIA-R78",  title: "Heading is not followed by content",                         detail: "A heading at the end of a section with no subsequent content may indicate a structural issue. Headings should introduce the content that follows, not appear in isolation." },
  { id: "SIA-R79",  title: "Preformatted text element is misused",                       detail: "<pre> is meant for preformatted content such as code, ASCII art, or tabular data. Using it for general prose breaks reading flow and may disrupt screen reader announcement." },
  { id: "SIA-R80",  title: "Line height is fixed",                                       detail: "Setting line-height with a fixed pixel value prevents it from scaling when users increase their text size, which can cause text to overlap on zoom." },
  { id: "SIA-R81",  title: "Links with identical text lead to different destinations",   detail: "When multiple links share the same visible label but point to different pages, screen reader users navigating the link list cannot distinguish them. Use unique text or aria-label to disambiguate." },
  { id: "SIA-R82",  title: "Semantic structure is missing",                              detail: "Content that looks like a list, heading, or table but is marked up with generic <div> or <span> elements lacks the semantic structure that assistive technologies rely on." },
  { id: "SIA-R83",  title: "Text is clipped when resized",                               detail: "Fixed-height containers with overflow:hidden clip text when users zoom or override font size. Use min-height, relative units, or overflow:auto to prevent content loss." },
  { id: "SIA-R84",  title: "Scrollable element is not keyboard accessible",              detail: "Scrollable regions that cannot receive keyboard focus trap keyboard users out of that content. Add tabindex=\"0\" to scrollable containers so they can be reached and scrolled via keyboard." },
  { id: "SIA-R85",  title: "Text uses excessive italics",                                detail: "Large passages rendered in italic are harder to read and may be misread by some screen readers. Reserve italics for short emphasis, titles, or technical terms." },
  { id: "SIA-R86",  title: "Presentational element exposed to assistive technologies",   detail: "Purely decorative elements (e.g., visual dividers, spacers) should be hidden from assistive technology with aria-hidden=\"true\" so they are not announced to screen reader users." },
  { id: "SIA-R87",  title: "Skip navigation link is missing",                            detail: "A skip link at the top of each page allows keyboard and screen reader users to jump past the repeated navigation and reach the main content immediately." },
  { id: "SIA-R88",  title: "Word spacing is insufficient",                               detail: "When users apply their own CSS to increase word spacing (per WCAG 1.4.12), content must remain readable. Avoid fixed layouts that collapse when word-spacing is increased to 0.16em." },
  { id: "SIA-R89",  title: "Enhanced contrast is insufficient (AAA)",                    detail: "For Level AAA conformance, all text must achieve at least 7:1 contrast. Identify elements that meet AA (4.5:1) but fall short of the enhanced AAA threshold." },
  { id: "SIA-R90",  title: "aria-hidden content contains focusable elements",            detail: "Elements inside an aria-hidden=\"true\" container are invisible to assistive technology, but if they remain in the tab order, keyboard users can reach them — a major inconsistency. Remove focusable children from aria-hidden regions." },
  { id: "SIA-R91",  title: "Letter spacing is insufficient",                             detail: "WCAG 1.4.12 requires content to remain usable when letter-spacing is increased to at least 0.12em. Layouts that break under this override need adjustment." },
  { id: "SIA-R92",  title: "Word spacing is insufficient",                               detail: "Content must remain intact when word-spacing is set to at least 0.16em. Test with user-stylesheet overrides and ensure no text is clipped or overlaps." },
  { id: "SIA-R93",  title: "Line height is insufficient",                                detail: "Line height must remain functional when set to at least 1.5 times the font size. Content that breaks or overlaps under this override fails WCAG 1.4.12." },
  { id: "SIA-R94",  title: "Menu item does not have an accessible name",                 detail: "Navigation menu items and custom widget items that lack accessible names are not announced meaningfully by screen readers. Provide visible text or aria-label." },
  { id: "SIA-R95",  title: "Keyboard interaction is not supported",                      detail: "All interactive functionality must be operable using only a keyboard. Custom widgets that respond only to mouse or touch events exclude keyboard-only and switch-access users." },
  { id: "SIA-R96",  title: "Page refresh or update occurs without warning",              detail: "Pages that auto-update or auto-refresh without user control interrupt screen reader reading position and keyboard context. Provide a mechanism to disable or extend the interval." },
  { id: "SIA-R97",  title: "Collapsible content may not be accessible",                  detail: "Accordion and disclosure widgets must use aria-expanded to communicate open/closed state, and must be keyboard operable via Enter or Space, so all users can access collapsed content." },
  { id: "SIA-R98",  title: "Main content may lack a heading",                            detail: "The primary content region should begin with a heading that describes its topic, helping screen reader users orient themselves within the page after landing on it." },
  { id: "SIA-R99",  title: "Main landmark is missing",                                   detail: "Every page must include exactly one <main> element or role=\"main\" landmark so screen reader users can jump directly to the primary content area." },
  { id: "SIA-R100", title: "PDF does not have an accessible alternative",                detail: "PDFs embedded or linked from a page should include accessible tags, or an equivalent HTML page should be provided for users whose assistive technology cannot read untagged PDFs." },
  { id: "SIA-R101", title: "Skip navigation link is missing (alternative check)",        detail: "A supplementary check for a bypass mechanism. If a skip link was not found by earlier rules, this rule confirms its absence. Provide a 'Skip to main content' link." },
  { id: "SIA-R102", title: "Skip navigation link is missing (secondary check)",          detail: "A third check for skip-navigation availability. Ensure at least one bypass link exists near the top of the page for all views and page states." },
  { id: "SIA-R103", title: "Text contrast is insufficient",                              detail: "This rule flags text whose contrast ratio falls below the required WCAG threshold. Check both foreground and background colours, including hover and focus states." },
  { id: "SIA-R104", title: "Enhanced contrast is insufficient",                          detail: "Text identified by this rule meets AA contrast (4.5:1) but fails the AAA threshold (7:1). Improving contrast benefits users with low vision and those in poor lighting conditions." },
  { id: "SIA-R105", title: "Multiple links with same text go to different destinations", detail: "When identical link labels lead to different pages, users cannot predict the destination. Disambiguate using aria-label, visually hidden context text, or more specific link text." },
  { id: "SIA-R106", title: "Invalid ARIA usage detected",                                detail: "An ARIA attribute or role is used incorrectly on this element. Review the WAI-ARIA spec for the element's allowed roles and attributes and correct any violations." },
  { id: "SIA-R107", title: "Custom interactive element not keyboard accessible",         detail: "Elements with onclick handlers but no keyboard access (missing tabindex and keyboard event listeners) are invisible to keyboard-only users. Add tabindex=\"0\" and onkeydown/onkeyup handlers." },
  { id: "SIA-R108", title: "ARIA attributes are misused",                                detail: "One or more ARIA attributes are applied in a way that conflicts with the element's native role or the WAI-ARIA specification. Correct the attributes to restore accurate semantics." },
  { id: "SIA-R109", title: "Page language does not match content",                       detail: "The lang attribute on the <html> element may not reflect the actual primary language of the page content, causing assistive technologies to mispronounce words." },
  { id: "SIA-R110", title: "HTML lang attribute contains an invalid language code",      detail: "The primary language subtag in the lang attribute (e.g., the \"en\" in \"en-US\") must match a valid ISO 639 code. An invalid subtag prevents correct voice and dictionary selection." },
  { id: "SIA-R111", title: "Touch target is too small (enhanced threshold)",             detail: "Interactive elements smaller than 44×44 px fail the WCAG AAA target size criterion. While 24×24 px is the AA minimum, the enhanced threshold of 44×44 px provides a significantly better experience on touch devices." },
  { id: "SIA-R112", title: "Semantic structure is missing or incorrect",                 detail: "Content that lacks the correct semantic HTML structure (e.g., visual lists built with <div> instead of <ul>/<li>) is not interpreted correctly by screen readers and other assistive tools." },
  { id: "SIA-R113", title: "Touch target size is too small (24×24 minimum)",            detail: "Interactive elements must be at least 24×24 CSS pixels in size or have sufficient spacing between them so users with motor impairments can activate them without accidentally hitting adjacent targets." },
  { id: "SIA-R114", title: "Page title is not descriptive",                              detail: "The <title> element exists but its text does not meaningfully describe the page. Titles should be unique across the site and clearly identify the page topic or purpose." },
  { id: "SIA-R115", title: "Heading is not descriptive",                                 detail: "A heading element's text is too vague (e.g., 'Section', 'Details') to convey the purpose of the content that follows. Headings should describe their section clearly without requiring surrounding context." },
  { id: "SIA-R116", title: "Details/summary element missing accessible name",           detail: "A <details> element requires a <summary> child with meaningful text. Without it, screen readers cannot announce the disclosure widget's purpose or current state." },
  { id: "SIA-R117", title: "Element with role='img' has no accessible name",            detail: "Any element with role=\"img\" must provide an accessible name via aria-label or aria-labelledby so its content or purpose is conveyed to screen reader users." },
];

const references = [
  {
    title: "Siteimprove Accessibility Rules",
    description: "Use this as the primary rule reference when interpreting scanner findings and prioritizing fixes.",
    links: [
      { label: "Alfa Rules Catalog", href: "https://alfa.siteimprove.com/rules" },
      { label: "Siteimprove Help Center", href: "https://help.siteimprove.com/" },
      { label: "WCAG 2.1 Overview", href: "https://www.w3.org/WAI/standards-guidelines/wcag/" },
    ],
  },
  {
    title: "A11y ACT Tool Rules",
    description: "This scanner maps a curated rule set to practical fixes for pages, components, and content flows.",
    links: [
      { label: "Scan History", href: "/scans" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

export default function Documentation() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Badge variant="secondary" className="mb-3">A11y ACT Tool</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Help guide for scanning, reviewing results, and using reference standards responsibly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Getting started</CardTitle>
          </div>
          <CardDescription>
            Create a scan by entering URLs, uploading a CSV, or using a sitemap.xml source.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p><span className="font-medium text-foreground">1.</span> Open <span className="font-medium">New Scan</span> and add one or more URLs.</p>
          <p><span className="font-medium text-foreground">2.</span> Select specific rules when you want focused validation.</p>
          <p><span className="font-medium text-foreground">3.</span> Enable proxy mode only when a PAC URL is configured in <span className="font-medium">Settings</span>.</p>
          <p><span className="font-medium text-foreground">4.</span> Review scan details, expand issue rows, and export results as CSV, Excel, or PDF.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Detailed rule descriptions</CardTitle>
          </div>
          <CardDescription>
            Quick reference descriptions for common scanner rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {ruleReferences.map((rule) => (
            <div key={rule.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">{rule.id}</Badge>
                <h3 className="font-medium text-sm">{rule.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-6">{rule.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Siteimprove Alfa rules reference</CardTitle>
          </div>
          <CardDescription>
            Use the rule catalog to navigate findings and understand likely remediation paths.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            When a rule is triggered, review the issue summary first, then expand occurrences to inspect selectors, HTML, WCAG criteria, and conformance level.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {references.map((section) => (
              <div key={section.title} className="rounded-lg border p-4 space-y-3">
                <h3 className="font-medium">{section.title}</h3>
                <p className="text-muted-foreground">{section.description}</p>
                <div className="space-y-2">
                  {section.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="flex items-center gap-1 text-primary hover:underline"
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                    >
                      {link.label}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Licensing and copyright</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground space-y-3">
          <p>
            Siteimprove, WCAG, and any referenced standards, names, or trademarks remain the property of their respective owners.
          </p>
          <p>
            This tool is provided for accessibility auditing and educational use. Always verify licensing terms before reproducing external documentation, rule text, or brand assets in your own materials.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}