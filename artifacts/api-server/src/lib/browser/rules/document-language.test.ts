import { describe, expect, it } from "vitest";
import {
  detectHeadingLanguageWithAdjacentText,
  detectPrimaryLanguage,
} from "./document-language";

describe("ACT-R7 language identification", () => {
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