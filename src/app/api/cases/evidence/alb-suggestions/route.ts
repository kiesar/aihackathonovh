import { NextRequest, NextResponse } from "next/server";
import { getRelevantALBs, detectEvidenceTypes } from "@/lib/uk-albs";

/**
 * POST /api/cases/evidence/alb-suggestions
 *
 * Returns a list of UK government ALBs that commonly require
 * similar evidence to what the student has uploaded.
 *
 * Body: { description: string, extractedDocType: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description = "", extractedDocType = "" } = body;

    const evidenceTypes = detectEvidenceTypes(description, extractedDocType);
    const suggestions = getRelevantALBs(evidenceTypes, 6);

    return NextResponse.json({
      evidenceTypes,
      suggestions,
      isAiGenerated: true,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("ALB suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate ALB suggestions" },
      { status: 500 }
    );
  }
}
