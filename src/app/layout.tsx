import type { Metadata } from "next";
// Open fonts, self-hosted from npm (no build-time download). Files only load
// when a page uses that family.
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-sans-3";
import "@fontsource/merriweather/400.css";
import "@fontsource/merriweather/700.css";
import "@fontsource/carlito/400.css";
import "@fontsource/carlito/700.css";
import "@fontsource/tinos/400.css";
import "@fontsource/tinos/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Resume builder", template: "%s · Resume builder" },
  description: "Build, check and tailor your resume.",
};

// Sets data-theme before first paint so a saved light/dark choice doesn't flash.
// "system" leaves the attribute off and tokens.css follows the OS.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
