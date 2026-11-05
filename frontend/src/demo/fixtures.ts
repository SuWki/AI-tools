import type { CaseItem, KnowledgeItem, Requirement, Review } from '../types';

export interface DemoUser {
  id: string;
  email: string;
  displayName: string;
  locale: 'zh' | 'en';
  password: string;
  memberships: Record<string, 'ADMIN' | 'SALES' | 'REVIEWER' | 'MANAGER'>;
}

export interface DemoTenantBase {
  id: string;
  nameZh: string;
  nameEn: string;
  businessType: 'compressor' | 'lubricant' | 'alpaca';
}

export interface DemoReplyTemplate {
  replyZh: string;
  replyEn: string;
  nextZh: string;
  nextEn: string;
}

export interface DemoTenantRecord {
  cases: CaseItem[];
  products: KnowledgeItem[];
  reviews: Review[];
  requirements: Requirement[];
  template: DemoReplyTemplate;
}

export interface DemoSeedState {
  version: string;
  tenants: Record<string, DemoTenantRecord>;
}

const HOUR = 3_600_000;

export const demoUsers: DemoUser[] = [
  {
    id: 'U-ADMIN', email: 'admin@workhub.demo', displayName: 'Demo Admin', locale: 'zh',
    password: 'demo1234', memberships: { 't-compressor': 'ADMIN', 't-lubricant': 'ADMIN', 't-alpaca': 'ADMIN' }
  },
  {
    id: 'U-SALES-C', email: 'sales@compressor.demo', displayName: 'Compressor Sales', locale: 'zh',
    password: 'demo1234', memberships: { 't-compressor': 'SALES' }
  },
  {
    id: 'U-REVIEWER-C', email: 'reviewer@compressor.demo', displayName: 'Compressor Reviewer', locale: 'zh',
    password: 'demo1234', memberships: { 't-compressor': 'REVIEWER' }
  },
  {
    id: 'U-MANAGER-C', email: 'manager@compressor.demo', displayName: 'Compressor Manager', locale: 'zh',
    password: 'demo1234', memberships: { 't-compressor': 'MANAGER' }
  },
  {
    id: 'U-SALES-L', email: 'sales@lubricant.demo', displayName: 'Lubricant Sales', locale: 'zh',
    password: 'demo1234', memberships: { 't-lubricant': 'SALES' }
  },
  {
    id: 'U-SALES-A', email: 'sales@alpaca.demo', displayName: 'Alpaca Sales', locale: 'zh',
    password: 'demo1234', memberships: { 't-alpaca': 'SALES' }
  }
];

export const demoTenants: DemoTenantBase[] = [
  { id: 't-compressor', nameZh: '空压机设备公司', nameEn: 'Air Compressor Co.', businessType: 'compressor' },
  { id: 't-lubricant', nameZh: '润滑油贸易公司', nameEn: 'Lubricants Trading Co.', businessType: 'lubricant' },
  { id: 't-alpaca', nameZh: '羊驼工艺品公司', nameEn: 'Alpaca Crafts Co.', businessType: 'alpaca' }
];

function product(id: string, sku: string, name: string, nameEn: string, summary: string,
                 summaryEn: string, source: string, createdAt: number): KnowledgeItem {
  return {
    id, sku, name, nameEn, summary, summaryEn, source,
    reviewStatus: 'unreviewed', verified: false, version: 1, updatedAt: createdAt, reviewerName: null
  };
}

function inquiry(id: string, customer: string, customerEn: string, topic: string, topicEn: string,
                 message: string, messageEn: string, channel: string,
                 status: CaseItem['status'], priority: CaseItem['priority'], createdAt: number): CaseItem {
  return {
    id, customer, customerEn, topic, topicEn, message, messageEn, channel, status, priority,
    stage: status === 'progress' ? 'clarify' : 'start', createdAt, updatedAt: createdAt, notes: []
  };
}

export const SEED_VERSION = '2026-11-05-v1';

export function buildSeedState(now = Date.now()): DemoSeedState {
  return {
    version: SEED_VERSION,
    tenants: {
      't-compressor': {
        cases: [
          inquiry('C-1024', '海外设备采购商 A', 'Overseas buyer A', '空压机采购咨询', 'Compressor inquiry',
            '我们工厂需要空压机，要求 10bar，能帮忙推荐型号和报价吗？',
            'Our factory needs an air compressor at 10 bar. Can you recommend a model and quote?',
            'WhatsApp', 'open', 'high', now - 2 * HOUR),
          inquiry('C-1023', '设备经销商 B', 'Equipment distributor B', '经销合作咨询', 'Distribution inquiry',
            '想了解你们的设备系列和经销合作方式。',
            'We would like to understand your product ranges and dealer terms.',
            'Email', 'progress', 'normal', now - 26 * HOUR)
        ],
        products: [
          product('P-01', 'AC-DEMO-01', '喷油螺杆式空压机（示意）', 'Oil-injected screw compressor (sample)',
            '仅展示产品知识归档方式，技术参数须以真实厂家资料为准。',
            'Illustrates product records only. Verify technical specifications against manufacturer files.',
            'Demo catalog', now - 30 * HOUR),
          product('P-02', 'AC-DEMO-02', '空压机油气分离组件（示意）', 'Air/oil separator assembly (sample)',
            '示例部件，不对应真实零件号。', 'Illustrative part, not linked to any real part number.',
            'Demo diagram', now - 50 * HOUR)
        ],
        reviews: [],
        requirements: [
          { id: 't-compressor-RUL-1', textZh: '设备用途 / 使用工况', textEn: 'Equipment purpose / operating conditions' },
          { id: 't-compressor-RUL-2', textZh: '目标排气压力与排气量', textEn: 'Required discharge pressure and flow' },
          { id: 't-compressor-RUL-3', textZh: '电源及现场环境', textEn: 'Electrical supply and installation conditions' },
          { id: 't-compressor-RUL-4', textZh: '采购数量与预期时间', textEn: 'Quantity and target purchase date' }
        ],
        template: {
          replyZh: '您好，感谢咨询空压机产品。为了准确推荐型号，想先确认设备使用用途、所需排气压力与排气量，以及现场供电和采购时间。收到这些信息后，我们会依据最新的产品资料核实方案与报价。',
          replyEn: 'Thank you for your interest in our air compressors. To recommend a suitable model, could you confirm the equipment application, required discharge pressure and air flow, power supply and estimated purchase date? We will verify available options and quotations against the latest approved product documents.',
          nextZh: '补齐压力、排气量、用途等参数，再核实厂家资料与报价。',
          nextEn: 'Confirm pressure, flow and use case, then verify technical documents and quotation.'
        }
      },
      't-lubricant': {
        cases: [
          inquiry('C-2024', '工厂采购方', 'Factory purchasing team', '润滑油规格咨询', 'Lubricant specification inquiry',
            '我们有设备维护需求，想了解适合的油品，需要准备哪些参数？',
            'We need lubricant for equipment maintenance. Which specifications should we provide?',
            'Email', 'open', 'normal', now - 5 * HOUR)
        ],
        products: [
          product('P-03', 'LUB-DEMO-01', '工业润滑油产品档案（示意）', 'Industrial lubricant record (sample)',
            '型号与规格待补充，不能用作选型依据。', 'Model and specifications are placeholders, not a selection basis.',
            'Demo catalog', now - 30 * HOUR)
        ],
        reviews: [],
        requirements: [
          { id: 't-lubricant-RUL-1', textZh: '设备类型或使用用途', textEn: 'Equipment type or usage' },
          { id: 't-lubricant-RUL-2', textZh: '要求的技术规格或粘度等级', textEn: 'Technical specification / viscosity grade' },
          { id: 't-lubricant-RUL-3', textZh: '采购数量与包装规格', textEn: 'Quantity and package size' },
          { id: 't-lubricant-RUL-4', textZh: '现用产品与更换原因', textEn: 'Current product and reason for change' }
        ],
        template: {
          replyZh: '您好，感谢咨询。请问产品主要用于哪类设备或工况？您需要的技术规格、采购数量和包装方式是什么？我们会先核对相应产品技术资料，再提供合适的产品信息。',
          replyEn: 'Thank you for your inquiry. Which equipment or operating conditions will the lubricant be used for? Please share the required technical specification, quantity and packaging preference. We will verify the relevant technical documentation before providing product details.',
          nextZh: '补齐设备工况与技术规格，请产品负责人复核匹配结果。',
          nextEn: 'Confirm operating conditions and specs; have the product owner review the match.'
        }
      },
      't-alpaca': {
        cases: [
          inquiry('C-3024', '国内零售客户', 'Domestic retail customer', '羊驼工艺品礼物咨询', 'Alpaca gift inquiry',
            '想买一个送朋友，有哪些款式？多久能发货？',
            'I want a gift for a friend. What styles are available and when can you ship?',
            'Wechat', 'open', 'normal', now - 8 * HOUR)
        ],
        products: [
          product('P-04', 'ALP-DEMO-01', '羊驼手工摆件（示意）', 'Handcrafted alpaca ornament (sample)',
            '展示款式记录与客服答疑模板，库存需人工确认。', 'Demonstrates catalog and customer reply. Stock must be checked.',
            'Demo product list', now - 30 * HOUR)
        ],
        reviews: [],
        requirements: [
          { id: 't-alpaca-RUL-1', textZh: '款式、颜色及尺寸', textEn: 'Style, color and dimensions' },
          { id: 't-alpaca-RUL-2', textZh: '预计购买数量', textEn: 'Quantity' },
          { id: 't-alpaca-RUL-3', textZh: '预算与用途', textEn: 'Budget and intended use' },
          { id: 't-alpaca-RUL-4', textZh: '收货城市与时间要求', textEn: 'Delivery city and required date' }
        ],
        template: {
          replyZh: '您好，感谢关注我们的羊驼工艺品。想请问您偏好的款式、颜色、尺寸和数量，以及收货城市？我们核实款式、库存与配送安排后再给您准确回复。',
          replyEn: 'Thank you for your interest in our alpaca crafts. Which style, color and size do you prefer, how many would you like, and what is the delivery city? We will check the available items and delivery arrangements before confirming details.',
          nextZh: '确认款式、数量和收货城市，再核实库存与物流。',
          nextEn: 'Confirm style, quantity and delivery city, then check stock and shipping.'
        }
      }
    }
  };
}
