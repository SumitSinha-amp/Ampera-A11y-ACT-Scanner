import { describe, expect, it } from "vitest";
import {
  detectHeadingLanguageWithAdjacentText,
  detectPrimaryLanguage,
} from "./language-parts-review";

describe("ACT-R132 language review evidence", () => {
  const spanishParagraph =
    "Accessible Universidad es una universidad ficticia, y esta es su página de ficción. Esta página está diseñada para demostrar una variedad de problemas de diseño web que se traducen en problemas para los visitantes con discapacidad.";

  it("identifies the AU Spanish paragraph and contextual heading as Spanish", () => {
    expect(detectPrimaryLanguage(spanishParagraph)).toBe("es");
    expect(detectPrimaryLanguage(`Bienvenido! ${spanishParagraph}`)).toBe("es");
  });

  it("does not misclassify the corresponding English content", () => {
    expect(
      detectPrimaryLanguage(
        "Accessible University is a fictional university, and this is its fictional home page. This page is designed to demonstrate a variety of common web design problems that prevent visitors with disabilities from accessing content.",
      ),
    ).toBe("en");
  });

  it("does not guess from a short heading without contextual evidence", () => {
    expect(detectPrimaryLanguage("Bienvenido!")).toBeNull();
  });

  it("does not misclassify the Dream Destination English heading as French", () => {
    expect(
      detectPrimaryLanguage(
        "Buy travel packages for your favorite destinations today!",
      ),
    ).toBeNull();
  });

  it("still identifies a similarly sized, confidently French sentence", () => {
    expect(
      detectPrimaryLanguage(
        "Achetez des forfaits de voyage pour vos destinations préférées dès aujourd’hui !",
      ),
    ).toBe("fr");
  });

  it.each([1, 2, 4])("does not guess French from ambiguous English policy text repeated %i times", (copies) => {
    const text = "Medical reasons to cancel your domestic travel, and receive up to INR3500 compensation against airline cancellation charges per person per segment.";
    expect(detectPrimaryLanguage(Array(copies).fill(text).join(" "))).toBeNull();
  });

  it("identifies English travel text with a clear lead", () => {
    expect(detectPrimaryLanguage(
      "Book domestic and international flights with flexible cancellation options. Compare fares, choose your destination and enjoy a comfortable journey with your family.",
    )).toBe("en");
  });

  it.each([
    ["fr", "Les lecteurs peuvent consulter cette page pour découvrir les offres disponibles et réserver leurs vacances en toute sécurité. Veuillez choisir votre destination et les dates de votre prochain voyage."],
    ["de", "Diese Seite enthält wichtige Informationen zur Buchung Ihrer Reise. Bitte wählen Sie Ihr Reiseziel und die gewünschten Daten aus, um alle verfügbaren Angebote zu vergleichen."],
  ])("still identifies a clear longer %s passage", (language, text) => {
    expect(detectPrimaryLanguage(text)).toBe(language);
  });

  it("does not borrow ambiguous policy text to label an English heading", () => {
    expect(detectHeadingLanguageWithAdjacentText(
      "Medical cancellation",
      "Medical reasons to cancel your domestic travel, and receive up to INR3500 compensation against airline cancellation charges per person per segment.",
      "en",
    )).toBeNull();
  });

  it("uses adjacent foreign-language text to identify a short translated heading", () => {
    expect(
      detectHeadingLanguageWithAdjacentText(
        "Bienvenido!",
        spanishParagraph,
        "en",
      ),
    ).toBe("es");
  });

  it("does not let same-language adjacent content misclassify a short heading", () => {
    expect(
      detectHeadingLanguageWithAdjacentText(
        "CATEGORIES",
        "Select a month from the archive. Accessibility documents, HTML tables, languages, mobile apps, publishing, screen readers, social media, and typography.",
        "en",
      ),
    ).toBeNull();
  });
});