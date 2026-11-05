import { ApiError } from '../apiClient';
import type { ApiClient } from '../apiClient';
import { getToken, setToken } from '../session';
import type {
  CaseItem,
  CaseNote,
  ChecklistResult,
  DashboardData,
  KnowledgeItem,
  Me,
  ReplyTemplate,
  Review,
  SettingsData,
  Tenant
} from '../types';
import {
  buildSeedState,
  demoUsers,
  demoTenants,
  SEED_VERSION,
  type DemoSeedState,
  type DemoTenantRecord,
  type DemoUser
} from './fixtures';

const DATA_KEY = 'workhub.demo.data.v1';
const TOKEN_PREFIX = 'demo:';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(prefix: string): string {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function loadState(): DemoSeedState {
  const raw = localStorage.getItem(DATA_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoSeedState;
      if (parsed && parsed.version === SEED_VERSION && parsed.tenants) {
        return parsed;
      }
    } catch {
      // fall through to reseed
    }
  }
  const seed = buildSeedState();
  saveState(seed);
  return seed;
}

function saveState(state: DemoSeedState): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(state));
}

interface DemoSession {
  user: DemoUser;
  tenantId: string;
  role: string;
}

function currentSession(): DemoSession {
  const token = getToken();
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new ApiError(401, 'Session expired or invalid');
  }
  const rest = token.slice(TOKEN_PREFIX.length);
  const separator = rest.lastIndexOf(':');
  if (separator <= 0) {
    throw new ApiError(401, 'Session expired or invalid');
  }
  const email = rest.slice(0, separator);
  const tenantId = rest.slice(separator + 1);
  const user = demoUsers.find((item) => item.email.toLowerCase() === email.toLowerCase());
  const role = user ? user.memberships[tenantId] : undefined;
  if (!user || !role) {
    throw new ApiError(401, 'Session expired or invalid');
  }
  return { user, tenantId, role };
}

function tenantList(user: DemoUser): Tenant[] {
  return demoTenants
    .filter((tenant) => user.memberships[tenant.id])
    .map((tenant) => ({ ...tenant, role: user.memberships[tenant.id] }));
}

function meOf(session: DemoSession): Me {
  const tenants = tenantList(session.user);
  const active = tenants.find((tenant) => tenant.id === session.tenantId) ?? tenants[0];
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      locale: session.user.locale
    },
    activeTenant: active,
    activeTenantId: session.tenantId,
    role: session.role,
    tenants
  };
}

function tenantRecord(state: DemoSeedState, tenantId: string): DemoTenantRecord {
  const record = state.tenants[tenantId];
  if (!record) {
    throw new ApiError(404, 'Workspace not found');
  }
  return record;
}

function sortedCases(record: DemoTenantRecord): CaseItem[] {
  return clone(record.cases).sort((a, b) => b.createdAt - a.createdAt);
}

function sortedNotes(caseItem: CaseItem): CaseNote[] {
  return clone(caseItem.notes ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

function detailOf(record: DemoTenantRecord, caseId: string): CaseItem {
  const found = record.cases.find((item) => item.id === caseId);
  if (!found) {
    throw new ApiError(404, 'Case not found');
  }
  return { ...clone(found), notes: sortedNotes(found) };
}

function localize(caseItem: CaseItem, key: 'customer' | 'topic' | 'message', en: boolean): string {
  if (en) {
    const value = caseItem[`${key}En`];
    if (value) return value;
  }
  return caseItem[key] ?? '';
}

function localizeProduct(item: KnowledgeItem, key: 'name' | 'summary', en: boolean): string {
  if (en) {
    const value = item[`${key}En`];
    if (value) return value;
  }
  return item[key] ?? '';
}

function taskLabel(type: string, en: boolean): string {
  if (en) {
    if (type === 'audit') return 'Review sales communication';
    if (type === 'productCompare') return 'Summarize product facts requiring validation';
    if (type === 'content') return 'Draft product listing copy requiring approval';
    return 'Draft a customer reply';
  }
  if (type === 'audit') return '诊断销售沟通话术';
  if (type === 'productCompare') return '整理产品信息与待核对参数';
  if (type === 'content') return '生成需人工审核的商品描述';
  return '生成销售回复建议';
}

const CHECK_ZH = [
  '对话是否明确记录客户要解决的问题？',
  '是否确认必要的产品规格、数量或工况？',
  '报价、交期及承诺是否有授权资料依据？',
  '是否有明确的下一步跟进动作？'
];

const CHECK_EN = [
  "Is the customer's actual need clear?",
  'Are required product specifications, quantity or conditions captured?',
  'Are price and delivery promises supported by approved information?',
  'Is the next follow-up action clearly defined?'
];

function requireText(value: string | undefined, message: string): string {
  const text = value == null ? '' : value.trim();
  if (!text) {
    throw new ApiError(400, message);
  }
  return text;
}

export const demoApi: ApiClient = {
  login: async (email: string, password: string) => {
    const trimmed = (email || '').trim();
    if (!trimmed || !password) {
      throw new ApiError(400, 'Email and password are required');
    }
    const user = demoUsers.find((item) => item.email.toLowerCase() === trimmed.toLowerCase());
    if (!user || password !== user.password) {
      throw new ApiError(401, 'Invalid email or password');
    }
    const firstTenant = demoTenants.find((tenant) => user.memberships[tenant.id]);
    if (!firstTenant) {
      throw new ApiError(403, 'No workspace membership');
    }
    const token = `${TOKEN_PREFIX}${user.email}:${firstTenant.id}`;
    return { ...meOf({ user, tenantId: firstTenant.id, role: user.memberships[firstTenant.id] }), token };
  },

  me: async () => meOf(currentSession()),

  switchTenant: async (tenantId: string) => {
    const session = currentSession();
    const role = session.user.memberships[tenantId];
    if (!role) {
      throw new ApiError(403, 'You do not have access to this workspace');
    }
    setToken(`${TOKEN_PREFIX}${session.user.email}:${tenantId}`);
    return meOf({ user: session.user, tenantId, role });
  },

  setLocale: async (locale: string) => {
    if (locale !== 'zh' && locale !== 'en') {
      throw new ApiError(400, 'Unsupported locale');
    }
    return { locale };
  },

  dashboard: async () => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const total = record.cases.length;
    const done = record.cases.filter((item) => item.status === 'done').length;
    const result: DashboardData = {
      totalCases: total,
      openCases: total - done,
      doneCases: done,
      knowledgeCount: record.products.length,
      unreviewedCount: record.products.filter((item) => item.reviewStatus === 'unreviewed').length,
      recentCases: sortedCases(record).slice(0, 4),
      requirements: clone(record.requirements)
    };
    return result;
  },

  cases: async () => {
    const session = currentSession();
    const state = loadState();
    return sortedCases(tenantRecord(state, session.tenantId));
  },

  caseDetail: async (id: string) => {
    const session = currentSession();
    const state = loadState();
    return detailOf(tenantRecord(state, session.tenantId), id);
  },

  createCase: async (payload: Record<string, string>) => {
    const session = currentSession();
    const customer = requireText(payload.customer, 'Customer, topic and message are required');
    const topic = requireText(payload.topic, 'Customer, topic and message are required');
    const message = requireText(payload.message, 'Customer, topic and message are required');
    if (customer.length > 100 || topic.length > 120 || message.length > 4000) {
      throw new ApiError(400, 'Input exceeds maximum length');
    }
    const channel = ['WhatsApp', 'Email', 'Wechat', 'Other'].includes(payload.channel || '')
      ? payload.channel
      : 'Other';
    const priority: CaseItem['priority'] = payload.priority === 'high' ? 'high' : 'normal';
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const id = newId('C-');
    const now = Date.now();
    const created: CaseItem = {
      id,
      customer,
      topic,
      message,
      channel,
      status: 'open',
      priority,
      stage: 'start',
      ownerName: session.user.displayName,
      createdAt: now,
      updatedAt: now,
      notes: []
    };
    record.cases.unshift(created);
    saveState(state);
    return detailOf(record, id);
  },

  updateStatus: async (id: string, status: string) => {
    if (!['open', 'progress', 'done'].includes(status)) {
      throw new ApiError(400, 'Unknown case status');
    }
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const found = record.cases.find((item) => item.id === id);
    if (!found) {
      throw new ApiError(404, 'Case not found');
    }
    if (status === 'done') {
      found.stage = 'follow';
    } else if (status === 'progress') {
      found.stage = 'clarify';
    } else {
      found.stage = 'start';
    }
    found.status = status as CaseItem['status'];
    found.updatedAt = Date.now();
    found.notes = found.notes ?? [];
    found.notes.push({
      id: newId('N-'),
      text: `status:${status}`,
      authorName: session.user.displayName,
      createdAt: found.updatedAt
    });
    saveState(state);
    return detailOf(record, id);
  },

  addNote: async (id: string, text: string) => {
    const value = requireText(text, 'Follow-up note is required');
    if (value.length > 1400) {
      throw new ApiError(400, 'Follow-up note is too long');
    }
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const found = record.cases.find((item) => item.id === id);
    if (!found) {
      throw new ApiError(404, 'Case not found');
    }
    const now = Date.now();
    found.notes = found.notes ?? [];
    found.notes.push({
      id: newId('N-'),
      text: value,
      authorName: session.user.displayName,
      createdAt: now
    });
    found.updatedAt = now;
    saveState(state);
    return detailOf(record, id);
  },

  reply: async (id: string) => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    if (!record.cases.some((item) => item.id === id)) {
      throw new ApiError(404, 'Case not found');
    }
    const result: ReplyTemplate = { ...clone(record.template), requirements: clone(record.requirements) };
    return result;
  },

  logReplyCopy: async () => ({ logged: true }),

  knowledge: async () => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    return clone(record.products).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  createKnowledge: async (payload: Record<string, string>) => {
    const name = requireText(payload.name, 'Name, SKU and summary are required');
    const sku = requireText(payload.sku, 'Name, SKU and summary are required');
    const summary = requireText(payload.summary, 'Name, SKU and summary are required');
    if (name.length > 120 || sku.length > 80 || summary.length > 4000) {
      throw new ApiError(400, 'Input exceeds maximum length');
    }
    const source = payload.source && payload.source.trim() ? payload.source.trim() : 'User entry';
    if (source.length > 180) {
      throw new ApiError(400, 'Source is too long');
    }
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const now = Date.now();
    const created: KnowledgeItem = {
      id: newId('P-'),
      sku,
      name,
      nameEn: null,
      summary,
      summaryEn: null,
      source,
      reviewStatus: 'unreviewed',
      verified: false,
      version: 1,
      updatedAt: now,
      reviewerName: null
    };
    record.products.unshift(created);
    saveState(state);
    return clone(created);
  },

  approveKnowledge: async (id: string) => {
    const session = currentSession();
    if (session.role !== 'ADMIN' && session.role !== 'REVIEWER') {
      throw new ApiError(403, 'Only admin or product reviewer can approve knowledge');
    }
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const found = record.products.find((item) => item.id === id);
    if (!found) {
      throw new ApiError(404, 'Knowledge item not found');
    }
    found.reviewStatus = 'verified';
    found.verified = true;
    found.reviewerName = session.user.displayName;
    found.version += 1;
    found.updatedAt = Date.now();
    saveState(state);
    return clone(found);
  },

  prompt: async (caseId: string, type: string, lang: string) => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const tenant = demoTenants.find((item) => item.id === session.tenantId);
    const orgZh = tenant ? tenant.nameZh : '';
    const orgEn = tenant ? tenant.nameEn : '';
    const en = lang === 'en';
    const caseItem = caseId ? detailOf(record, caseId) : null;
    const products = clone(record.products);
    const lines: string[] = [];
    if (en) {
      lines.push('You are an internal business assistant. Use only the information supplied. Never invent prices, stock, delivery dates, technical specifications, or deal outcomes.');
      lines.push(`Business: ${orgEn}.`);
      lines.push(`Task: ${taskLabel(type, true)}.`);
      if (caseItem) {
        lines.push(`Customer message: ${localize(caseItem, 'message', true)}`);
        lines.push(`Topic: ${localize(caseItem, 'topic', true)}`);
      }
      lines.push('Separate confirmed facts from missing details. Use supplied product records only and do not treat unreviewed entries as approved facts.');
      lines.push('Reference entries (limited to these items):');
      for (const product of products.slice(0, 5)) {
        lines.push(`${product.sku}: ${localizeProduct(product, 'name', true)} — ${localizeProduct(product, 'summary', true)} [${product.verified ? 'reviewed' : 'unreviewed'}]`);
      }
      lines.push('Output: 1. Customer needs 2. Missing details 3. Draft response 4. Next action 5. Claims and specs needing human review.');
    } else {
      lines.push('你是企业内部业务辅助工具。只依据已提供的信息分析，禁止编造价格、库存、交期、产品规格或成交结论。');
      lines.push(`公司业务：${orgZh}。`);
      lines.push(`任务：${taskLabel(type, false)}。`);
      if (caseItem) {
        lines.push(`客户原话：${localize(caseItem, 'message', false)}`);
        lines.push(`主题：${localize(caseItem, 'topic', false)}`);
      }
      lines.push('请先明确已知事实与缺失信息。需要产品信息时，只使用我提供的知识条目，未审核的条目不得当作确定事实。');
      lines.push('内部参考资料（仅限以下条目）：');
      for (const product of products.slice(0, 5)) {
        lines.push(`${product.sku}: ${localizeProduct(product, 'name', false)} — ${localizeProduct(product, 'summary', false)} [${product.verified ? 'reviewed' : 'unreviewed'}]`);
      }
      lines.push('输出格式：1.客户需求 2.缺失信息 3.参考回复 4.下步动作 5.待人工核验的承诺与参数。');
    }
    return { prompt: lines.join('\n') };
  },

  checklist: async (conversation: string, lang: string) => {
    const text = conversation == null ? '' : conversation.trim();
    if (!text) {
      throw new ApiError(400, 'Conversation is required');
    }
    const en = lang === 'en';
    const checks = en ? CHECK_EN : CHECK_ZH;
    const lines = [
      en ? 'Please review these points manually; no AI is called here:' : '请根据以下清单由人工检查；此处没有调用 AI：',
      '',
      ...checks.map((check, index) => `${index + 1}. ${check}`),
      '',
      en ? 'Conversation to review:' : '待复盘对话：',
      text
    ];
    const result: ChecklistResult = { checklist: lines.join('\n'), checks: [...checks] };
    return result;
  },

  reviews: async () => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    return clone(record.reviews).sort((a, b) => b.createdAt - a.createdAt);
  },

  saveReview: async (payload: { conversation: string; result: string; caseId?: string }) => {
    const conversation = (payload.conversation || '').trim();
    const result = requireText(payload.result, 'Review conclusion is required');
    if (result.length > 8000 || conversation.length > 8000) {
      throw new ApiError(400, 'Review content is too long');
    }
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const caseId = payload.caseId && payload.caseId.trim() ? payload.caseId.trim() : null;
    if (caseId && !record.cases.some((item) => item.id === caseId)) {
      throw new ApiError(404, 'Case not found');
    }
    const saved: Review = {
      id: newId('R-'),
      caseId,
      conversation,
      result,
      authorName: session.user.displayName,
      createdAt: Date.now()
    };
    record.reviews.unshift(saved);
    saveState(state);
    return clone(saved);
  },

  settings: async () => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    const result: SettingsData = {
      stats: {
        totalCases: record.cases.length,
        knowledgeCount: record.products.length,
        reviewCount: record.reviews.length,
        doneCases: record.cases.filter((item) => item.status === 'done').length
      },
      role: session.role,
      user: session.user.email
    };
    return result;
  },

  exportData: async () => {
    const session = currentSession();
    const state = loadState();
    const record = tenantRecord(state, session.tenantId);
    return {
      exportedAt: new Date().toISOString(),
      note: 'AI WorkHub V2 GitHub Pages demo export',
      data: {
        cases: clone(record.cases).map((item) => ({ ...item, notes: sortedNotes(item) })),
        products: clone(record.products),
        reviews: clone(record.reviews),
        requirements: clone(record.requirements)
      }
    };
  },

  resetDemo: async () => {
    const session = currentSession();
    if (session.role !== 'ADMIN') {
      throw new ApiError(403, 'Only workspace admin can reset demo data');
    }
    const state = loadState();
    const seed = buildSeedState();
    state.tenants[session.tenantId] = seed.tenants[session.tenantId];
    saveState(state);
    return { reset: true };
  }
};
