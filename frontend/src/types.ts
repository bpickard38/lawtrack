export type ActivityType = 'document' | 'email' | 'call';

export interface Attorney {
  id: number;
  user_id: number;
  name: string;
  email: string;
  billable_rate: number;
  created_at: string;
}

export interface Case {
  id: number;
  name: string;
  client_name: string | null;
  attorney_id: number;
  status: string;
  created_at: string;
}

export interface Activity {
  id: number;
  attorney_id: number;
  case_id: number | null;
  type: ActivityType;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  description: string | null;
  
  // Type-specific fields
  document_name: string | null;
  email_from: string | null;
  email_to: string | null;
  email_subject: string | null;
  contact_name: string | null;
  phone_number: string | null;
  
  source: string;
  created_at: string;
}

export interface ActivityCreate {
  attorney_id: number;
  type: ActivityType;
  start_time: string;
  end_time: string;
  description?: string;
  document_name?: string;
  email_from?: string;
  email_to?: string;
  email_subject?: string;
  contact_name?: string;
  phone_number?: string;
}

export interface CaseTimeSummary {
  case_id: number;
  case_name: string;
  client_name: string | null;
  total_minutes: number;
  total_hours: number;
  document_minutes: number;
  email_minutes: number;
  call_minutes: number;
  activity_count: number;
}