import { NextRequest, NextResponse } from "next/server";
import { readCases, writeCases } from "@/lib/data-store";
import type { ConsentGrant } from "@/types";
import { UK_ALBS } from "@/lib/uk-albs";

/**
 * PUT /api/cases/:ref/consent
 *
 * Allows a student to update consent grants across all their evidence submissions.
 * Operations supported per grant:
 *   - add: add a new consent grant to the most recent submission
 *   - update: change the expiry of an existing grant
 *   - revoke: mark a grant as revoked
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await params;

    const caseRefRegex = /^DSA-\d{4}-\d{5}$/;
    if (!caseRefRegex.test(ref)) {
      return NextResponse.json({ error: "Invalid case reference" }, { status: 404 });
    }

    const body = await request.json();
    const { action, alb_id, consent_duration_days } = body as {
      action: "add" | "revoke" | "update";
      alb_id: string;
      consent_duration_days?: number;
    };

    if (!action || !alb_id) {
      return NextResponse.json({ error: "action and alb_id are required" }, { status: 400 });
    }

    const cases = readCases();
    const caseIndex = cases.findIndex((c) => c.case_id === ref);

    if (caseIndex === -1) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const caseRecord = cases[caseIndex];
    const now = new Date().toISOString();

    if (action === "add") {
      // Validate ALB exists
      const alb = UK_ALBS.find((a) => a.alb_id === alb_id);
      if (!alb) {
        return NextResponse.json({ error: "Unknown ALB" }, { status: 400 });
      }
      if (!consent_duration_days || consent_duration_days <= 0) {
        return NextResponse.json({ error: "consent_duration_days is required for add" }, { status: 400 });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + consent_duration_days);

      const newGrant: ConsentGrant = {
        alb_id: alb.alb_id,
        alb_name: alb.name,
        granted_at: now,
        expires_at: expiresAt.toISOString(),
        evidence_types: alb.evidence_types,
      };

      // Add to most recent evidence submission, or all submissions
      if (!caseRecord.evidence_submissions || caseRecord.evidence_submissions.length === 0) {
        return NextResponse.json(
          { error: "No evidence submissions found to attach consent to" },
          { status: 400 }
        );
      }

      // Add to the most recent submission
      const lastIdx = caseRecord.evidence_submissions.length - 1;
      const existing = caseRecord.evidence_submissions[lastIdx].consent_grants ?? [];
      // Remove any existing grant for this ALB first
      const filtered = existing.filter((g) => g.alb_id !== alb_id);
      caseRecord.evidence_submissions[lastIdx].consent_grants = [...filtered, newGrant];

      caseRecord.timeline.push({
        date: now,
        event: "notification_sent",
        note: `Applicant added consent for ${alb.name}`,
      });

    } else if (action === "revoke") {
      // Revoke across all submissions
      let found = false;
      caseRecord.evidence_submissions?.forEach((sub) => {
        sub.consent_grants?.forEach((g) => {
          if (g.alb_id === alb_id && !g.revoked_at) {
            g.revoked_at = now;
            found = true;
          }
        });
      });

      if (!found) {
        return NextResponse.json({ error: "No active consent found for this ALB" }, { status: 404 });
      }

      const albName = UK_ALBS.find((a) => a.alb_id === alb_id)?.name ?? alb_id;
      caseRecord.timeline.push({
        date: now,
        event: "notification_sent",
        note: `Applicant revoked consent for ${albName}`,
      });

    } else if (action === "update") {
      if (!consent_duration_days || consent_duration_days <= 0) {
        return NextResponse.json({ error: "consent_duration_days is required for update" }, { status: 400 });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + consent_duration_days);

      let found = false;
      caseRecord.evidence_submissions?.forEach((sub) => {
        sub.consent_grants?.forEach((g) => {
          if (g.alb_id === alb_id && !g.revoked_at) {
            g.expires_at = expiresAt.toISOString();
            found = true;
          }
        });
      });

      if (!found) {
        return NextResponse.json({ error: "No active consent found for this ALB" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    caseRecord.last_updated = now;
    cases[caseIndex] = caseRecord;
    writeCases(cases);

    // Return updated evidence submissions
    return NextResponse.json({
      message: "Consent updated successfully",
      evidenceSubmissions: caseRecord.evidence_submissions?.map((s) => ({
        submitted_at: s.submitted_at,
        description: s.description,
        files: s.files,
        consent_grants: s.consent_grants,
      })),
    });

  } catch (error) {
    console.error("Consent update error:", error);
    return NextResponse.json({ error: "Failed to update consent" }, { status: 500 });
  }
}
