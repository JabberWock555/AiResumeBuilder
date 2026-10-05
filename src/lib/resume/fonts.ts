import type { ResumeSettings } from "./schema";

// Families registered by the @fontsource imports in src/app/layout.tsx.
export const FONT_STACK: Record<ResumeSettings["font"], string> = {
  "Source Serif 4": "'Source Serif 4 Variable', Georgia, serif",
  Merriweather: "Merriweather, Georgia, serif",
  "Source Sans 3": "'Source Sans 3 Variable', Arial, sans-serif",
  Carlito: "Carlito, Calibri, Arial, sans-serif",
  Tinos: "Tinos, 'Times New Roman', serif",
  Inter: "'Inter Variable', Arial, sans-serif",
};

export const FONT_LABELS: Record<ResumeSettings["font"], string> = {
  "Source Serif 4": "Source Serif",
  Merriweather: "Merriweather",
  "Source Sans 3": "Source Sans",
  Carlito: "Carlito (like Calibri)",
  Tinos: "Tinos (like Times)",
  Inter: "Inter",
};
