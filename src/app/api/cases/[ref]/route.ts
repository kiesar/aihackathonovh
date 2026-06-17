import { NextRequest, NextResponse } from "next/server";
import { readCases, writeCases } from "@/lib/data-store";
import type { WorkflowStateName, EvidenceSubmission, ConsentGrant } from "@/types";

const DISPLAY_STATUS: Record<WorkflowStateName, string> = {
  awaiting_evidence: "Awaiting evidence",
  evidence_requested: "Evidence requested",
  evidence_received: "Evidence received",
  under_review: "Under review",
  awaiting_assessment: "Awaiting assessment",
  approved: "Approved",
  rejected: "Rejected",
  escalated: "Escalated",
  closed: "Closed",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await params;

    // Validate case reference format to prevent injection
    const caseRefRegex = /^DSA-\d{4}-\d{5}$/;
    if (!caseRefRegex.test(ref)) {
      return NextResponse.json(
        { error: "No application found for that reference number. Check the reference and try again." },
        { status: 404 }
      );
    }

    const cases = readCases();
    const found = cases.find((c) => c.case_id === ref);

    if (!found) {
      return NextResponse.json(
        { error: "No application found for that reference number. Check the reference and try again." },
        { status: 404 }
      );
    }

    // When an applicant views their status and the case is in
    // "evidence_requested", it means the caseworker has requested evidence
    // and the applicant has now seen that request. Automatically transition
    // to "awaiting_evidence" so the caseworker knows the applicant is aware.
    if (found.status === "evidence_requested") {
      const now = new Date().toISOString();
      found.status = "awaiting_evidence";
      found.last_updated = now;
      found.evidence_requested_date = found.evidence_requested_date ?? now;
      found.timeline.push({
        date: now,
        event: "state_transition",
        note: "Applicant viewed evidence request — status updated to Awaiting evidence.",
      });
      const allCases = cases.map((c) => (c.case_id === found.case_id ? found : c));
      writeCases(allCases);
    }

    const response: {
      status: WorkflowStateName;
      displayStatus: string;
      lastUpdated: string;
      decisionReason?: string;
      outboundLetters?: Array<{ letter_id: string; subject: string; generated_at: string; type: string; read_at?: string }>;
      evidenceSubmissions?: Array<{
        submitted_at: string;
        description: string;
        files: Array<{ name: string; size: number; type: string }>;
        consent_grants?: ConsentGrant[];
      }>;
    } = {
      status: found.status,
      displayStatus: DISPLAY_STATUS[found.status] ?? found.status,
      lastUpdated: found.last_updated,
    };

    if (
      (found.status === "approved" || found.status === "rejected") &&
      found.decision_reason
    ) {
      response.decisionReason = found.decision_reason;
    }

    // Include outbound letters summary (no sensitive body content)
    if (found.outbound_letters && found.outbound_letters.length > 0) {
      response.outboundLetters = found.outbound_letters
        .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
        .map((l) => ({
          letter_id: l.letter_id,
          subject: l.subject,
          generated_at: l.generated_at,
          type: l.type,
          read_at: l.read_at,
        }));
    }

    // Include evidence submissions with consent grants (newest first)
    if (found.evidence_submissions && found.evidence_submissions.length > 0) {
      response.evidenceSubmissions = [...found.evidence_submissions]
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
        .map((s: EvidenceSubmission) => ({
          submitted_at: s.submitted_at,
          description: s.description,
          files: s.files,
          consent_grants: s.consent_grants,
        }));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Sorry, there is a problem with the service. Try again later." },
      { status: 500 }
    );
  }
}
