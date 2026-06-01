"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import type {
  Case,
  PolicyExtract,
  WorkflowTransition,
  WorkflowStateName,
  AISummaryResponse,
  EvidenceSubmission,
  ConsentGrant,
} from "@/types";

interface CaseDetailResponse {
  caseRecord: Case;
  policyExtracts: PolicyExtract[];
  relevantClauses: PolicyExtract[];
  permittedTransitions: WorkflowTransition[];
  requiredAction: string;
  evidenceDaysOutstanding: number | null;
  evidenceFlag: "none" | "reminder" | "escalation";
}

const STATUS_DISPLAY: Record<WorkflowStateName, string> = {
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

const CASE_TYPE_DISPLAY: Record<string, string> = {
  dsa_application: "DSA Application",
  allowance_review: "Allowance Review",
  compliance_check: "Compliance Check",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [data, setData] = useState<CaseDetailResponse | null>(null);
  const [aiSummary, setAiSummary] = useState<AISummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(true);
  const [error, setError] = useState("");

  // Transition form state
  const [selectedTransition, setSelectedTransition] = useState<WorkflowTransition | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [transitionDecisionReason, setTransitionDecisionReason] = useState("");
  const [transitionErrors, setTransitionErrors] = useState<{ note?: string; decisionReason?: string }>({});
  const [transitionApiError, setTransitionApiError] = useState("");
  const [transitionSubmitting, setTransitionSubmitting] = useState(false);

  async function fetchCaseDetail() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/cases/${caseId}`);
      if (res.status === 401) {
        router.push("/dashboard/login");
        return;
      }
      if (res.status === 404) {
        setError("Case not found.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch case");
      const json: CaseDetailResponse = await res.json();
      setData(json);
    } catch {
      setError("Sorry, there is a problem with the service. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAiSummary() {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/dashboard/cases/${caseId}/ai-summary`);
      if (res.ok) {
        const json: AISummaryResponse = await res.json();
        setAiSummary(json);
      }
    } catch {
      // AI summary is non-critical; silently fail
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    fetchCaseDetail();
    fetchAiSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  function handleSelectTransition(transition: WorkflowTransition) {
    setSelectedTransition(transition);
    setTransitionNote("");
    setTransitionDecisionReason("");
    setTransitionErrors({});
    setTransitionApiError("");
  }

  function handleCancelTransition() {
    setSelectedTransition(null);
    setTransitionNote("");
    setTransitionDecisionReason("");
    setTransitionErrors({});
    setTransitionApiError("");
  }

  async function handleConfirmTransition() {
    if (!selectedTransition) return;

    const errors: { note?: string; decisionReason?: string } = {};

    if (!transitionNote.trim()) {
      errors.note = "Enter a note before updating the case status";
    }

    const needsDecisionReason =
      selectedTransition.to_state === "approved" ||
      selectedTransition.to_state === "rejected";

    if (needsDecisionReason && !transitionDecisionReason.trim()) {
      errors.decisionReason =
        "Enter a decision reason before approving or rejecting this case";
    }

    if (Object.keys(errors).length > 0) {
      setTransitionErrors(errors);
      return;
    }

    setTransitionErrors({});
    setTransitionApiError("");
    setTransitionSubmitting(true);

    try {
      const res = await fetch(`/api/dashboard/cases/${caseId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toState: selectedTransition.to_state,
          note: transitionNote.trim(),
          ...(needsDecisionReason
            ? { decisionReason: transitionDecisionReason.trim() }
            : {}),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setTransitionApiError(
          json.error ||
            "This transition is not permitted from the current case state."
        );
        return;
      }

      // Success — reset form and refresh case data
      setSelectedTransition(null);
      setTransitionNote("");
      setTransitionDecisionReason("");
      await fetchCaseDetail();
      await fetchAiSummary();
    } catch {
      setTransitionApiError(
        "Sorry, there is a problem with the service. Try again later."
      );
    } finally {
      setTransitionSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="govuk-width-container">
        <main className="govuk-main-wrapper" id="main-content" role="main">
          <p className="govuk-body">Loading case…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="govuk-width-container">
        <main className="govuk-main-wrapper" id="main-content" role="main">
          <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" tabIndex={-1}>
            <h2 className="govuk-error-summary__title" id="error-summary-title">There is a problem</h2>
            <div className="govuk-error-summary__body"><p>{error}</p></div>
          </div>
          <a href="/dashboard" className="govuk-back-link">Back to cases</a>
        </main>
      </div>
    );
  }

  if (!data) return null;

  const { caseRecord, policyExtracts, relevantClauses, permittedTransitions, requiredAction, evidenceDaysOutstanding, evidenceFlag } = data;
  const sortedTimeline = [...caseRecord.timeline].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="govuk-width-container">
      <main className="govuk-main-wrapper" id="main-content" role="main">
        <a href="/dashboard" className="govuk-back-link">Back to cases</a>

        <h1 className="govuk-heading-l">Case: {caseRecord.case_id}</h1>

        <div className="govuk-grid-row">
          {/* Main content — left column */}
          <div className="govuk-grid-column-two-thirds">
            {/* Current status and required action */}
            <section aria-labelledby="status-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="status-heading">Current status</h2>
              <p className="govuk-body">
                <strong className="govuk-tag">{STATUS_DISPLAY[caseRecord.status] ?? caseRecord.status}</strong>
              </p>
              <p className="govuk-body">
                <strong className="govuk-!-font-weight-bold">Required action:</strong> {requiredAction}
              </p>
              {evidenceFlag !== "none" && evidenceDaysOutstanding !== null && (
                <div
                  className="govuk-inset-text"
                  style={evidenceDaysOutstanding > 30 ? { borderLeftColor: "#d4351c", backgroundColor: "#fde8e6" } : undefined}
                >
                  {evidenceFlag === "escalation" ? (
                    <p className="govuk-body" style={{ color: "#d4351c" }}>
                      <strong>Escalation required:</strong> Evidence has been outstanding for {evidenceDaysOutstanding} days (exceeds 56-day threshold).
                    </p>
                  ) : (
                    <p className="govuk-body" style={{ color: "#f47738" }}>
                      <strong>Reminder due:</strong> Evidence has been outstanding for {evidenceDaysOutstanding} days (exceeds 28-day threshold).
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Applicant details */}
            <section aria-labelledby="applicant-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="applicant-heading">Applicant details</h2>
              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Name</dt>
                  <dd className="govuk-summary-list__value">{caseRecord.applicant.name}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Date of birth</dt>
                  <dd className="govuk-summary-list__value">{caseRecord.applicant.date_of_birth}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Sex</dt>
                  <dd className="govuk-summary-list__value">{caseRecord.applicant.sex}</dd>
                </div>
                {caseRecord.applicant.reference && (
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Customer reference</dt>
                    <dd className="govuk-summary-list__value">{caseRecord.applicant.reference}</dd>
                  </div>
                )}
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Address</dt>
                  <dd className="govuk-summary-list__value">
                    {caseRecord.applicant.address.line1}
                    {caseRecord.applicant.address.line2 && <><br />{caseRecord.applicant.address.line2}</>}
                    {caseRecord.applicant.address.line3 && <><br />{caseRecord.applicant.address.line3}</>}
                    <br />{caseRecord.applicant.address.postcode}
                  </dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">University</dt>
                  <dd className="govuk-summary-list__value">{caseRecord.applicant.university}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Course</dt>
                  <dd className="govuk-summary-list__value">{caseRecord.applicant.course}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Contact preference</dt>
                  <dd className="govuk-summary-list__value">
                    {caseRecord.applicant.notification_channel === "email"
                      ? `Email: ${caseRecord.applicant.email}`
                      : `SMS: ${caseRecord.applicant.phone}`}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Application data (cost items) */}
            {caseRecord.application_data && (
              <section aria-labelledby="application-heading" style={{ marginBottom: "30px" }}>
                <h2 className="govuk-heading-m" id="application-heading">Application data</h2>
                <p className="govuk-body">
                  <strong className="govuk-!-font-weight-bold">Case type:</strong>{" "}
                  {CASE_TYPE_DISPLAY[caseRecord.case_type] ?? caseRecord.case_type}
                </p>
                <p className="govuk-body">
                  <strong className="govuk-!-font-weight-bold">Submitted:</strong>{" "}
                  {formatDateTime(caseRecord.application_data.submitted_at)}
                </p>
                <p className="govuk-body">
                  <strong className="govuk-!-font-weight-bold">Total amount:</strong>{" "}
                  £{caseRecord.application_data.total_amount.toFixed(2)}
                </p>
                {caseRecord.application_data.cost_items.length > 0 && (
                  <table className="govuk-table">
                    <caption className="govuk-table__caption govuk-table__caption--s">Cost items</caption>
                    <thead className="govuk-table__head">
                      <tr className="govuk-table__row">
                        <th scope="col" className="govuk-table__header">Description</th>
                        <th scope="col" className="govuk-table__header">Supplier</th>
                        <th scope="col" className="govuk-table__header govuk-table__header--numeric">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="govuk-table__body">
                      {caseRecord.application_data.cost_items.map((item) => (
                        <tr key={item.id} className="govuk-table__row">
                          <td className="govuk-table__cell">{item.description}</td>
                          <td className="govuk-table__cell">{item.supplier}</td>
                          <td className="govuk-table__cell govuk-table__cell--numeric">£{item.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            {/* Case notes */}
            <section aria-labelledby="notes-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="notes-heading">Case notes</h2>
              {caseRecord.case_notes ? (
                <p className="govuk-body">{caseRecord.case_notes}</p>
              ) : (
                <p className="govuk-body govuk-hint">No case notes recorded.</p>
              )}
            </section>

            {/* Timeline */}
            <section aria-labelledby="timeline-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="timeline-heading">Case timeline</h2>
              {sortedTimeline.length === 0 ? (
                <p className="govuk-body govuk-hint">No timeline entries.</p>
              ) : (
                <table className="govuk-table">
                  <thead className="govuk-table__head">
                    <tr className="govuk-table__row">
                      <th scope="col" className="govuk-table__header">Date</th>
                      <th scope="col" className="govuk-table__header">Event</th>
                      <th scope="col" className="govuk-table__header">Note</th>
                      <th scope="col" className="govuk-table__header">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="govuk-table__body">
                    {sortedTimeline.map((entry, idx) => (
                      <tr key={idx} className="govuk-table__row">
                        <td className="govuk-table__cell">{formatDateTime(entry.date)}</td>
                        <td className="govuk-table__cell">{entry.event.replace(/_/g, " ")}</td>
                        <td className="govuk-table__cell">{entry.note}</td>
                        <td className="govuk-table__cell">{entry.actor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* AI Summary */}
            <section aria-labelledby="ai-summary-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="ai-summary-heading">AI case summary</h2>
              <div className="govuk-inset-text">
                <p className="govuk-body">
                  <strong className="govuk-tag govuk-tag--purple">AI-generated</strong>{" "}
                  This summary was produced by an automated process. Always verify against the case record.
                </p>
              </div>
              {aiLoading && <p className="govuk-body">Loading AI summary…</p>}
              {!aiLoading && !aiSummary && (
                <p className="govuk-body govuk-hint">AI summary unavailable.</p>
              )}
              {!aiLoading && aiSummary && (
                <>
                  <p className="govuk-body">{aiSummary.summary}</p>
                  {aiSummary.outstandingEvidence.length > 0 && (
                    <>
                      <h3 className="govuk-heading-s">Outstanding evidence</h3>
                      <ul className="govuk-list govuk-list--bullet">
                        {aiSummary.outstandingEvidence.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="govuk-body">
                    <strong className="govuk-!-font-weight-bold">Recommended action:</strong>{" "}
                    {aiSummary.recommendedAction}
                  </p>
                  <p className="govuk-body govuk-hint" style={{ fontSize: "14px" }}>
                    Generated at: {formatDateTime(aiSummary.generatedAt)}
                  </p>
                </>
              )}
            </section>

            {/* Workflow transitions */}
            {permittedTransitions.length > 0 && (
              <section aria-labelledby="transitions-heading" style={{ marginBottom: "30px" }}>
                <h2 className="govuk-heading-m" id="transitions-heading">Available actions</h2>

                {/* API error notification */}
                {transitionApiError && (
                  <div className="govuk-error-summary" aria-labelledby="transition-error-title" role="alert" tabIndex={-1}>
                    <h3 className="govuk-error-summary__title" id="transition-error-title">There is a problem</h3>
                    <div className="govuk-error-summary__body"><p>{transitionApiError}</p></div>
                  </div>
                )}

                {/* Transition buttons — show when no transition is selected */}
                {!selectedTransition && (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {permittedTransitions.map((t) => (
                      <button
                        key={t.to_state}
                        type="button"
                        className="govuk-button govuk-button--secondary"
                        data-to-state={t.to_state}
                        onClick={() => handleSelectTransition(t)}
                      >
                        {t.display_label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Transition form — show when a transition is selected */}
                {selectedTransition && (
                  <div style={{ border: "2px solid #1d70b8", padding: "20px", marginTop: "10px" }}>
                    <h3 className="govuk-heading-s">
                      {selectedTransition.display_label}
                    </h3>

                    {/* Note textarea */}
                    <div className={`govuk-form-group${transitionErrors.note ? " govuk-form-group--error" : ""}`}>
                      <label className="govuk-label" htmlFor="transition-note">
                        Note
                      </label>
                      {transitionErrors.note && (
                        <p id="transition-note-error" className="govuk-error-message">
                          <span className="govuk-visually-hidden">Error:</span> {transitionErrors.note}
                        </p>
                      )}
                      <textarea
                        className={`govuk-textarea${transitionErrors.note ? " govuk-textarea--error" : ""}`}
                        id="transition-note"
                        name="transition-note"
                        rows={3}
                        aria-describedby={transitionErrors.note ? "transition-note-error" : undefined}
                        value={transitionNote}
                        onChange={(e) => setTransitionNote(e.target.value)}
                      />
                    </div>

                    {/* Decision reason textarea — only for approved/rejected */}
                    {(selectedTransition.to_state === "approved" ||
                      selectedTransition.to_state === "rejected") && (
                      <div className={`govuk-form-group${transitionErrors.decisionReason ? " govuk-form-group--error" : ""}`}>
                        <label className="govuk-label" htmlFor="transition-decision-reason">
                          Decision reason
                        </label>
                        {transitionErrors.decisionReason && (
                          <p id="transition-decision-reason-error" className="govuk-error-message">
                            <span className="govuk-visually-hidden">Error:</span> {transitionErrors.decisionReason}
                          </p>
                        )}
                        <textarea
                          className={`govuk-textarea${transitionErrors.decisionReason ? " govuk-textarea--error" : ""}`}
                          id="transition-decision-reason"
                          name="transition-decision-reason"
                          rows={3}
                          aria-describedby={transitionErrors.decisionReason ? "transition-decision-reason-error" : undefined}
                          value={transitionDecisionReason}
                          onChange={(e) => setTransitionDecisionReason(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Confirm / Cancel buttons */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        className="govuk-button"
                        disabled={transitionSubmitting}
                        onClick={handleConfirmTransition}
                      >
                        {transitionSubmitting ? "Updating…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        className="govuk-button govuk-button--secondary"
                        disabled={transitionSubmitting}
                        onClick={handleCancelTransition}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Sidebar — evidence submissions + policy extracts */}
          <div className="govuk-grid-column-one-third">

            {/* Evidence submissions */}
            <section aria-labelledby="evidence-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="evidence-heading">Submitted evidence</h2>
              {!caseRecord.evidence_submissions || caseRecord.evidence_submissions.length === 0 ? (
                <p className="govuk-body govuk-hint">No evidence submitted yet.</p>
              ) : (
                [...caseRecord.evidence_submissions]
                  .map((submission: EvidenceSubmission, originalIdx: number) => ({ submission, originalIdx }))
                  .reverse()
                  .map(({ submission, originalIdx }, displayIdx: number) => (
                  <details key={originalIdx} className="govuk-details" style={{ marginBottom: "12px" }}>
                    <summary className="govuk-details__summary">
                      <span className="govuk-details__summary-text">
                        Submission {caseRecord.evidence_submissions!.length - displayIdx} — {formatDateTime(submission.submitted_at)}
                      </span>
                    </summary>
                    <div className="govuk-details__text">
                      <p className="govuk-body">
                        <strong className="govuk-!-font-weight-bold">Description:</strong>{" "}
                        {submission.description}
                      </p>

                      {/* File list with preview links */}
                      <h3 className="govuk-heading-s" style={{ marginBottom: "8px" }}>Files</h3>
                      <ul className="govuk-list">
                        {submission.files.map((file, fileIdx: number) => (
                          <li key={fileIdx} style={{ marginBottom: "6px" }}>
                            <span className="govuk-body">
                              📎{" "}
                              <a
                                href={`/api/dashboard/cases/${caseRecord.case_id}/evidence/${originalIdx}/${fileIdx}`}
                                className="govuk-link"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {file.name}
                              </a>{" "}
                              <span className="govuk-hint" style={{ display: "inline" }}>
                                ({formatFileSize(file.size)})
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Extracted fields */}
                      {submission.extracted_fields && submission.extracted_fields.length > 0 && (
                        <>
                          <h3 className="govuk-heading-s" style={{ marginBottom: "8px", marginTop: "12px" }}>
                            Extracted information
                            <strong className="govuk-tag govuk-tag--purple" style={{ fontSize: "12px", marginLeft: "8px" }}>AI-extracted</strong>
                          </h3>
                          <dl className="govuk-summary-list govuk-summary-list--no-border">
                            {submission.extracted_fields.map((field) => (
                              <div key={field.key} className="govuk-summary-list__row">
                                <dt className="govuk-summary-list__key" style={{ fontSize: "14px", width: "45%" }}>
                                  {field.label}
                                </dt>
                                <dd className="govuk-summary-list__value" style={{ fontSize: "14px" }}>
                                  {field.value}
                                  {field.confidence === "low" && (
                                    <strong className="govuk-tag govuk-tag--yellow" style={{ fontSize: "11px", marginLeft: "6px" }}>
                                      Unverified
                                    </strong>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      )}

                      {/* Consent grants */}
                      {submission.consent_grants && submission.consent_grants.length > 0 && (
                        <>
                          <h3 className="govuk-heading-s" style={{ marginBottom: "8px", marginTop: "12px" }}>
                            Evidence sharing consents
                          </h3>
                          {submission.consent_grants.map((grant) => {
                            const expired = new Date(grant.expires_at) < new Date();
                            const revoked = !!grant.revoked_at;
                            return (
                              <div key={grant.alb_id} style={{ marginBottom: "8px", padding: "8px", background: "#f3f2f1", borderRadius: "4px" }}>
                                <p className="govuk-body-s" style={{ marginBottom: "2px", fontWeight: "bold" }}>
                                  {grant.alb_name}
                                  {" "}
                                  {revoked ? (
                                    <strong className="govuk-tag govuk-tag--red" style={{ fontSize: "11px" }}>Revoked</strong>
                                  ) : expired ? (
                                    <strong className="govuk-tag govuk-tag--grey" style={{ fontSize: "11px" }}>Expired</strong>
                                  ) : (
                                    <strong className="govuk-tag govuk-tag--green" style={{ fontSize: "11px" }}>Active</strong>
                                  )}
                                </p>
                                <p className="govuk-hint" style={{ fontSize: "12px", marginBottom: 0 }}>
                                  Granted: {formatDate(grant.granted_at)} · Expires: {formatDate(grant.expires_at)}
                                </p>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </details>
                ))
              )}
            </section>

            {/* Policy extracts */}
            <section aria-labelledby="policy-heading" style={{ marginBottom: "30px" }}>
              <h2 className="govuk-heading-m" id="policy-heading">Policy extracts</h2>

              {relevantClauses.length > 0 && (
                <>
                  <h3 className="govuk-heading-s">Relevant to current state</h3>
                  {relevantClauses.map((p) => (
                    <div key={p.policy_id} className="govuk-inset-text" style={{ borderLeftColor: "#1d70b8" }}>
                      <p className="govuk-body govuk-!-font-weight-bold">{p.policy_id}: {p.title}</p>
                      <p className="govuk-body">{p.body}</p>
                    </div>
                  ))}
                </>
              )}

              <h3 className="govuk-heading-s">All applicable policies</h3>
              {policyExtracts.length === 0 ? (
                <p className="govuk-body govuk-hint">No policies found for this case type.</p>
              ) : (
                policyExtracts.map((p) => (
                  <details key={p.policy_id} className="govuk-details" style={{ marginBottom: "10px" }}>
                    <summary className="govuk-details__summary">
                      <span className="govuk-details__summary-text">{p.policy_id}: {p.title}</span>
                    </summary>
                    <div className="govuk-details__text">
                      <p className="govuk-body">{p.body}</p>
                    </div>
                  </details>
                ))
              )}
            </section>

            {/* Outbound letters */}
            <section aria-labelledby="outbound-heading">
              <h2 className="govuk-heading-m" id="outbound-heading">Outbound correspondence</h2>
              {!caseRecord.outbound_letters || caseRecord.outbound_letters.length === 0 ? (
                <p className="govuk-body govuk-hint">No letters sent yet.</p>
              ) : (
                [...caseRecord.outbound_letters]
                  .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
                  .map((letter) => (
                  <details key={letter.letter_id} className="govuk-details" style={{ marginBottom: "10px" }}>
                    <summary className="govuk-details__summary">
                      <span className="govuk-details__summary-text">
                        {formatDate(letter.generated_at)} —{" "}
                        {letter.read_at ? (
                          <strong className="govuk-tag govuk-tag--green" style={{ fontSize: "11px" }}>Read</strong>
                        ) : (
                          <strong className="govuk-tag govuk-tag--blue" style={{ fontSize: "11px" }}>Sent</strong>
                        )}
                      </span>
                    </summary>
                    <div className="govuk-details__text">
                      <p className="govuk-body govuk-!-font-weight-bold" style={{ marginBottom: "4px" }}>
                        {letter.subject}
                      </p>
                      <p className="govuk-hint" style={{ fontSize: "12px", marginBottom: "8px" }}>
                        Sent via {letter.sent_via} to {letter.sent_to || "—"} · {letter.triggered_by === "automatic" ? "Automated" : "Manual"}
                        {letter.read_at && ` · Read ${formatDateTime(letter.read_at)}`}
                      </p>
                      <a
                        href={`/dashboard/cases/${caseRecord.case_id}/letters/${letter.letter_id}`}
                        className="govuk-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View letter
                      </a>
                    </div>
                  </details>
                ))
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
