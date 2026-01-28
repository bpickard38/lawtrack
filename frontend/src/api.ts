import type { Attorney, Case, Activity, ActivityCreate, CaseTimeSummary } from './types';

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