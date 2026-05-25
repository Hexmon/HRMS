import type { AdminEmailTemplateRecord } from "#shared";
import type { RenderedEmailTemplate } from "./types.js";

export function renderEmailTemplate(
  template: Pick<AdminEmailTemplateRecord, "subject" | "body">,
  variables: Record<string, unknown>
): RenderedEmailTemplate {
  const subject = interpolate(template.subject, variables);
  const text = interpolate(template.body, variables);
  return {
    subject,
    text,
    html: textToHtml(text)
  };
}

function interpolate(value: string, variables: Record<string, unknown>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_match, key: string) => {
    const replacement = variables[key];
    if (replacement === null || replacement === undefined) {
      return "";
    }
    return String(replacement);
  });
}

function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/gu, "<br>")}</p>`);
  return paragraphs.length > 0 ? paragraphs.join("\n") : "<p></p>";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
