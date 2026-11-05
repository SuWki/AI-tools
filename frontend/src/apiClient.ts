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

export interface ApiClient {
  login: (email: string, password: string) => Promise<Me>;
  me: () => Promise<Me>;
  switchTenant: (tenantId: string) => Promise<Me>;
  setLocale: (locale: string) => Promise<unknown>;
  dashboard: () => Promise<DashboardData>;
  cases: () => Promise<CaseItem[]>;
  caseDetail: (id: string) => Promise<CaseItem>;
  createCase: (payload: Record<string, string>) => Promise<CaseItem>;
  updateStatus: (id: string, status: string) => Promise<CaseItem>;
  addNote: (id: string, text: string) => Promise<CaseItem>;
  reply: (id: string) => Promise<ReplyTemplate>;
  logReplyCopy: (id: string) => Promise<unknown>;
  knowledge: () => Promise<KnowledgeItem[]>;
  createKnowledge: (payload: Record<string, string>) => Promise<KnowledgeItem>;
  approveKnowledge: (id: string) => Promise<KnowledgeItem>;
  prompt: (caseId: string, type: string, lang: string) => Promise<{ prompt: string }>;
  checklist: (conversation: string, lang: string) => Promise<ChecklistResult>;
  reviews: () => Promise<Review[]>;
  saveReview: (payload: { conversation: string; result: string; caseId?: string }) => Promise<Review>;
  settings: () => Promise<SettingsData>;
  exportData: () => Promise<Record<string, unknown>>;
  resetDemo: () => Promise<{ reset: boolean }>;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
