export type Lang = 'zh' | 'en';

export type Page = 'dashboard' | 'cases' | 'knowledge' | 'tools' | 'analysis' | 'settings';

export interface Tenant {
  id: string;
  nameZh: string;
  nameEn: string;
  businessType: 'compressor' | 'lubricant' | 'alpaca';
  role: string;
}

export interface Me {
  user: { id: string; email: string; displayName: string; locale: string };
  activeTenant: Tenant;
  activeTenantId: string;
  role: string;
  tenants: Tenant[];
  token?: string;
}

export interface CaseNote {
  id: string;
  text: string;
  createdAt: number;
  authorName?: string;
}

export interface CaseItem {
  id: string;
  customer: string;
  customerEn?: string | null;
  topic: string;
  topicEn?: string | null;
  message: string;
  messageEn?: string | null;
  channel: string;
  status: 'open' | 'progress' | 'done';
  priority: 'high' | 'normal';
  stage: string;
  ownerName?: string;
  createdAt: number;
  updatedAt: number;
  notes?: CaseNote[];
}

export interface Requirement {
  id: string;
  textZh: string;
  textEn: string;
}

export interface ReplyTemplate {
  replyZh: string;
  replyEn: string;
  nextZh: string;
  nextEn: string;
  requirements: Requirement[];
}

export interface KnowledgeItem {
  id: string;
  sku: string;
  name: string;
  nameEn?: string | null;
  summary: string;
  summaryEn?: string | null;
  source?: string | null;
  reviewStatus: 'unreviewed' | 'verified';
  verified: boolean;
  version: number;
  updatedAt: number;
  reviewerName?: string | null;
}

export interface DashboardData {
  totalCases: number;
  openCases: number;
  doneCases: number;
  knowledgeCount: number;
  unreviewedCount: number;
  recentCases: CaseItem[];
  requirements: Requirement[];
}

export interface Review {
  id: string;
  caseId?: string | null;
  conversation: string;
  result: string;
  createdAt: number;
  authorName?: string;
}

export interface SettingsData {
  stats: {
    totalCases: number;
    knowledgeCount: number;
    reviewCount: number;
    doneCases: number;
  };
  role: string;
  user: string;
}

export interface ChecklistResult {
  checklist: string;
  checks: string[];
}
