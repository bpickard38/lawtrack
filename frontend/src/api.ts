import type { Attorney, Case, Activity, ActivityCreate, CaseTimeSummary, CaseRule, RuleType } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// Attorneys
export async function fetchAttorneys(): Promise<Attorney[]> {
  const response = await fetch(`${API_BASE}/api/attorneys`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch attorneys');
  return response.json();
}

// Cases
export async function fetchCases(attorneyId?: number): Promise<Case[]> {
  const url = attorneyId 
    ? `${API_BASE}/api/cases?attorney_id=${attorneyId}`
    : `${API_BASE}/api/cases`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch cases');
  return response.json();
}

export async function createCase(data: { name: string; client_name?: string; attorney_id: number }): Promise<Case> {
  const response = await fetch(`${API_BASE}/api/cases`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create case');
  return response.json();
}

export async function updateCase(caseId: number, data: { name?: string; client_name?: string }): Promise<Case> {
  const response = await fetch(`${API_BASE}/api/cases/${caseId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update case');
  return response.json();
}

export async function deleteCase(caseId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/cases/${caseId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to delete case');
}

// Activities
export async function fetchActivities(params?: { 
  attorney_id?: number; 
  case_id?: number; 
  unassigned?: boolean;
  date?: string;
  start_date?: string;
  end_date?: string;
}): Promise<Activity[]> {
  const searchParams = new URLSearchParams();
  if (params?.attorney_id) searchParams.append('attorney_id', params.attorney_id.toString());
  if (params?.case_id) searchParams.append('case_id', params.case_id.toString());
  if (params?.unassigned) searchParams.append('unassigned', 'true');
  if (params?.date) searchParams.append('date', params.date);
  if (params?.start_date) searchParams.append('start_date', params.start_date);
  if (params?.end_date) searchParams.append('end_date', params.end_date);
  
  const url = `${API_BASE}/api/activities?${searchParams}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch activities');
  return response.json();
}

export async function createActivity(data: ActivityCreate): Promise<Activity> {
  const response = await fetch(`${API_BASE}/api/activities`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create activity');
  return response.json();
}

export async function updateActivity(activityId: number, update: any): Promise<Activity> {
  const response = await fetch(`${API_BASE}/api/activities/${activityId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error('Failed to update activity');
  return response.json();
}

export async function assignActivityToCase(activityId: number, caseId: number): Promise<Activity> {
  const response = await fetch(`${API_BASE}/api/activities/${activityId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ case_id: caseId }),
  });
  if (!response.ok) throw new Error('Failed to assign activity');
  return response.json();
}

export async function deleteActivity(activityId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/activities/${activityId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to delete activity');
}

// Case Time Summary
export async function fetchCaseTimeSummary(caseId: number): Promise<CaseTimeSummary> {
  const response = await fetch(`${API_BASE}/api/cases/${caseId}/time-summary`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch case summary');
  return response.json();
}

// Bulk Operations
export async function bulkAssignActivities(activityIds: number[], caseId: number): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/api/activities/bulk-assign`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ activity_ids: activityIds, case_id: caseId }),
  });
  if (!response.ok) throw new Error('Failed to bulk assign activities');
  return response.json();
}

export async function mergeActivities(activityIds: number[], description?: string, narrative?: string): Promise<Activity> {
  const response = await fetch(`${API_BASE}/api/activities/merge`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ activity_ids: activityIds, description, narrative }),
  });
  if (!response.ok) throw new Error('Failed to merge activities');
  return response.json();
}

export async function splitActivity(activityId: number, splitAtMinutes: number): Promise<{ first: { id: number }, second: { id: number } }> {
  const response = await fetch(`${API_BASE}/api/activities/${activityId}/split`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ split_at_minutes: splitAtMinutes }),
  });
  if (!response.ok) throw new Error('Failed to split activity');
  return response.json();
}

// Case Rules
export async function fetchCaseRules(): Promise<CaseRule[]> {
  const response = await fetch(`${API_BASE}/api/case-rules`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch case rules');
  return response.json();
}

export async function createCaseRule(data: {
  case_id: number;
  rule_type: RuleType;
  pattern: string;
  enabled?: boolean;
  priority?: number;
}): Promise<CaseRule> {
  const response = await fetch(`${API_BASE}/api/case-rules`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create case rule');
  return response.json();
}

export async function updateCaseRule(ruleId: number, data: {
  case_id?: number;
  rule_type?: RuleType;
  pattern?: string;
  enabled?: boolean;
  priority?: number;
}): Promise<CaseRule> {
  const response = await fetch(`${API_BASE}/api/case-rules/${ruleId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update case rule');
  return response.json();
}

export async function deleteCaseRule(ruleId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/case-rules/${ruleId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to delete case rule');
}

export async function testCaseRules(activityData: {
  document_name?: string;
  email_subject?: string;
  email_from?: string;
  contact_name?: string;
  description?: string;
}): Promise<{ matched: boolean; case_id: number | null; case_name: string | null }> {
  const response = await fetch(`${API_BASE}/api/case-rules/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(activityData),
  });
  if (!response.ok) throw new Error('Failed to test case rules');
  return response.json();
}

// Agent API key (for auto-tracking desktop agent)
export async function getAgentKeyStatus(): Promise<{ has_key: boolean; key_prefix: string | null }> {
  const response = await fetch(`${API_BASE}/api/auth/agent-key`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch agent key status');
  return response.json();
}

export async function createAgentKey(): Promise<{ api_key: string; key_prefix: string; message: string }> {
  const response = await fetch(`${API_BASE}/api/auth/agent-key`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to create agent key');
  return response.json();
}

export async function revokeAgentKey(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/agent-key`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to revoke agent key');
}

export async function deleteAccount(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete account');
  }
}