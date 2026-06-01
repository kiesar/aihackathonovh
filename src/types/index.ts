// DSA Allowance Service — Core Data Models

// ── Case Types ──────────────────────────────────────────────

export type CaseType = "dsa_application" | "allowance_review" | "compliance_check";

export type WorkflowStateName =
  | "awaiting_evidence"
  | "evidence_requested"
  | "evidence_received"
  | "under_review"
  | "awaiting_assessment"
  | "approved"
  | "rejected"
  | "escalated"
  | "closed";

export type TimelineEventType =
  | "case_created"
  | "evidence_requested"
  | "evidence_received"
  | "state_transition"
  | "reminder_sent"
  | "escalated"
  | "reassigned"
  | "decision_made"
  | "notification_sent";

// ── Applicant ───────────────────────────────────────────────

export interface Address {
  line1: string;
  line2?: string;
  line3?: string;
  postcode: string;
}

export interface Applicant {
  name: string;
  forenames: string;
  surname: string;
  reference: string;
  date_of_birth: string;
  sex: "male" | "female" | "non-binary" | "prefer_not_to_say";
  address: Address;
  university: string;
  course: string;
  notification_channel: "email" | "sms";
  email?: string;
  phone?: string;
}

// ── Cost & Application Data ─────────────────────────────────

export interface CostItem {
  id: string;
  description: string;
  amount: number;
  supplier: string;
}

export interface ApplicationFormData {
  cost_items: CostItem[];
  total_amount: number;
  declaration_confirmed: boolean;
  submitted_at: string;
}

// ── Timeline ────────────────────────────────────────────────

export interface TimelineEntry {
  date: string;
  event: TimelineEventType;
  note: string;
  actor?: string;
}

// ── Case ────────────────────────────────────────────────────

export interface Case {
  case_id: string;
  case_type: CaseType;
  status: WorkflowStateName;
  applicant: Applicant;
  assigned_to: string;
  created_date: string;
  last_updated: string;
  timeline: TimelineEntry[];
  case_notes: string;
  application_data?: ApplicationFormData;
  evidence_requested_date?: string;
  decision_reason?: string;
  evidence_submissions?: EvidenceSubmission[];
  outbound_letters?: OutboundLetter[];
}

// ── Workflow ────────────────────────────────────────────────

export interface WorkflowTransition {
  to_state: WorkflowStateName;
  display_label: string;
  requires_note: true;
  requires_decision_reason?: boolean;
}

export interface WorkflowStateDefinition {
  state_id: WorkflowStateName;
  display_name: string;
  applicable_case_types: CaseType[];
  required_action: string;
  allowed_transitions: WorkflowTransition[];
  escalation_threshold_days?: number;
}

// ── Policy ──────────────────────────────────────────────────

export interface PolicyExtract {
  policy_id: string;
  title: string;
  applicable_case_types: CaseType[];
  body: string;
  relevant_states?: WorkflowStateName[];
}

// ── User ────────────────────────────────────────────────────

export interface User {
  username: string;
  password_hash: string;
  role: "caseworker" | "team_leader";
  team: string;
  display_name: string;
}

// ── Evidence ────────────────────────────────────────────────

export interface ExtractedEvidenceField {
  key: string;          // machine key, e.g. "document_date"
  label: string;        // human label, e.g. "Document date"
  value: string;        // extracted (or corrected) value
  confidence: "high" | "medium" | "low";
}

export interface EvidenceSubmission {
  submitted_at: string;
  description: string;
  files: Array<{ name: string; size: number; type: string }>;
  extracted_fields: ExtractedEvidenceField[];
  consent_grants?: ConsentGrant[];
}

// ── ALB Consent ──────────────────────────────────────────────

export interface GovernmentALB {
  alb_id: string;
  name: string;
  abbreviation: string;
  description: string;
  evidence_types: string[];   // e.g. ["diagnostic", "bank", "address"]
  website: string;
}

export interface ConsentGrant {
  alb_id: string;
  alb_name: string;
  granted_at: string;
  expires_at: string;         // ISO date
  evidence_types: string[];   // what evidence types they can access
  revoked_at?: string;
}

// ── Correspondence ──────────────────────────────────────────

export type CorrespondenceType =
  | "reminder_evidence"
  | "reminder_assessment"
  | "escalation_notice"
  | "decision_approved"
  | "decision_rejected"
  | "acknowledgement"
  | "general_update";

export interface OutboundLetter {
  letter_id: string;
  generated_at: string;
  type: CorrespondenceType;
  subject: string;
  body: string;
  sent_via: "email" | "sms" | "post";
  sent_to: string;           // email address or phone number
  triggered_by: "automatic" | "manual";
  trigger_rule?: string;     // e.g. "awaiting_evidence_7d"
  read_at?: string;          // ISO timestamp when student viewed it
}

export interface CorrespondenceRule {
  rule_id: string;
  name: string;
  enabled: boolean;
  trigger_status: WorkflowStateName;
  trigger_after_days: number;
  correspondence_type: CorrespondenceType;
  subject_template: string;
  body_template: string;     // supports {{applicant_name}}, {{case_id}}, {{days_outstanding}}, {{university}}
  send_via: "email" | "sms" | "both";
  repeat_every_days?: number; // if set, re-send every N days until status changes
}

// ── AI Summary ──────────────────────────────────────────────

export interface AISummaryRequest {
  caseId: string;
  caseType: CaseType;
  currentState: WorkflowStateName;
  applicantName: string;
  timelineSummary: string;
  caseNotes: string;
}

export interface AISummaryResponse {
  summary: string;
  outstandingEvidence: string[];
  recommendedAction: string;
  generatedAt: string;
  isAiGenerated: true;
}
