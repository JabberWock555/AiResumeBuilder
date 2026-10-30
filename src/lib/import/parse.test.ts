import { describe, expect, it } from "vitest";
import { importSummary, textToResume } from "./parse";
import type { EducationEntry, ExperienceEntry, SimpleEntry, SkillsEntry } from "@/lib/resume/schema";

// Two made-up resumes in common layouts, as PDF/Word text extraction gives them.
const CLASSIC = `Priya Raman
Bengaluru, KA | priya.raman@example.com | +91 98765 43210 | linkedin.com/in/priya-raman | priyaraman.dev

PROFESSIONAL SUMMARY
Data analyst with 4 years in retail and logistics. Builds dashboards people actually use.

EXPERIENCE
Senior Data Analyst | Northwind Retail
Jan 2022 – Present
• Built a weekly sales dashboard in Tableau used by 40 store managers.
• Cut report preparation time by 6 hours a week by automating it in Python.
Data Analyst, Fernway Logistics
Bengaluru, KA
Jul 2020 - Dec 2021
• Cleaned 3 years of shipment data in SQL and Excel.

EDUCATION
B.Tech, Computer Science
National Institute of Technology, Trichy 2016 – 2020 GPA: 8.4/10

SKILLS
Languages: Python, SQL, R
Tools: Tableau, Excel, Power BI

CERTIFICATIONS
Google Data Analytics Certificate - Coursera (2021)
`;

const PLAIN = `Sam Rivera
sam.rivera@example.com
(555) 010-2299

Work Experience
Product Designer at Ledgerline
03/2021 - 08/2024
- Redesigned onboarding for small-business accounts.
- Ran usability tests with 20 customers.

Education
Pacific College of Art
BFA, Interaction Design, 2020

Skills
Figma, Prototyping, User research, Design systems
`;

describe("textToResume", () => {
  it("reads contact details from the header", () => {
    const c = textToResume(CLASSIC).contact;
    expect(c).toMatchObject({
      fullName: "Priya Raman",
      email: "priya.raman@example.com",
      phone: "+91 98765 43210",
      linkedin: "priya-raman",
      website: "priyaraman.dev",
      city: "Bengaluru",
      state: "KA",
    });
  });

  it("splits roles by their dates and keeps their bullets", () => {
    const r = textToResume(CLASSIC);
    const exp = r.sections.find((s) => s.type === "experience")!.entries as ExperienceEntry[];
    expect(exp).toHaveLength(2);
    expect(exp[0]).toMatchObject({ role: "Senior Data Analyst", company: "Northwind Retail", start: { year: 2022, month: 1 }, end: "present" });
    expect(exp[0].bullets.map((b) => b.text)).toEqual([
      "Built a weekly sales dashboard in Tableau used by 40 store managers.",
      "Cut report preparation time by 6 hours a week by automating it in Python.",
    ]);
    expect(exp[1]).toMatchObject({ role: "Data Analyst", company: "Fernway Logistics", start: { year: 2020, month: 7 }, end: { year: 2021, month: 12 } });
    expect(exp[1].location).toContain("Bengaluru");
  });

  it("reads education, skills groups, summary and certifications", () => {
    const r = textToResume(CLASSIC);
    const edu = r.sections.find((s) => s.type === "education")!.entries as EducationEntry[];
    expect(edu[0]).toMatchObject({ degree: "B.Tech, Computer Science", year: 2020, gpa: "8.4/10" });
    expect(edu[0].institution).toBe("National Institute of Technology");
    expect(edu[0].location).toBe("Trichy");
    const skills = r.sections.find((s) => s.type === "skills")!.entries as SkillsEntry[];
    expect(skills).toEqual([
      expect.objectContaining({ category: "Languages", items: ["Python", "SQL", "R"] }),
      expect.objectContaining({ category: "Tools", items: ["Tableau", "Excel", "Power BI"] }),
    ]);
    expect(r.summary.text).toMatch(/^Data analyst with 4 years/);
    const certs = r.sections.find((s) => s.type === "certifications")!.entries as SimpleEntry[];
    expect(certs[0]).toMatchObject({ name: "Google Data Analytics Certificate", issuer: "Coursera", year: 2021 });
  });

  it("handles a plainer layout: 'Role at Company', numeric dates, dash bullets, one skills line", () => {
    const r = textToResume(PLAIN);
    expect(r.contact.fullName).toBe("Sam Rivera");
    expect(r.contact.phone).toBe("(555) 010-2299");
    const exp = r.sections.find((s) => s.type === "experience")!.entries as ExperienceEntry[];
    expect(exp[0]).toMatchObject({ role: "Product Designer", company: "Ledgerline", start: { year: 2021, month: 3 }, end: { year: 2024, month: 8 } });
    expect(exp[0].bullets).toHaveLength(2);
    const edu = r.sections.find((s) => s.type === "education")!.entries as EducationEntry[];
    expect(edu[0]).toMatchObject({ institution: "Pacific College of Art", degree: "BFA, Interaction Design", year: 2020 });
    const skills = r.sections.find((s) => s.type === "skills")!.entries as SkillsEntry[];
    expect(skills[0].items).toEqual(["Figma", "Prototyping", "User research", "Design systems"]);
  });

  it("never fails: junk in gives an empty but valid document", () => {
    const r = textToResume("%%%\n\n12345\n");
    expect(r.sections.map((s) => s.type)).toEqual(["experience", "education", "skills"]);
    expect(importSummary(r)).toMatchObject({ roles: 0, education: 0, skills: 0 });
  });

  it("summarises what it found", () => {
    expect(importSummary(textToResume(CLASSIC))).toEqual({ name: true, email: true, roles: 2, education: 1, skills: 6, summary: true });
  });

  it("works when the file lost its bullet markers (how PDF and Word text comes out)", () => {
    const fromPdf =
      "Priya Raman\nBengaluru, KA | priya.raman@example.com | +91 98765 43210 | linkedin.com/in/priya-raman\nPROFESSIONAL SUMMARY\nData analyst with 4 years in retail and logistics. Builds dashboards people actually use.\nEXPERIENCE\nSenior Data Analyst | Northwind Retail\nJan 2022 – Present\nBuilt a weekly sales dashboard in Tableau used by 40 store managers.\nCut report preparation time by 6 hours a week by automating it in Python.\nData Analyst, Fernway Logistics\nJul 2020 - Dec 2021\nCleaned 3 years of shipment data in SQL and Excel.\nEDUCATION\nB.Tech, Computer Science\nNational Institute of Technology, Trichy 2016 – 2020\nSKILLS\nLanguages: Python, SQL, R\nTools: Tableau, Excel, Power BI";
    const r = textToResume(fromPdf);
    const exp = r.sections.find((s) => s.type === "experience")!.entries as ExperienceEntry[];
    expect(exp.map((e) => [e.role, e.company, e.bullets.length])).toEqual([
      ["Senior Data Analyst", "Northwind Retail", 2],
      ["Data Analyst", "Fernway Logistics", 1],
    ]);
    // Word puts a blank line between paragraphs; that changes nothing.
    const fromWord = fromPdf.replace(/\n/g, "\n\n");
    expect(importSummary(textToResume(fromWord))).toEqual(importSummary(r));
  });
});
