import { describe, expect, it } from "vitest";
import { serializeCsv } from "./csv";

describe("CSV export", () => {
  it("quotes commas, quotes, line breaks, and headers", () => {
    expect(
      serializeCsv([
        ["Name", "Comment"],
        ["A, B", 'Line "one"\nline two'],
      ]),
    ).toBe('"Name","Comment"\r\n"A, B","Line ""one""\nline two"\r\n');
  });

  it.each(["=1+1", "+SUM(1)", "-2+3", "@IMPORT", " \t=HYPERLINK(1)", "\ufeff=1", "\r\n@A"])(
    "neutralizes a formula-like text cell %j",
    (value) => expect(serializeCsv([[value]])).toBe(`"'${value}"\r\n`),
  );

  it("preserves ordinary text, nulls, and numbers", () => {
    expect(serializeCsv([["plain", null, 42, -5]])).toBe('"plain","","42","-5"\r\n');
  });
});
