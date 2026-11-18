import { describe, expect, it } from "vitest";
import { detectPrimaryLanguage } from "./language-parts-review";

// A small, explicitly labelled regression corpus, not production phrase rules
// or a claim of calibrated accuracy across all supported languages.
const corpus = [
  { language: "en", text: "This booking page lets travelers choose a destination, compare available flights, review ticket terms, and make a reservation for their next trip." },
  { language: "fr", text: "Les lecteurs peuvent consulter cette page pour découvrir les offres disponibles et réserver leurs vacances en toute sécurité. Veuillez choisir votre destination et les dates de votre prochain voyage." },
  { language: "de", text: "Diese Seite enthält wichtige Informationen zur Buchung Ihrer Reise. Bitte wählen Sie Ihr Reiseziel und die gewünschten Daten aus, um alle verfügbaren Angebote zu vergleichen." },
  { language: "es", text: "Accessible Universidad es una universidad ficticia, y esta es su página de ficción. Esta página está diseñada para demostrar una variedad de problemas de diseño web que se traducen en problemas para los visitantes con discapacidad." },
  { language: "hi", text: "यह वेबसाइट यात्रियों को अपनी यात्रा की योजना बनाने और हवाई जहाज की टिकट बुक करने में सहायता करती है। कृपया अपनी यात्रा की तारीख और गंतव्य का चयन करें।" },
  { language: "ta", text: "தமிழில் எழுதப்பட்ட இந்த உரை ஒரு குறிப்பிட்ட மொழியை அடையாளம் காண உதவும் வகையில் பல சொற்களைக் கொண்டுள்ளது. பயணிகள் தங்கள் பயணத்தை திட்டமிட்டு முன்பதிவு செய்யலாம்." },
];

describe("Language review labelled regression corpus", () => {
  it.each(corpus)("accepts agreeing evidence for $language prose", ({ language, text }) => {
    expect(detectPrimaryLanguage(text)).toBe(language);
  });

  it.each([
    "Medical reasons to cancel your domestic travel, and receive up to INR3500 compensation against airline cancellation charges per person per segment.",
    "Buy travel packages for your favorite destinations today!",
    "Cleartrip Myntra Paris",
    "₹3500 120 500 2026",
    "https://example.com/fr/bonjour https://example.com/es/hola",
  ])("abstains on ambiguous policy text, labels, names or non-prose: %s", text => {
    expect(detectPrimaryLanguage(text)).toBeNull();
  });

  it("abstains when substantial evidence uses different writing systems", () => {
    expect(detectPrimaryLanguage(`${corpus[0].text} ${corpus[4].text}`)).toBeNull();
  });
});
