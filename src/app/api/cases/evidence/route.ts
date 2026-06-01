import { NextRequest, NextResponse } from "next/server";
import { readCases, writeCases } from "@/lib/data-store";
import type { EvidenceSubmission, ConsentGrant } from "@/types";

interface EvidencePayload {
  caseReference: string;
  description: string;
  files: Array<{ name: string; size: number; type: string }>;
  extractedFields?: Array<{ key: string; label: string; value: string; confidence: string }>;
  consentGrants?: Array<{
    alb_id: string;
    alb_name: string;
    evidence_types: string[];
    consent_duration_days: number;
  }>;
}

// Validate case reference format
const CASE_REF_REGEX = /^DSA-\d{4}-\d{5}$/;

export async function POST(request: NextRequest) {
  try {
    let body: EvidencePayload;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { caseReference, description, files, extractedFields, consentGrants } = body;

    if (!caseReference) {
      return NextResponse.json(
        { error: "Case reference is required" },
        { status: 400 }
      );
    }

    // Validate case reference format
    if (!CASE_REF_REGEX.test(caseReference)) {
      return NextResponse.json(
        { error: "No application found for that reference number" },
        { status: 404 }
      );
    }

    if (!description || description.trim().length === 0) {
      return NextResponse.json(
        { error: "A description of the evidence is required" },
        { status: 400 }
      );
    }

    // Limit description length
    if (description.length > 2000) {
      return NextResponse.json(
        { error: "Description must be 2000 characters or fewer" },
        { status: 400 }
      );
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "At least one file must be uploaded" },
        { status: 400 }
      );
    }

    // Limit number of files
    if (files.length > 20) {
      return NextResponse.json(
        { error: "You can upload up to 20 files at a time" },
        { status: 400 }
      );
    }

    const cases = readCases();
    const caseIndex = cases.findIndex((c) => c.case_id === caseReference);

    if (caseIndex === -1) {
      return NextResponse.json(
        { error: "No application found for that reference number" },
        { status: 404 }
      );
    }

    const caseRecord = cases[caseIndex];

    // Only allow evidence upload when status is awaiting_evidence or evidence_requested
    if (
      caseRecord.status !== "awaiting_evidence" &&
      caseRecord.status !== "evidence_requested"
    ) {
      return NextResponse.json(
        { error: "Evidence cannot be uploaded for this case at its current stage" },
        { status: 400 }
      );
    }

    // Build evidence submission record
    const now = new Date().toISOString();
    const fileNames = files
      .map((f) => (f.name || "unknown").replace(/[/\\]/g, "_"))
      .join(", ");

    // Build consent grants if provided
    const grants: ConsentGrant[] = (consentGrants || []).map((g) => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + g.consent_duration_days);
      return {
        alb_id: g.alb_id,
        alb_name: g.alb_name,
        granted_at: now,
        expires_at: expiresAt.toISOString(),
        evidence_types: g.evidence_types,
      };
    });

    const submission: EvidenceSubmission = {
      submitted_at: now,
      description: description.trim(),
      files: files.map((f) => ({
        name: (f.name || "unknown").replace(/[/\\]/g, "_"),
        size: f.size,
        type: f.type,
      })),
      extracted_fields: (extractedFields || []).map((field) => ({
        key: field.key,
        label: field.label,
        value: field.value,
        confidence: field.confidence as "high" | "medium" | "low",
      })),
      consent_grants: grants.length > 0 ? grants : undefined,
    };

    // Update case: transition to evidence_received, add timeline entry, store submission
    caseRecord.status = "evidence_received";
    caseRecord.last_updated = now;
    caseRecord.timeline.push({
      date: now,
      event: "evidence_received",
      note: `Evidence uploaded by applicant: ${description.trim().slice(0, 500)}. Files: ${fileNames.slice(0, 500)}`,
    });

    // Add consent grant timeline entries
    if (grants.length > 0) {
      caseRecord.timeline.push({
        date: now,
        event: "notification_sent",
        note: `Applicant granted evidence access consent to: ${grants.map((g) => g.alb_name).join(", ")}`,
      });
    }

    // Append to evidence_submissions array
    if (!caseRecord.evidence_submissions) {
      caseRecord.evidence_submissions = [];
    }
    caseRecord.evidence_submissions.push(submission);

    cases[caseIndex] = caseRecord;
    writeCases(cases);

    return NextResponse.json(
      { message: "Evidence uploaded successfully", caseReference },
      { status: 200 }
    );
  } catch (error) {
    console.error("Evidence upload error:", error);
    return NextResponse.json(
      { error: "Sorry, there is a problem with the service. Try again later." },
      { status: 500 }
    );
  }
}
