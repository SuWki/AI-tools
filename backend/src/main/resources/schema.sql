CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  business_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  UNIQUE(user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  customer_en TEXT,
  topic TEXT NOT NULL,
  topic_en TEXT,
  message TEXT NOT NULL,
  message_en TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  stage TEXT NOT NULL,
  owner_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_tenant ON cases(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS case_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  author_id TEXT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_case ON case_notes(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  summary TEXT NOT NULL,
  summary_en TEXT,
  source TEXT,
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  reviewer_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS requirement_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sort_no INTEGER NOT NULL,
  text_zh TEXT NOT NULL,
  text_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reply_templates (
  tenant_id TEXT PRIMARY KEY,
  reply_zh TEXT NOT NULL,
  reply_en TEXT NOT NULL,
  next_zh TEXT NOT NULL,
  next_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT,
  conversation TEXT NOT NULL,
  result TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON reviews(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS case_workflows (
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (tenant_id, case_id)
);
CREATE TABLE IF NOT EXISTS case_access (
  tenant_id TEXT NOT NULL, case_id TEXT NOT NULL, user_id TEXT NOT NULL,
  PRIMARY KEY(tenant_id,case_id,user_id)
);
CREATE TABLE IF NOT EXISTS knowledge_versions (
  tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, version INTEGER NOT NULL,
  content TEXT NOT NULL, status TEXT NOT NULL, author_id TEXT,
  created_at INTEGER NOT NULL, reviewer_id TEXT, reviewed_at INTEGER,
  PRIMARY KEY(tenant_id,product_id,version)
);
CREATE TABLE IF NOT EXISTS procurement_projects (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL
);
