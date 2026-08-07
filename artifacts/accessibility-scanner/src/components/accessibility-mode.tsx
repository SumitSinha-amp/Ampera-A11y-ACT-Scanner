import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Keyboard,
  Minus,
  Pause,
  PersonStanding,
  Play,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STORAGE_KEY = "a11y-accessibility-mode";

type AccessibilityPreferences = {
  enabled: boolean;
  highContrast: boolean;
  focusHighlight: boolean;
  keyboardMode: boolean;
  speechReader: boolean;
  screenReaderMode: boolean;
  showSpeechViewer: boolean;
  reducedMotion: boolean;
  zoom: number;
  fontSize: number;
};

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  enabled: false,
  highContrast: false,
  focusHighlight: true,
  keyboardMode: true,
  speechReader: false,
  screenReaderMode: false,
  showSpeechViewer: false,
  reducedMotion: false,
  zoom: 100,
  fontSize: 100,
};

function loadPreferences(): AccessibilityPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AccessibilityPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...saved,
      zoom: Number.isFinite(saved.zoom) ? Math.min(150, Math.max(90, Number(saved.zoom))) : 100,
      fontSize: Number.isFinite(saved.fontSize) ? Math.min(150, Math.max(90, Number(saved.fontSize))) : 100,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function applyPreferences(preferences: AccessibilityPreferences) {
  const root = document.documentElement;
  const body = document.body;
  const active = preferences.enabled;

  root.classList.toggle("a11y-mode-enabled", active);
  root.classList.toggle("a11y-high-contrast", active && preferences.highContrast);
  root.classList.toggle("a11y-focus-highlight", active && preferences.focusHighlight);
  root.classList.toggle("a11y-keyboard-mode", active && preferences.keyboardMode);
  root.classList.toggle("a11y-reduced-motion", active && preferences.reducedMotion);
  root.dataset.a11yZoom = active ? String(preferences.zoom) : "100";
  root.dataset.a11yFontSize = active ? String(preferences.fontSize) : "100";
  root.style.setProperty("--a11y-zoom", active ? String(preferences.zoom / 100) : "1");
  root.style.setProperty("--a11y-font-scale", active ? String(preferences.fontSize / 100) : "1");
  body.dataset.a11yMode = active ? "true" : "false";
}

function getReadableText(): string {
  const selected = window.getSelection()?.toString().trim();
  if (selected) return selected;
  const main = document.querySelector("main");
  return (main?.innerText ?? document.body.innerText).replace(/\s+/g, " ").trim().slice(0, 12000);
}

function getFocusedText(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  const labelledText = labelledBy
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const text =
    element.getAttribute("aria-label") ||
    labelledText ||
    (element as HTMLInputElement).placeholder ||
    element.textContent ||
    element.getAttribute("title") ||
    "";
  const role = element.getAttribute("role");
  const value =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : "";
  const readable = [role, text, value].filter(Boolean).join(": ").replace(/\s+/g, " ").trim();
  return readable.slice(0, 500);
}

export function AccessibilityModeControl() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(loadPreferences);
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechText, setSpeechText] = useState("");

  useEffect(() => {
    applyPreferences(preferences);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences still apply for the current session if storage is unavailable.
    }
  }, [preferences]);

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis?.cancel();
    }
    setSpeaking(false);
  };

  const speakText = (text: string) => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    setSpeechText(text);
    setSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!preferences.enabled || !preferences.screenReaderMode || !("speechSynthesis" in window)) return;

    let focusTimer: number | undefined;
    const readFocusedElement = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-a11y-ignore-focus-reading]")) return;
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        const text = getFocusedText(target);
        if (text) speakText(text);
      }, 120);
    };

    document.addEventListener("focusin", readFocusedElement);
    return () => {
      document.removeEventListener("focusin", readFocusedElement);
      window.clearTimeout(focusTimer);
    };
  }, [preferences.enabled, preferences.screenReaderMode]);

  useEffect(() => {
    if (!preferences.enabled || (!preferences.speechReader && !preferences.screenReaderMode)) {
      stopSpeaking();
    }
  }, [preferences.enabled, preferences.speechReader, preferences.screenReaderMode]);

  useEffect(() => {
    const keyboardShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape" && window.speechSynthesis?.speaking) stopSpeaking();
    };
    window.addEventListener("keydown", keyboardShortcut);
    return () => {
      window.removeEventListener("keydown", keyboardShortcut);
      stopSpeaking();
    };
  }, []);

  const update = <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const reset = () => {
    stopSpeaking();
    setSpeechText("");
    setPreferences(DEFAULT_PREFERENCES);
  };

  const readPage = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      stopSpeaking();
      return;
    }
    const text = getReadableText();
    speakText(text);
  };

  return (
    <>
      {preferences.enabled && preferences.showSpeechViewer && (
        <div
          className="fixed bottom-20 left-4 z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur"
          role="status"
          aria-live="polite"
          aria-label="Speech viewer"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Volume2 className={`h-4 w-4 ${speaking ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              Speech viewer
            </div>
            <span className="text-[11px] text-muted-foreground">{speaking ? "Reading" : "Ready"}</span>
          </div>
          <p className="max-h-28 overflow-y-auto rounded-md bg-muted/60 p-2 text-xs leading-5 text-foreground">
            {speechText || "Focus a control or choose Read page to see the text being spoken."}
          </p>
          {speaking && (
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8" onClick={stopSpeaking}>
              <Pause className="mr-2 h-3.5 w-3.5" />
              Stop reading
            </Button>
          )}
        </div>
      )}

      <div className="accessibility-mode-control fixed bottom-4 left-4 z-[70]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="default"
              className="h-12 w-12 rounded-full border-2 border-[#9c369a] bg-white text-[#9c369a] shadow-lg ring-2 ring-[#9c369a]/20 transition-transform hover:scale-105 hover:bg-white focus-visible:ring-4 focus-visible:ring-[#9c369a] focus-visible:ring-offset-2"
              onClick={() => setOpen(true)}
              aria-label="Open accessibility mode settings"
              aria-pressed={preferences.enabled}
              data-tour="accessibility-mode"
              data-tour-title="Accessibility mode"
              data-tour-description="Customize contrast, focus visibility, keyboard navigation, zoom, font size, motion, and speech reading."
            >
              <PersonStanding className="h-7 w-7" strokeWidth={2.25} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Accessibility mode</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PersonStanding className="h-6 w-6 text-primary" strokeWidth={2.5} aria-hidden="true" />
              Accessibility mode
            </DialogTitle>
            <DialogDescription>
              Personalize the workspace for vision, motor, cognitive, and reading needs. Changes are saved on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div>
                <Label htmlFor="a11y-mode-enabled" className="text-base font-semibold">Enable accessibility mode</Label>
                <p className="mt-1 text-xs text-muted-foreground">Turn all selected accessibility preferences on or off together.</p>
              </div>
              <Switch
                id="a11y-mode-enabled"
                checked={preferences.enabled}
                onCheckedChange={(value) => update("enabled", value)}
                aria-label="Enable accessibility mode"
              />
            </div>

            <section aria-labelledby="a11y-visual-heading" className="space-y-4">
              <div>
                <h3 id="a11y-visual-heading" className="font-semibold">Visual adjustments</h3>
                <p className="text-xs text-muted-foreground">Improve readability, contrast, and visual focus.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <PreferenceSwitch
                  label="High contrast"
                  description="Increase color contrast for text, controls, and boundaries."
                  checked={preferences.highContrast}
                  onCheckedChange={(value) => update("highContrast", value)}
                />
                <PreferenceSwitch
                  label="Strong focus indicator"
                  description="Show a larger, high-contrast outline around the active control."
                  checked={preferences.focusHighlight}
                  onCheckedChange={(value) => update("focusHighlight", value)}
                />
                <PreferenceSwitch
                  label="Reduce motion"
                  description="Minimize transitions and animations across the workspace."
                  checked={preferences.reducedMotion}
                  onCheckedChange={(value) => update("reducedMotion", value)}
                />
                <PreferenceSwitch
                  label="Keyboard navigation mode"
                  description="Keep keyboard focus prominent and enable Alt+Shift+A to open this panel."
                  checked={preferences.keyboardMode}
                  onCheckedChange={(value) => update("keyboardMode", value)}
                  icon={<Keyboard className="h-4 w-4" aria-hidden="true" />}
                />
              </div>
            </section>

            <Separator />

            <section aria-labelledby="a11y-size-heading" className="space-y-4">
              <div>
                <h3 id="a11y-size-heading" className="font-semibold">Size and zoom</h3>
                <p className="text-xs text-muted-foreground">Adjust the interface without changing your browser settings.</p>
              </div>
              <SizeControl
                label="Interface zoom"
                value={preferences.zoom}
                min={90}
                max={150}
                step={5}
                onChange={(value) => update("zoom", value)}
                icon={<ZoomIn className="h-4 w-4" aria-hidden="true" />}
              />
              <SizeControl
                label="Text size"
                value={preferences.fontSize}
                min={90}
                max={150}
                step={5}
                onChange={(value) => update("fontSize", value)}
                icon={<Plus className="h-4 w-4" aria-hidden="true" />}
              />
            </section>

            <Separator />

            <section aria-labelledby="a11y-speech-heading" className="space-y-3">
              <div>
                <h3 id="a11y-speech-heading" className="font-semibold">Speech reader</h3>
                <p className="text-xs text-muted-foreground">Read selected text, the current page, or automatically read each control as it receives focus.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant={preferences.speechReader ? "default" : "outline"} onClick={() => update("speechReader", !preferences.speechReader)}>
                  {preferences.speechReader ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
                  {preferences.speechReader ? "Speech reader enabled" : "Enable speech reader"}
                </Button>
                <Button type="button" variant="outline" onClick={readPage} disabled={!preferences.speechReader}>
                  {speaking ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                  {speaking ? "Stop reading" : "Read page"}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <PreferenceSwitch
                  label="Screen reader mode"
                  description="Speak the accessible name and value of each focused control."
                  checked={preferences.screenReaderMode}
                  onCheckedChange={(value) => update("screenReaderMode", value)}
                  icon={<Keyboard className="h-4 w-4" aria-hidden="true" />}
                />
                <PreferenceSwitch
                  label="Show speech viewer"
                  description="Display the text being spoken in a floating viewer."
                  checked={preferences.showSpeechViewer}
                  onCheckedChange={(value) => update("showSpeechViewer", value)}
                  icon={<Volume2 className="h-4 w-4" aria-hidden="true" />}
                />
              </div>
              {!("speechSynthesis" in window) && (
                <p className="text-xs text-destructive">Speech reading is not supported by this browser.</p>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">Shortcut: Alt + Shift + A</p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button type="button" onClick={() => setOpen(false)}>
                  <Check className="mr-2 h-4 w-4" />
                  Done
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreferenceSwitch({
  label,
  description,
  checked,
  onCheckedChange,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="flex gap-2">
        {icon && <span className="mt-0.5 text-primary">{icon}</span>}
        <div>
          <Label className="font-medium">{label}</Label>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function SizeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  icon: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-2">{icon}{label}</Label>
        <span className="font-mono text-sm text-muted-foreground">{value}%</span>
      </div>
      <div className="flex items-center gap-3">
        <Minus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={([next]) => onChange(next)}
          aria-label={label}
        />
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}