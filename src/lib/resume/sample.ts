import { DEFAULT_SETTINGS, type ResumeContent } from "./schema";

/** A made-up person for template previews on public pages. */
export const SAMPLE: ResumeContent = {
  contact: {
    fullName: "Sam Rivera", email: "sam.rivera@example.com", phone: "(555) 010-2288", linkedin: "samrivera",
    website: "", city: "Austin", state: "TX", showState: true, country: "United States", showCountry: false,
  },
  summary: { text: "Data analyst with 4 years in retail and logistics. Builds the dashboards teams actually open, and explains the numbers in plain language." },
  sections: [
    {
      id: "s1", type: "experience", hidden: false,
      entries: [
        {
          id: "e1", role: "Data Analyst", company: "Northline Freight", location: "Austin, TX", start: { year: 2022, month: 4 }, end: "present",
          bullets: [
            { id: "b1", text: "Built a delivery-delay dashboard in Tableau used daily by 40 dispatchers, cutting late shipments by 12%." },
            { id: "b2", text: "Automated a weekly SQL report that took 6 hours by hand." },
            { id: "b3", text: "Ran an A/B test on route assignment that saved $210k a year in fuel." },
          ],
        },
        {
          id: "e2", role: "Junior Analyst", company: "Cedar Market", location: "Dallas, TX", start: { year: 2020, month: 7 }, end: { year: 2022, month: 3 },
          bullets: [
            { id: "b4", text: "Cleaned 5 years of sales data and found the 3 stores driving 60% of returns." },
            { id: "b5", text: "Presented monthly findings to regional managers." },
          ],
        },
      ],
    },
    { id: "s2", type: "education", hidden: false, entries: [{ id: "e3", degree: "BS, Statistics", institution: "University of Texas at Austin", location: "Austin, TX", year: 2020, minor: "", gpa: "", extra: "" }] },
    { id: "s3", type: "skills", hidden: false, entries: [{ id: "e4", category: "Tools", items: ["SQL", "Python", "Tableau", "Excel"] }, { id: "e5", category: "Methods", items: ["A/B testing", "Forecasting", "Data cleaning"] }] },
  ],
};
export const SAMPLE_SETTINGS = DEFAULT_SETTINGS;
