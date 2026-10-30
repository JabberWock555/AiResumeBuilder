#!/usr/bin/env node
// Builds the sample resumes the import tests upload: a PDF (printed by Chrome)
// and a Word file, both for a made-up person. Run: node scripts/make-fixtures.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

const OUT = new URL("../e2e/fixtures/", import.meta.url);
await mkdir(OUT, { recursive: true });

const person = {
  name: "Priya Raman",
  line: "Bengaluru, KA | priya.raman@example.com | +91 98765 43210 | linkedin.com/in/priya-raman",
  summary: "Data analyst with 4 years in retail and logistics. Builds dashboards people actually use.",
  roles: [
    { head: "Senior Data Analyst | Northwind Retail", dates: "Jan 2022 – Present", bullets: ["Built a weekly sales dashboard in Tableau used by 40 store managers.", "Cut report preparation time by 6 hours a week by automating it in Python."] },
    { head: "Data Analyst, Fernway Logistics", dates: "Jul 2020 - Dec 2021", bullets: ["Cleaned 3 years of shipment data in SQL and Excel."] },
  ],
  education: ["B.Tech, Computer Science", "National Institute of Technology, Trichy 2016 – 2020"],
  skills: ["Languages: Python, SQL, R", "Tools: Tableau, Excel, Power BI"],
};

const html = `<!doctype html><html><body style="font-family:Arial;font-size:11pt;margin:40px">
<h1 style="margin:0">${person.name}</h1><p>${person.line}</p>
<h2>PROFESSIONAL SUMMARY</h2><p>${person.summary}</p>
<h2>EXPERIENCE</h2>${person.roles.map((r) => `<p><b>${r.head}</b><br>${r.dates}</p><ul>${r.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`).join("")}
<h2>EDUCATION</h2><p>${person.education.join("<br>")}</p>
<h2>SKILLS</h2><p>${person.skills.join("<br>")}</p></body></html>`;
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.setContent(html);
await writeFile(new URL("sample-resume.pdf", OUT), await page.pdf({ format: "A4" }));
await browser.close();

const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })] });
const h = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ text: person.name, heading: HeadingLevel.HEADING_1 }), p(person.line),
      h("PROFESSIONAL SUMMARY"), p(person.summary),
      h("EXPERIENCE"),
      ...person.roles.flatMap((r) => [p(r.head, { bold: true }), p(r.dates), ...r.bullets.map((b) => new Paragraph({ text: b, bullet: { level: 0 } }))]),
      h("EDUCATION"), ...person.education.map((t) => p(t)),
      h("SKILLS"), ...person.skills.map((t) => p(t)),
    ],
  }],
});
await writeFile(new URL("sample-resume.docx", OUT), await Packer.toBuffer(doc));
// Not a resume: a PDF with almost no text (like a scan).
const b2 = await chromium.launch({ channel: "chrome" });
const p2 = await b2.newPage();
await p2.setContent(`<div style="width:600px;height:800px;background:repeating-linear-gradient(45deg,#ccc,#ccc 10px,#eee 10px,#eee 20px)"></div><p>x</p>`);
await writeFile(new URL("scan-like.pdf", OUT), await p2.pdf({ format: "A4", printBackground: true }));
await b2.close();
console.log("wrote e2e/fixtures/sample-resume.pdf, sample-resume.docx, scan-like.pdf");
