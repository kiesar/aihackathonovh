"use client";

import { useState, FormEvent } from "react";
import { UK_ALBS } from "@/lib/uk-albs";
import type { ConsentGrant } from "@/types";

// ── Types ────────────────────────────────────────────────────

interface LetterSummary {
  letter_id: string;
  subject: string;
  generated_at: string;
  type: string;
  read_at?: string;
}

interface EvidenceFile {
  name: string;
  size: number;
  type: string;
}

interface EvidenceSubmissionSummary {
  submitted_at: string;
  description: string;
  files: EvidenceFile[];
  consent_grants?: ConsentGrant[];
}

interface StatusResult {
  status: string;
  displayStatus: string;
  lastUpdated: string;
  decisionReason?: string;
  outboundLetters?: LetterSummary[];
  evidenceSubmissions?: EvidenceSubmissionSummary[];
}

const CONSENT_DURATION_OPTIONS = [
  { value: 30,  label: "30 days" },
  { value: 90,  label: "3 months" },
  { value: 180, label: "6 months" },
  { value: 365, label: "1 year" },
];

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isGrantActive(grant: ConsentGrant): boolean {
  return !grant.revoked_at && new Date(grant.expires_at) > new Date();
}

// ── Main component ───────────────────────────────────────────

export default function StatusCheckPage() {
  const [caseReference, setCaseReference] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Consent management state
  const [consentAction, setConsentAction] = useState<{ albId: string; mode: "add" | "revoke" | "update" } | null>(null);
  const [consentDuration, setConsentDuration] = useState(90);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [consentSuccess, setConsentSuccess] = useState("");
  const [showAddAlb, setShowAddAlb] = useState(false);
  const [newAlbId, setNewAlbId] = useState("");
  const [newAlbDuration, setNewAlbDuration] = useState(90);

  async function handleCheckStatus(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setConsentAction(null);
    setConsentSuccess("");

    const trimmed = caseReference.trim();
    if (!trimmed) {
      setError("Enter your case reference number");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(trimmed)}`);
      if (res.status === 404) {
        const body = await res.json();
        setError(body.error || "No application found for that reference number.");
        return;
      }
      if (!res.ok) {
        setError("Sorry, there is a problem with the service. Try again later.");
        return;
      }
      const data: StatusResult = await res.json();
      setResult(data);
    } catch {
      setError("Sorry, there is a problem with the service. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConsentUpdate(action: "add" | "revoke" | "update", albId: string, durationDays?: number) {
    setConsentSaving(true);
    setConsentError("");
    setConsentSuccess("");

    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseReference.trim())}/consent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, alb_id: albId, consent_duration_days: durationDays }),
      });

      const data = await res.json();
      if (!res.ok) {
        setConsentError(data.error || "Failed to update consent.");
        return;
      }

      // Update local state with new evidence submissions
      setResult((prev) => prev ? { ...prev, evidenceSubmissions: data.evidenceSubmissions } : prev);
      setConsentSuccess(
        action === "add" ? "Consent granted successfully." :
        action === "revoke" ? "Consent revoked successfully." :
        "Consent duration updated."
      );
      setConsentAction(null);
      setShowAddAlb(false);
      setNewAlbId("");
    } catch {
      setConsentError("Sorry, there is a problem updating consent.");
    } finally {
      setConsentSaving(false);
    }
  }

  const isTerminal = result?.status === "approved" || result?.status === "rejected";
  const canUploadEvidence = result?.status === "awaiting_evidence" || result?.status === "evidence_requested";

  // Collect all active consents across all submissions for the "manage" view
  const allActiveConsents: Array<ConsentGrant & { submittedAt: string }> = [];
  result?.evidenceSubmissions?.forEach((sub) => {
    sub.consent_grants?.forEach((g) => {
      if (!allActiveConsents.find((c) => c.alb_id === g.alb_id) || isGrantActive(g)) {
        allActiveConsents.push({ ...g, submittedAt: sub.submitted_at });
      }
    });
  });

  // ALBs not yet consented to
  const consentedAlbIds = new Set(allActiveConsents.filter(isGrantActive).map((g) => g.alb_id));
  const availableAlbs = UK_ALBS.filter((a) => !consentedAlbIds.has(a.alb_id));

  return (
    <div className="govuk-width-container">
      <main className="govuk-main-wrapper" id="main-content" role="main">
        <h1 className="govuk-heading-l">Check the status of your application</h1>

        {/* ── Search form ── */}
        <form onSubmit={handleCheckStatus} noValidate>
          {error && (
            <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" tabIndex={-1}>
              <h2 className="govuk-error-summary__title" id="error-summary-title">There is a problem</h2>
              <div className="govuk-error-summary__body">
                <ul className="govuk-list govuk-error-summary__list">
                  <li><a href="#case-reference">{error}</a></li>
                </ul>
              </div>
            </div>
          )}

          <div className={`govuk-form-group${error ? " govuk-form-group--error" : ""}`}>
            <label className="govuk-label" htmlFor="case-reference">Case reference number</label>
            <div className="govuk-hint" id="case-reference-hint">
              For example DSA-2026-00001
            </div>
            {error && (
              <p className="govuk-error-message" id="case-reference-error">
                <span className="govuk-visually-hidden">Error:</span> {error}
              </p>
            )}
            <input
              className={`govuk-input govuk-input--width-20${error ? " govuk-input--error" : ""}`}
              id="case-reference"
              name="caseReference"
              type="text"
              value={caseReference}
              onChange={(e) => setCaseReference(e.target.value)}
              aria-describedby={`case-reference-hint${error ? " case-reference-error" : ""}`}
            />
          </div>
          <button type="submit" className="govuk-button" disabled={loading}>
            {loading ? "Checking…" : "Check status"}
          </button>
        </form>

        {/* ── Status panel ── */}
        {result && (
          <div
            className="govuk-panel govuk-panel--confirmation"
            style={{ backgroundColor: isTerminal ? (result.status === "approved" ? "#00703c" : "#d4351c") : "#1d70b8" }}
          >
            <h2 className="govuk-panel__title">{result.displayStatus}</h2>
            <div className="govuk-panel__body">Last updated: {formatDate(result.lastUpdated)}</div>
          </div>
        )}

        {/* ── Decision details ── */}
        {result && isTerminal && (
          <div style={{ marginTop: "24px" }}>
            <h2 className="govuk-heading-m">Decision details</h2>
            <dl className="govuk-summary-list">
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Outcome</dt>
                <dd className="govuk-summary-list__value">{result.displayStatus}</dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Decision date</dt>
                <dd className="govuk-summary-list__value">{formatDate(result.lastUpdated)}</dd>
              </div>
              {result.decisionReason && (
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Decision reason</dt>
                  <dd className="govuk-summary-list__value">{result.decisionReason}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* ── Upload evidence ── */}
        {result && canUploadEvidence && (
          <div style={{ marginTop: "24px" }}>
            <h2 className="govuk-heading-m">Upload evidence</h2>
            <p className="govuk-body">Your application requires supporting evidence.</p>
            <a href={`/apply/evidence?ref=${encodeURIComponent(caseReference.trim())}`} className="govuk-button">
              Upload evidence
            </a>
          </div>
        )}

        {/* ── Evidence submissions ── */}
        {result && result.evidenceSubmissions && result.evidenceSubmissions.length > 0 && (
          <div style={{ marginTop: "30px" }}>
            <h2 className="govuk-heading-m">Documents you have submitted</h2>
            <p className="govuk-body govuk-hint">
              Showing {result.evidenceSubmissions.length} submission{result.evidenceSubmissions.length !== 1 ? "s" : ""}, most recent first.
            </p>

            {result.evidenceSubmissions.map((sub, idx) => (
              <details key={idx} className="govuk-details" style={{ marginBottom: "12px" }}>
                <summary className="govuk-details__summary">
                  <span className="govuk-details__summary-text">
                    <strong>{formatDate(sub.submitted_at)}</strong> — {sub.description}
                    {" "}
                    <span className="govuk-hint" style={{ display: "inline", fontSize: "14px" }}>
                      ({sub.files.length} file{sub.files.length !== 1 ? "s" : ""})
                    </span>
                  </span>
                </summary>
                <div className="govuk-details__text">
                  {/* Files */}
                  <h3 className="govuk-heading-s" style={{ marginBottom: "8px" }}>Files</h3>
                  <ul className="govuk-list govuk-list--bullet">
                    {sub.files.map((f, fi) => (
                      <li key={fi}>
                        {f.name}{" "}
                        <span className="govuk-hint" style={{ display: "inline", fontSize: "13px" }}>
                          ({formatFileSize(f.size)})
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Consents for this submission */}
                  {sub.consent_grants && sub.consent_grants.length > 0 && (
                    <>
                      <h3 className="govuk-heading-s" style={{ marginBottom: "8px", marginTop: "12px" }}>
                        Evidence sharing consents for this submission
                      </h3>
                      <table className="govuk-table">
                        <thead className="govuk-table__head">
                          <tr className="govuk-table__row">
                            <th scope="col" className="govuk-table__header">Organisation</th>
                            <th scope="col" className="govuk-table__header">Granted</th>
                            <th scope="col" className="govuk-table__header">Expires</th>
                            <th scope="col" className="govuk-table__header">Status</th>
                          </tr>
                        </thead>
                        <tbody className="govuk-table__body">
                          {sub.consent_grants.map((grant) => {
                            const active = isGrantActive(grant);
                            const expired = !grant.revoked_at && new Date(grant.expires_at) <= new Date();
                            return (
                              <tr key={grant.alb_id} className="govuk-table__row">
                                <td className="govuk-table__cell">{grant.alb_name}</td>
                                <td className="govuk-table__cell">{formatDate(grant.granted_at)}</td>
                                <td className="govuk-table__cell">{formatDate(grant.expires_at)}</td>
                                <td className="govuk-table__cell">
                                  {grant.revoked_at ? (
                                    <strong className="govuk-tag govuk-tag--red">Revoked</strong>
                                  ) : expired ? (
                                    <strong className="govuk-tag govuk-tag--grey">Expired</strong>
                                  ) : (
                                    <strong className="govuk-tag govuk-tag--green">Active</strong>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* ── Consent management ── */}
        {result && (
          <div style={{ marginTop: "30px" }}>
            <h2 className="govuk-heading-m">Manage evidence sharing consents</h2>
            <p className="govuk-body">
              You can control which government services can access your evidence, change how long
              they have access, or add new services.
            </p>

            {consentSuccess && (
              <div className="govuk-notification-banner govuk-notification-banner--success" role="alert" aria-labelledby="consent-success-title">
                <div className="govuk-notification-banner__header">
                  <h2 className="govuk-notification-banner__title" id="consent-success-title">Success</h2>
                </div>
                <div className="govuk-notification-banner__content">
                  <p className="govuk-body">{consentSuccess}</p>
                </div>
              </div>
            )}

            {consentError && (
              <div className="govuk-error-summary" role="alert" aria-labelledby="consent-error-title" tabIndex={-1}>
                <h2 className="govuk-error-summary__title" id="consent-error-title">There is a problem</h2>
                <div className="govuk-error-summary__body"><p>{consentError}</p></div>
              </div>
            )}

            {/* Active consents */}
            {allActiveConsents.length === 0 ? (
              <p className="govuk-body govuk-hint">You have not granted access to any services.</p>
            ) : (
              <table className="govuk-table">
                <thead className="govuk-table__head">
                  <tr className="govuk-table__row">
                    <th scope="col" className="govuk-table__header">Organisation</th>
                    <th scope="col" className="govuk-table__header">Status</th>
                    <th scope="col" className="govuk-table__header">Expires</th>
                    <th scope="col" className="govuk-table__header">Actions</th>
                  </tr>
                </thead>
                <tbody className="govuk-table__body">
                  {allActiveConsents.map((grant) => {
                    const active = isGrantActive(grant);
                    const expired = !grant.revoked_at && new Date(grant.expires_at) <= new Date();
                    const isEditing = consentAction?.albId === grant.alb_id;

                    return (
                      <tr key={grant.alb_id} className="govuk-table__row">
                        <td className="govuk-table__cell">
                          <strong>{grant.alb_name}</strong>
                          <div className="govuk-hint" style={{ fontSize: "12px" }}>
                            {UK_ALBS.find((a) => a.alb_id === grant.alb_id)?.description ?? ""}
                          </div>
                        </td>
                        <td className="govuk-table__cell">
                          {grant.revoked_at ? (
                            <strong className="govuk-tag govuk-tag--red">Revoked</strong>
                          ) : expired ? (
                            <strong className="govuk-tag govuk-tag--grey">Expired</strong>
                          ) : (
                            <strong className="govuk-tag govuk-tag--green">Active</strong>
                          )}
                        </td>
                        <td className="govuk-table__cell">{formatDate(grant.expires_at)}</td>
                        <td className="govuk-table__cell">
                          {active && !isEditing && (
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="govuk-button govuk-button--secondary"
                                style={{ marginBottom: 0, fontSize: "14px" }}
                                onClick={() => { setConsentAction({ albId: grant.alb_id, mode: "update" }); setConsentDuration(90); }}
                              >
                                Change duration
                              </button>
                              <button
                                type="button"
                                className="govuk-button govuk-button--warning"
                                style={{ marginBottom: 0, fontSize: "14px" }}
                                onClick={() => handleConsentUpdate("revoke", grant.alb_id)}
                                disabled={consentSaving}
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                          {isEditing && consentAction?.mode === "update" && (
                            <div>
                              <select
                                className="govuk-select"
                                aria-label={`New access duration for ${grant.alb_name}`}
                                value={consentDuration}
                                onChange={(e) => setConsentDuration(parseInt(e.target.value, 10))}
                                style={{ marginBottom: "8px" }}
                              >
                                {CONSENT_DURATION_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  className="govuk-button"
                                  style={{ marginBottom: 0, fontSize: "14px" }}
                                  disabled={consentSaving}
                                  onClick={() => handleConsentUpdate("update", grant.alb_id, consentDuration)}
                                >
                                  {consentSaving ? "Saving…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="govuk-button govuk-button--secondary"
                                  style={{ marginBottom: 0, fontSize: "14px" }}
                                  onClick={() => setConsentAction(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Add new ALB consent */}
            {result.evidenceSubmissions && result.evidenceSubmissions.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                {!showAddAlb ? (
                  <button
                    type="button"
                    className="govuk-button govuk-button--secondary"
                    onClick={() => { setShowAddAlb(true); setNewAlbId(""); setNewAlbDuration(90); }}
                  >
                    Add another service
                  </button>
                ) : (
                  <div style={{ border: "2px solid #1d70b8", padding: "20px", borderRadius: "4px" }}>
                    <h3 className="govuk-heading-s">Grant access to a new service</h3>
                    <p className="govuk-body govuk-hint">
                      Select a UK government service to share your evidence with.
                    </p>

                    <div className="govuk-form-group">
                      <label className="govuk-label" htmlFor="new-alb-select">
                        Select organisation
                      </label>
                      <select
                        className="govuk-select"
                        id="new-alb-select"
                        value={newAlbId}
                        onChange={(e) => setNewAlbId(e.target.value)}
                      >
                        <option value="">— Select a service —</option>
                        {availableAlbs.map((alb) => (
                          <option key={alb.alb_id} value={alb.alb_id}>
                            {alb.name} ({alb.abbreviation})
                          </option>
                        ))}
                      </select>
                    </div>

                    {newAlbId && (
                      <div className="govuk-inset-text" style={{ marginBottom: "16px" }}>
                        <p className="govuk-body govuk-hint" style={{ marginBottom: 0 }}>
                          {UK_ALBS.find((a) => a.alb_id === newAlbId)?.description}
                        </p>
                      </div>
                    )}

                    <div className="govuk-form-group">
                      <label className="govuk-label" htmlFor="new-alb-duration">
                        Allow access for
                      </label>
                      <select
                        className="govuk-select"
                        id="new-alb-duration"
                        value={newAlbDuration}
                        onChange={(e) => setNewAlbDuration(parseInt(e.target.value, 10))}
                      >
                        {CONSENT_DURATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {newAlbId && (
                        <div className="govuk-hint" style={{ fontSize: "13px", marginTop: "4px" }}>
                          Access will expire on{" "}
                          <strong>
                            {new Date(
                              Date.now() + newAlbDuration * 24 * 60 * 60 * 1000
                            ).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className="govuk-warning-text">
                      <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
                      <strong className="govuk-warning-text__text">
                        <span className="govuk-visually-hidden">Important</span>
                        By granting access, you consent under UK GDPR and the Data Protection Act 2018.
                        You can revoke this at any time.
                      </strong>
                    </div>

                    <div style={{ display: "flex", gap: "12px" }}>
                      <button
                        type="button"
                        className="govuk-button"
                        disabled={!newAlbId || consentSaving}
                        onClick={() => handleConsentUpdate("add", newAlbId, newAlbDuration)}
                      >
                        {consentSaving ? "Saving…" : "Grant access"}
                      </button>
                      <button
                        type="button"
                        className="govuk-button govuk-button--secondary"
                        onClick={() => setShowAddAlb(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Letters ── */}
        {result && result.outboundLetters && result.outboundLetters.length > 0 && (
          <div style={{ marginTop: "30px" }}>
            <h2 className="govuk-heading-m">Letters from Student Finance England</h2>
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">Date</th>
                  <th scope="col" className="govuk-table__header">Subject</th>
                  <th scope="col" className="govuk-table__header">Status</th>
                  <th scope="col" className="govuk-table__header">Action</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {result.outboundLetters.map((letter) => (
                  <tr key={letter.letter_id} className="govuk-table__row">
                    <td className="govuk-table__cell">{formatDate(letter.generated_at)}</td>
                    <td className="govuk-table__cell">{letter.subject}</td>
                    <td className="govuk-table__cell">
                      {letter.read_at ? (
                        <strong className="govuk-tag govuk-tag--green">Read</strong>
                      ) : (
                        <strong className="govuk-tag govuk-tag--blue">New</strong>
                      )}
                    </td>
                    <td className="govuk-table__cell">
                      <a
                        href={`/apply/letters/${encodeURIComponent(caseReference.trim())}/${letter.letter_id}`}
                        className="govuk-link"
                      >
                        View letter
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
