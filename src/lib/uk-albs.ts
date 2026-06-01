/**
 * UK Government Arms Length Bodies (ALBs) that commonly require
 * similar evidence to DSA applications.
 *
 * Each ALB is tagged with the evidence types it typically requires,
 * matching the document type keys used in the extraction pipeline.
 */

import type { GovernmentALB } from "@/types";

export const UK_ALBS: GovernmentALB[] = [
  // ── Student Finance & Education ──────────────────────────
  {
    alb_id: "sfe",
    name: "Student Finance England",
    abbreviation: "SFE",
    description: "Administers student loans, grants and allowances including DSA for students in England.",
    evidence_types: ["diagnostic", "address", "bank", "invoice", "quote"],
    website: "https://www.gov.uk/student-finance",
  },
  {
    alb_id: "sfw",
    name: "Student Finance Wales",
    abbreviation: "SFW",
    description: "Provides student finance for Welsh students, including disability support.",
    evidence_types: ["diagnostic", "address", "bank"],
    website: "https://www.studentfinancewales.co.uk",
  },
  {
    alb_id: "saas",
    name: "Student Awards Agency Scotland",
    abbreviation: "SAAS",
    description: "Provides funding for Scottish students in higher education.",
    evidence_types: ["diagnostic", "address", "bank"],
    website: "https://www.saas.gov.uk",
  },

  // ── Health & Disability ──────────────────────────────────
  {
    alb_id: "pip",
    name: "Personal Independence Payment (DWP)",
    abbreviation: "PIP",
    description: "Disability benefit for people aged 16–64 with long-term health conditions or disabilities.",
    evidence_types: ["diagnostic", "address"],
    website: "https://www.gov.uk/pip",
  },
  {
    alb_id: "esa",
    name: "Employment and Support Allowance (DWP)",
    abbreviation: "ESA",
    description: "Financial support for people unable to work due to illness or disability.",
    evidence_types: ["diagnostic", "address", "bank"],
    website: "https://www.gov.uk/employment-support-allowance",
  },
  {
    alb_id: "access_to_work",
    name: "Access to Work (DWP)",
    abbreviation: "AtW",
    description: "Grants to help disabled people start or stay in work, covering specialist equipment and support.",
    evidence_types: ["diagnostic", "invoice", "quote"],
    website: "https://www.gov.uk/access-to-work",
  },
  {
    alb_id: "nhs_continuing_care",
    name: "NHS Continuing Healthcare",
    abbreviation: "NHS CHC",
    description: "Fully funded NHS care package for people with complex ongoing healthcare needs.",
    evidence_types: ["diagnostic", "address"],
    website: "https://www.nhs.uk/conditions/social-care-and-support-guide/money-work-and-benefits/nhs-continuing-healthcare",
  },

  // ── Housing & Local Services ─────────────────────────────
  {
    alb_id: "housing_benefit",
    name: "Housing Benefit (Local Authority)",
    abbreviation: "HB",
    description: "Help with rent costs for people on low income or benefits.",
    evidence_types: ["address", "bank", "diagnostic"],
    website: "https://www.gov.uk/housing-benefit",
  },
  {
    alb_id: "council_tax_reduction",
    name: "Council Tax Reduction (Local Authority)",
    abbreviation: "CTR",
    description: "Reduction in council tax for people on low income or with disabilities.",
    evidence_types: ["address", "bank", "diagnostic"],
    website: "https://www.gov.uk/council-tax-reduction",
  },
  {
    alb_id: "disabled_facilities_grant",
    name: "Disabled Facilities Grant (Local Authority)",
    abbreviation: "DFG",
    description: "Grant to fund home adaptations for disabled people.",
    evidence_types: ["diagnostic", "address", "invoice", "quote"],
    website: "https://www.gov.uk/disabled-facilities-grants",
  },

  // ── Benefits & Tax Credits ───────────────────────────────
  {
    alb_id: "universal_credit",
    name: "Universal Credit (DWP)",
    abbreviation: "UC",
    description: "Monthly payment to help with living costs for people on low income or out of work.",
    evidence_types: ["address", "bank", "diagnostic"],
    website: "https://www.gov.uk/universal-credit",
  },
  {
    alb_id: "child_benefit",
    name: "Child Benefit (HMRC)",
    abbreviation: "CB",
    description: "Regular payment to parents or guardians responsible for a child.",
    evidence_types: ["address", "bank"],
    website: "https://www.gov.uk/child-benefit",
  },
  {
    alb_id: "tax_credits",
    name: "Tax Credits (HMRC)",
    abbreviation: "TC",
    description: "Working Tax Credit and Child Tax Credit for people on low income.",
    evidence_types: ["address", "bank"],
    website: "https://www.gov.uk/tax-credits",
  },

  // ── Employment & Skills ──────────────────────────────────
  {
    alb_id: "apprenticeship_levy",
    name: "Education and Skills Funding Agency",
    abbreviation: "ESFA",
    description: "Funds education and skills training including apprenticeships and further education.",
    evidence_types: ["diagnostic", "address"],
    website: "https://www.gov.uk/government/organisations/education-and-skills-funding-agency",
  },
  {
    alb_id: "jobcentre_plus",
    name: "Jobcentre Plus (DWP)",
    abbreviation: "JCP",
    description: "Employment support and benefits for jobseekers and people unable to work.",
    evidence_types: ["address", "bank", "diagnostic"],
    website: "https://www.gov.uk/contact-jobcentre-plus",
  },

  // ── Transport ────────────────────────────────────────────
  {
    alb_id: "blue_badge",
    name: "Blue Badge Scheme (Local Authority)",
    abbreviation: "Blue Badge",
    description: "Parking concessions for people with severe mobility problems or hidden disabilities.",
    evidence_types: ["diagnostic", "address"],
    website: "https://www.gov.uk/apply-blue-badge",
  },
  {
    alb_id: "motability",
    name: "Motability Scheme",
    abbreviation: "Motability",
    description: "Scheme allowing disabled people to use their mobility allowance to lease a car or powered wheelchair.",
    evidence_types: ["diagnostic", "address"],
    website: "https://www.motability.co.uk",
  },
];

/**
 * Returns ALBs that are relevant to the given evidence types.
 * Scores by number of matching evidence types (most relevant first).
 */
export function getRelevantALBs(
  evidenceTypes: string[],
  limit = 6
): Array<GovernmentALB & { matchScore: number; matchedTypes: string[] }> {
  return UK_ALBS
    .map((alb) => {
      const matchedTypes = alb.evidence_types.filter((t) => evidenceTypes.includes(t));
      return { ...alb, matchScore: matchedTypes.length, matchedTypes };
    })
    .filter((alb) => alb.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Detect evidence types from extracted fields and description.
 */
export function detectEvidenceTypes(
  description: string,
  extractedDocType: string
): string[] {
  const t = (description + " " + extractedDocType).toLowerCase();
  const types: string[] = [];

  if (t.includes("diagnostic") || t.includes("assessment") || t.includes("medical") ||
      t.includes("disability") || t.includes("dyslexia") || t.includes("adhd") ||
      t.includes("gp") || t.includes("hospital") || t.includes("nhs")) {
    types.push("diagnostic");
  }
  if (t.includes("bank") || t.includes("statement") || t.includes("income") ||
      t.includes("salary") || t.includes("payslip")) {
    types.push("bank");
  }
  if (t.includes("address") || t.includes("council tax") || t.includes("utility") ||
      t.includes("proof of address") || t.includes("council")) {
    types.push("address");
  }
  if (t.includes("invoice") || t.includes("inv-")) {
    types.push("invoice");
  }
  if (t.includes("quote") || t.includes("quotation")) {
    types.push("quote");
  }

  return types.length > 0 ? types : ["diagnostic"]; // default fallback
}
