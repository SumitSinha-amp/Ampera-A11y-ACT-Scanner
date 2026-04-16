import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ShieldCheck, FileText, ExternalLink } from "lucide-react";

const ruleReferences = [
  { id: "SIA-R1", title: "Page title missing", detail: "Pages should have a unique, descriptive title that tells users where they are and supports tab and browser navigation." },
  { id: "SIA-R2", title: "Image missing alt text", detail: "Informative images need concise alternative text; decorative images should be hidden from assistive technology." },
  { id: "SIA-R3", title: "Duplicate ID found", detail: "Each ID in the DOM should be unique so labels, scripts, and accessibility APIs resolve correctly." },
  { id: "SIA-R4", title: "Page language not set", detail: "Declare the page language so screen readers and text-to-speech tools can pronounce content correctly." },
  { id: "SIA-R5", title: "Language of parts not set", detail: "Mark content that switches language so assistive technologies can announce it properly." },
  { id: "SIA-R6", title: "Sensory characteristics used", detail: "Instructions should not rely only on shape, color, position, or sound to convey meaning." },
  { id: "SIA-R7", title: "Audio control missing", detail: "Provide a way to stop, pause, or adjust audio that plays automatically for more than a short duration." },
  { id: "SIA-R8", title: "Form field has no accessible name", detail: "Inputs need a visible label, aria-label, or equivalent accessible name to be identified by assistive technology." },
  { id: "SIA-R9", title: "Empty heading element found", detail: "Headings should contain meaningful text and should not be empty or used only for styling." },
  { id: "SIA-R10", title: "Color used as only visual means", detail: "Color should not be the only way to communicate meaning, state, or required action." },
  { id: "SIA-R11", title: "Link has no accessible name", detail: "Links must expose a meaningful accessible name so screen reader users understand the destination or purpose." },
  { id: "SIA-R12", title: "Button has no accessible name", detail: "Buttons need a visible label or an aria-label so they can be identified by assistive technologies." },
  { id: "SIA-R13", title: "Link opens new window without warning", detail: "Warn users when a link opens a new window or tab so the behavior is predictable." },
  { id: "SIA-R14", title: "Visible label and accessible name do not match", detail: "The accessible name should closely match the visible label to reduce confusion for speech and screen reader users." },
  { id: "SIA-R15", title: "Complex image missing long description", detail: "Charts, diagrams, and complex visuals may need a longer text explanation beyond short alt text." },
  { id: "SIA-R16", title: "Required ARIA attribute is missing", detail: "ARIA widgets must expose the attributes required by their role for correct interpretation." },
  { id: "SIA-R17", title: "Audio/video missing transcript", detail: "Provide text transcripts for audio and video content so the information is accessible without sound." },
  { id: "SIA-R18", title: "Flashing content may trigger seizures", detail: "Avoid flashing or rapidly changing content that could trigger photosensitive seizure reactions." },
  { id: "SIA-R19", title: "Focus causes unexpected context change", detail: "Moving focus should not unexpectedly change context unless the user clearly expects it." },
  { id: "SIA-R20", title: "Input causes unexpected context change", detail: "Changing a form control should not unexpectedly navigate or alter the page without clear user intent." },
  { id: "SIA-R21", title: "Invalid ARIA role used", detail: "Only use ARIA roles that are valid for the element and appropriate for the widget's behavior." },
  { id: "SIA-R22", title: "Video element may be missing captions", detail: "Provide captions for prerecorded video so deaf and hard-of-hearing users can access spoken content." },
  { id: "SIA-R23", title: "Video missing audio description", detail: "Important visual information in video should be described or represented in an accessible alternative." },
  { id: "SIA-R24", title: "Timing not adjustable", detail: "If time limits exist, users should be able to extend, adjust, or turn them off where possible." },
  { id: "SIA-R25", title: "Label in name mismatch", detail: "The accessible name should include the visible text so speech users can accurately activate controls." },
  { id: "SIA-R26", title: "Abbreviation has no expansion", detail: "Abbreviations should be expanded or explained where needed so users understand them." },
  { id: "SIA-R27", title: "Reading level too complex", detail: "Content should be written clearly and simply where possible, especially for important instructions." },
  { id: "SIA-R28", title: "Pronunciation not provided", detail: "Where pronunciation matters, supply guidance or markup so assistive technologies can speak terms correctly." },
  { id: "SIA-R29", title: "Error prevention for legal/financial transactions", detail: "Critical submissions should include confirmation, reversal, or review options before final submission." },
  { id: "SIA-R30", title: "Text contrast below AAA minimum", detail: "Large or important text should meet strong contrast so it remains readable for users with low vision." },
  { id: "SIA-R31", title: "Line height below minimum value", detail: "Text spacing should be generous enough that content remains readable and does not feel cramped." },
  { id: "SIA-R32", title: "Interactive element does not meet enhanced target size", detail: "Controls should be large enough to tap or click comfortably, especially on touch devices." },
  { id: "SIA-R33", title: "Accessible authentication requires cognitive test", detail: "Authentication should avoid relying only on memory, transcription, or cognitive puzzles." },
  { id: "SIA-R34", title: "Content missing after heading", detail: "Headings should be followed by relevant content and not used as isolated decorative text." },
  { id: "SIA-R35", title: "Text content not inside an ARIA landmark region", detail: "Important content should be grouped within landmarks so users can navigate by page regions." },
  { id: "SIA-R36", title: "ARIA attribute unsupported or prohibited", detail: "Do not apply ARIA properties to elements that do not support them or where they are not allowed." },
  { id: "SIA-R37", title: "Dragging movement has no single-pointer alternative", detail: "Dragging interactions should also be possible with a single pointer or alternate control method." },
  { id: "SIA-R38", title: "Redundant user input not auto-populated", detail: "When the same information is requested repeatedly, previously entered data should be offered or reused." },
  { id: "SIA-R39", title: "Focused component obscured by sticky content", detail: "Interactive content must remain visible when focused, especially near sticky headers, banners, and toolbars." },
  { id: "SIA-R40", title: "Data table missing header cells", detail: "Tables need proper header cells so screen reader users can understand column and row relationships." },
  { id: "SIA-R41", title: "Table missing caption or summary", detail: "Tables should include a clear caption or equivalent description for context." },
  { id: "SIA-R42", title: "List item not inside a list element", detail: "List items should be nested inside a valid list container to preserve structure." },
  { id: "SIA-R43", title: "Keyboard trap exists", detail: "Keyboard focus must be able to move into and out of components without getting stuck." },
  { id: "SIA-R44", title: "Content orientation is restricted", detail: "Do not lock content to one orientation unless that restriction is essential." },
  { id: "SIA-R45", title: "Input purpose not identified", detail: "Identify common input purposes so browsers and assistive tools can assist users more effectively." },
  { id: "SIA-R46", title: "Touch target below minimum size", detail: "Controls should be large enough to activate easily on touch devices." },
  { id: "SIA-R47", title: "Viewport zoom disabled", detail: "Do not block zooming; users should be able to enlarge content when needed." },
  { id: "SIA-R48", title: "Media autoplaying with audio", detail: "Autoplaying media with sound can disrupt users; provide controls and avoid unexpected audio playback." },
  { id: "SIA-R49", title: "Multi-point or path-based gesture required", detail: "Provide alternatives to complex gestures that are hard to perform or impossible for some users." },
  { id: "SIA-R50", title: "Triggered by device motion", detail: "Motion-based functionality should also work with standard controls and not rely only on sensors." },
  { id: "SIA-R51", title: "Navigation repeated in different order", detail: "Repeated navigation should appear in a consistent order to reduce confusion." },
  { id: "SIA-R52", title: "Components identified inconsistently", detail: "Controls with the same purpose should be named and presented consistently across the site." },
  { id: "SIA-R53", title: "Error prevention for important actions", detail: "Important actions should give users a chance to confirm, reverse, or review before completion." },
  { id: "SIA-R54", title: "Status messages not programmatically determinable", detail: "Dynamic updates should be announced so assistive technology can detect them without moving focus." },
  { id: "SIA-R55", title: "Parsing errors in HTML markup", detail: "Markup should be valid and structured so assistive technology can interpret it reliably." },
  { id: "SIA-R56", title: "Focus order does not preserve meaning", detail: "Keyboard focus should follow a logical order that matches the visual and reading flow." },
  { id: "SIA-R57", title: "Non-text UI contrast below 3:1", detail: "Icons, controls, and other non-text UI elements need sufficient contrast to be perceived." },
  { id: "SIA-R58", title: "Missing skip navigation / bypass link", detail: "Provide a quick way to bypass repeated content so keyboard users can reach the main content efficiently." },
  { id: "SIA-R59", title: "Link purpose ambiguous in context", detail: "Links should be understandable on their own or clearly supported by surrounding context." },
  { id: "SIA-R60", title: "No multiple ways provided to locate content", detail: "Users should have more than one way to find key pages or content areas." },
  { id: "SIA-R61", title: "Headings and labels not descriptive", detail: "Headings and form labels should be specific enough to explain their purpose." },
  { id: "SIA-R62", title: "Section missing heading", detail: "Sections of content should have a heading or equivalent structure where appropriate." },
  { id: "SIA-R63", title: "Focus indicator does not meet enhanced appearance", detail: "Focus styles should be clearly visible and strong enough to detect." },
  { id: "SIA-R64", title: "Heading level skipped", detail: "Heading hierarchy should progress logically without skipping levels unnecessarily." },
  { id: "SIA-R65", title: "Focus indicators removed", detail: "Do not suppress focus outlines or visible focus states; users must always know where keyboard focus is located." },
  { id: "SIA-R66", title: "Error not identified in text", detail: "Form errors should be described in text so users know what happened and how to respond." },
  { id: "SIA-R67", title: "Form field missing label or instruction", detail: "Inputs should have clear labels and instructions to guide user input." },
  { id: "SIA-R68", title: "Text may be clipped when resized", detail: "Content should remain usable when text is zoomed or resized." },
  { id: "SIA-R69", title: "Text contrast below AA minimum", detail: "Body text should maintain readable contrast against its background for common accessibility standards." },
  { id: "SIA-R70", title: "Live audio/video missing real-time captions", detail: "Live media should provide captions in real time for accessibility." },
  { id: "SIA-R71", title: "Pre-recorded video missing sign language", detail: "Where required, provide sign language interpretation as an accessible alternative." },
  { id: "SIA-R72", title: "Pre-recorded video missing extended audio description", detail: "Provide extended audio descriptions when visual information cannot be conveyed otherwise." },
  { id: "SIA-R73", title: "Pre-recorded media missing text alternative", detail: "Media should be accompanied by a text alternative that conveys the same information." },
  { id: "SIA-R74", title: "Audio-only live content missing text alternative", detail: "Live audio-only content should be supported by a text-based alternative where required." },
  { id: "SIA-R75", title: "Images of text used instead of real text", detail: "Use real text whenever possible so users can resize, translate, and interact with the content." },
  { id: "SIA-R76", title: "Images of text used with no exception", detail: "Images of text should only be used when there is a strong, valid reason." },
  { id: "SIA-R77", title: "Visual presentation restrictions violated", detail: "Content should respect user preferences for spacing, scaling, and presentation adjustments." },
  { id: "SIA-R78", title: "Context change on user request only", detail: "Only change context when users explicitly request it and understand the result." },
  { id: "SIA-R79", title: "Error suggestion not provided", detail: "When an error occurs, suggest ways to correct it if possible." },
  { id: "SIA-R80", title: "Error prevention not provided for all inputs", detail: "Forms with important consequences should offer review or confirmation protections." },
  { id: "SIA-R81", title: "Context-sensitive help not available", detail: "Help or guidance should be available when users may need extra support." },
  { id: "SIA-R82", title: "Keyboard operation not available", detail: "All essential functions should be reachable and operable with a keyboard." },
  { id: "SIA-R83", title: "Time limits exist", detail: "Users should be able to adjust or extend time limits where reasonable." },
  { id: "SIA-R84", title: "Interruptions cannot be postponed", detail: "Provide a way to defer interruptions or notifications when they would disrupt tasks." },
  { id: "SIA-R85", title: "Re-authentication causes data loss", detail: "Users should not lose unsaved work when they need to sign in again." },
  { id: "SIA-R86", title: "Three flashes in one second", detail: "Avoid visual flashes that could trigger photosensitive seizures." },
  { id: "SIA-R87", title: "Page missing main landmark", detail: "Use a main landmark so screen reader users can quickly jump to the primary content area." },
  { id: "SIA-R88", title: "Word spacing below minimum", detail: "Text spacing should allow comfortable reading without clipping or overlap." },
  { id: "SIA-R89", title: "Focus indicator area too small", detail: "Focus appearance should be large enough to notice easily." },
  { id: "SIA-R90", title: "Focused component fully obscured", detail: "Focused elements should remain visible and not be hidden behind overlays or sticky content." },
  { id: "SIA-R91", title: "Line height too low", detail: "Text should have enough line spacing to be readable and scan-friendly." },
  { id: "SIA-R92", title: "Letter spacing too low", detail: "Text should not be cramped; allow enough spacing for readability." },
  { id: "SIA-R93", title: "Word spacing too low", detail: "Words should remain clearly separated when text spacing adjustments are applied." },
  { id: "SIA-R94", title: "Paragraph spacing too low", detail: "Paragraphs should have enough separation to be read as distinct blocks of content." },
  { id: "SIA-R95", title: "Animation triggered by interaction", detail: "Motion should be reduced or avoid disorienting effects when users interact with content." },
  { id: "SIA-R96", title: "Table missing scope on header cells", detail: "Header cells should be associated correctly so relationships are exposed to assistive tech." },
  { id: "SIA-R97", title: "Fieldset missing legend element", detail: "Grouped controls should use fieldset and legend to explain their shared purpose." },
  { id: "SIA-R98", title: "ARIA expanded state not set correctly", detail: "Expandable widgets should keep their expanded state synchronized with the UI." },
  { id: "SIA-R99", title: "ARIA hidden used on focusable element", detail: "Focusable elements should not be hidden from assistive technologies while still reachable by keyboard." },
  { id: "SIA-R100", title: "PDF document missing accessibility tags", detail: "PDFs should contain accessibility structure so screen readers can interpret them." },
  { id: "SIA-R101", title: "Document structure elements misused", detail: "Use structural elements according to their meaning to preserve a clear content outline." },
  { id: "SIA-R102", title: "Decorative image not hidden", detail: "Decorative imagery should be hidden from assistive technology so it is not announced needlessly." },
  { id: "SIA-R103", title: "Background image conveys information", detail: "If background imagery conveys meaning, provide a real accessible equivalent." },
  { id: "SIA-R104", title: "Page auto-refreshes without user control", detail: "Automatic refresh should be avoidable or user-controlled so it does not interrupt tasks." },
  { id: "SIA-R105", title: "Multiple links with same text go to different destinations", detail: "Identical link text should not point to different places unless the destination is obvious from context." },
  { id: "SIA-R106", title: "Form error not associated with field", detail: "Errors should be tied to the related input so users know what needs correction." },
  { id: "SIA-R107", title: "Custom interactive control missing keyboard support", detail: "Any custom control must work with the keyboard, not only with a mouse or touch input." },
  { id: "SIA-R108", title: "Touch target size below minimum", detail: "Controls should be large enough to activate easily on touch devices." },
  { id: "SIA-R109", title: "Input field missing data format hint", detail: "Users should be told what format is expected when entering structured data." },
  { id: "SIA-R110", title: "Image of text used where text could be used", detail: "Prefer real text so content remains flexible, searchable, and accessible." },
  { id: "SIA-R111", title: "Complex image missing detailed long description", detail: "Complex visuals may need a fuller explanation so all important information is conveyed." },
  { id: "SIA-R112", title: "Figure element missing figcaption", detail: "Figures should include a caption when the visual needs explanatory context." },
  { id: "SIA-R113", title: "Details/summary element missing accessible name", detail: "Disclosure widgets should have an accessible name that tells users what will expand." },
  { id: "SIA-R114", title: "Iframe missing title attribute", detail: "Frames need a descriptive title so users understand the embedded content and its purpose." },
  { id: "SIA-R115", title: "Object element missing accessible name", detail: "Embedded objects should be named or described so their purpose is clear." },
  { id: "SIA-R116", title: "Select element has no accessible name", detail: "Select controls need a label that describes the choices being made." },
  { id: "SIA-R117", title: "SVG image missing accessible name", detail: "SVGs that convey meaning should expose a text alternative or accessible name." },
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