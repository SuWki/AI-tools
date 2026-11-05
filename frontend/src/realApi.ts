import { ApiError } from './apiClient';
import type { ApiClient } from './apiClient';
import { getToken } from './session';
import type {
  CaseItem,
  ChecklistResult,
  DashboardData,
  KnowledgeItem,
  Me,
  ReplyTemplate,
  Review,
  SettingsData
} from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body && body.error) {
        message = body.error;
      }
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const realApi: ApiClient = {
  login: (email: string, password: string) =>
    request<Me>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  me: () => request<Me>('/auth/me'),
  switchTenant: (tenantId: string) =>
    request<Me>('/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId })
    }),
  setLocale: (locale: string) =>
    request('/auth/locale', { method: 'PATCH', body: JSON.stringify({ locale }) }),
  dashboard: () => request<DashboardData>('/dashboard'),
  cases: () => request<CaseItem[]>('/cases'),
  caseDetail: (id: string) => request<CaseItem>(`/cases/${encodeURIComponent(id)}`),
  createCase: (payload: Record<string, string>) =>
    request<CaseItem>('/cases', { method: 'POST', body: JSON.stringify(payload) }),
  updateStatus: (id: string, status: string) =>
    request<CaseItem>(`/cases/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  addNote: (id: string, text: string) =>
    request<CaseItem>(`/cases/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
  reply: (id: string) => request<ReplyTemplate>(`/cases/${encodeURIComponent(id)}/reply`),
  logReplyCopy: (id: string) =>
    request(`/cases/${encodeURIComponent(id)}/reply-copy`, { method: 'POST' }),
  knowledge: () => request<KnowledgeItem[]>('/knowledge'),
  createKnowledge: (payload: Record<string, string>) =>
    request<KnowledgeItem>('/knowledge', { method: 'POST', body: JSON.stringify(payload) }),
  approveKnowledge: (id: string) =>
    request<KnowledgeItem>(`/knowledge/${encodeURIComponent(id)}/review`, { method: 'PATCH' }),
  prompt: (caseId: string, type: string, lang: string) => {
    const query = new URLSearchParams({ type, lang });
    if (caseId) {
      query.set('caseId', caseId);
    }
    return request<{ prompt: string }>(`/tools/prompt?${query.toString()}`);
  },
  checklist: (conversation: string, lang: string) =>
    request<ChecklistResult>('/analysis/checklist', {
      method: 'POST',
      body: JSON.stringify({ conversation, lang })
    }),
  reviews: () => request<Review[]>('/analysis/reviews'),
  saveReview: (payload: { conversation: string; result: string; caseId?: string }) =>
    request<Review>('/analysis/reviews', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  settings: () => request<SettingsData>('/settings'),
  exportData: () => request<Record<string, unknown>>('/export'),
  resetDemo: () => request<{ reset: boolean }>('/admin/reset-demo', { method: 'POST' })
};
