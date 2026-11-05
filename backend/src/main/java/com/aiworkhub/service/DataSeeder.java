package com.aiworkhub.service;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements ApplicationRunner {

    private static final long HOUR = 3600_000L;
    private static final String DEMO_PASSWORD = "demo1234";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        Integer tenants = jdbc.queryForObject("SELECT COUNT(*) FROM tenants", Integer.class);
        if (tenants != null && tenants > 0) {
            return;
        }
        long now = System.currentTimeMillis();
        jdbc.update("INSERT INTO tenants(id, name_zh, name_en, business_type, created_at) VALUES (?,?,?,?,?)",
                "t-compressor", "空压机设备公司", "Air Compressor Co.", "compressor", now);
        jdbc.update("INSERT INTO tenants(id, name_zh, name_en, business_type, created_at) VALUES (?,?,?,?,?)",
                "t-lubricant", "润滑油贸易公司", "Lubricants Trading Co.", "lubricant", now);
        jdbc.update("INSERT INTO tenants(id, name_zh, name_en, business_type, created_at) VALUES (?,?,?,?,?)",
                "t-alpaca", "羊驼工艺品公司", "Alpaca Crafts Co.", "alpaca", now);

        String hash = passwordEncoder.encode(DEMO_PASSWORD);
        insertUser("U-ADMIN", "admin@workhub.demo", hash, "Demo Admin", "zh", now);
        insertUser("U-SALES-C", "sales@compressor.demo", hash, "Compressor Sales", "zh", now);
        insertUser("U-REVIEWER-C", "reviewer@compressor.demo", hash, "Compressor Reviewer", "zh", now);
        insertUser("U-MANAGER-C", "manager@compressor.demo", hash, "Compressor Manager", "zh", now);
        insertUser("U-SALES-L", "sales@lubricant.demo", hash, "Lubricant Sales", "zh", now);
        insertUser("U-SALES-A", "sales@alpaca.demo", hash, "Alpaca Sales", "zh", now);

        insertMembership("M-1", "U-ADMIN", "t-compressor", "ADMIN");
        insertMembership("M-2", "U-ADMIN", "t-lubricant", "ADMIN");
        insertMembership("M-3", "U-ADMIN", "t-alpaca", "ADMIN");
        insertMembership("M-4", "U-SALES-C", "t-compressor", "SALES");
        insertMembership("M-5", "U-REVIEWER-C", "t-compressor", "REVIEWER");
        insertMembership("M-6", "U-MANAGER-C", "t-compressor", "MANAGER");
        insertMembership("M-7", "U-SALES-L", "t-lubricant", "SALES");
        insertMembership("M-8", "U-SALES-A", "t-alpaca", "SALES");

        seedRules();
        seedTemplates();
        seedTenantData("t-compressor", now);
        seedTenantData("t-lubricant", now);
        seedTenantData("t-alpaca", now);
    }

    public void resetTenant(String tenantId) {
        jdbc.update("DELETE FROM case_notes WHERE tenant_id=?", tenantId);
        jdbc.update("DELETE FROM cases WHERE tenant_id=?", tenantId);
        jdbc.update("DELETE FROM products WHERE tenant_id=?", tenantId);
        jdbc.update("DELETE FROM reviews WHERE tenant_id=?", tenantId);
        jdbc.update("DELETE FROM audit_logs WHERE tenant_id=?", tenantId);
        seedRulesIfMissing(tenantId);
        seedTemplateIfMissing(tenantId);
        seedTenantData(tenantId, System.currentTimeMillis());
    }

    private void insertUser(String id, String email, String hash, String name, String locale, long now) {
        jdbc.update("INSERT INTO users(id, email, password_hash, display_name, locale, created_at) VALUES (?,?,?,?,?,?)",
                id, email, hash, name, locale, now);
    }

    private void insertMembership(String id, String userId, String tenantId, String role) {
        jdbc.update("INSERT INTO memberships(id, user_id, tenant_id, role) VALUES (?,?,?,?)",
                id, userId, tenantId, role);
    }

    private void seedRules() {
        seedRules("t-compressor", new String[][]{
                {"设备用途 / 使用工况", "Equipment purpose / operating conditions"},
                {"目标排气压力与排气量", "Required discharge pressure and flow"},
                {"电源及现场环境", "Electrical supply and installation conditions"},
                {"采购数量与预期时间", "Quantity and target purchase date"}
        });
        seedRules("t-lubricant", new String[][]{
                {"设备类型或使用用途", "Equipment type or usage"},
                {"要求的技术规格或粘度等级", "Technical specification / viscosity grade"},
                {"采购数量与包装规格", "Quantity and package size"},
                {"现用产品与更换原因", "Current product and reason for change"}
        });
        seedRules("t-alpaca", new String[][]{
                {"款式、颜色及尺寸", "Style, color and dimensions"},
                {"预计购买数量", "Quantity"},
                {"预算与用途", "Budget and intended use"},
                {"收货城市与时间要求", "Delivery city and required date"}
        });
    }

    private void seedRulesIfMissing(String tenantId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM requirement_rules WHERE tenant_id=?", Integer.class, tenantId);
        if (count == null || count == 0) {
            if ("t-compressor".equals(tenantId)) {
                seedRules("t-compressor", new String[][]{
                        {"设备用途 / 使用工况", "Equipment purpose / operating conditions"},
                        {"目标排气压力与排气量", "Required discharge pressure and flow"},
                        {"电源及现场环境", "Electrical supply and installation conditions"},
                        {"采购数量与预期时间", "Quantity and target purchase date"}
                });
            } else if ("t-lubricant".equals(tenantId)) {
                seedRules("t-lubricant", new String[][]{
                        {"设备类型或使用用途", "Equipment type or usage"},
                        {"要求的技术规格或粘度等级", "Technical specification / viscosity grade"},
                        {"采购数量与包装规格", "Quantity and package size"},
                        {"现用产品与更换原因", "Current product and reason for change"}
                });
            } else {
                seedRules("t-alpaca", new String[][]{
                        {"款式、颜色及尺寸", "Style, color and dimensions"},
                        {"预计购买数量", "Quantity"},
                        {"预算与用途", "Budget and intended use"},
                        {"收货城市与时间要求", "Delivery city and required date"}
                });
            }
        }
    }

    private void seedRules(String tenantId, String[][] rules) {
        for (int i = 0; i < rules.length; i++) {
            jdbc.update("INSERT INTO requirement_rules(id, tenant_id, sort_no, text_zh, text_en) VALUES (?,?,?,?,?)",
                    tenantId + "-RUL-" + (i + 1), tenantId, i + 1, rules[i][0], rules[i][1]);
        }
    }

    private void seedTemplates() {
        insertTemplate("t-compressor",
                "您好，感谢咨询空压机产品。为了准确推荐型号，想先确认设备使用用途、所需排气压力与排气量，以及现场供电和采购时间。收到这些信息后，我们会依据最新的产品资料核实方案与报价。",
                "Thank you for your interest in our air compressors. To recommend a suitable model, could you confirm the equipment application, required discharge pressure and air flow, power supply and estimated purchase date? We will verify available options and quotations against the latest approved product documents.",
                "补齐压力、排气量、用途等参数，再核实厂家资料与报价。",
                "Confirm pressure, flow and use case, then verify technical documents and quotation.");
        insertTemplate("t-lubricant",
                "您好，感谢咨询。请问产品主要用于哪类设备或工况？您需要的技术规格、采购数量和包装方式是什么？我们会先核对相应产品技术资料，再提供合适的产品信息。",
                "Thank you for your inquiry. Which equipment or operating conditions will the lubricant be used for? Please share the required technical specification, quantity and packaging preference. We will verify the relevant technical documentation before providing product details.",
                "补齐设备工况与技术规格，请产品负责人复核匹配结果。",
                "Confirm operating conditions and specs; have the product owner review the match.");
        insertTemplate("t-alpaca",
                "您好，感谢关注我们的羊驼工艺品。想请问您偏好的款式、颜色、尺寸和数量，以及收货城市？我们核实款式、库存与配送安排后再给您准确回复。",
                "Thank you for your interest in our alpaca crafts. Which style, color and size do you prefer, how many would you like, and what is the delivery city? We will check the available items and delivery arrangements before confirming details.",
                "确认款式、数量和收货城市，再核实库存与物流。",
                "Confirm style, quantity and delivery city, then check stock and shipping.");
    }

    private void seedTemplateIfMissing(String tenantId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM reply_templates WHERE tenant_id=?", Integer.class, tenantId);
        if (count == null || count == 0) {
            seedTemplates();
        }
    }

    private void insertTemplate(String tenantId, String replyZh, String replyEn, String nextZh, String nextEn) {
        jdbc.update("INSERT INTO reply_templates(tenant_id, reply_zh, reply_en, next_zh, next_en) VALUES (?,?,?,?,?)",
                tenantId, replyZh, replyEn, nextZh, nextEn);
    }

    private void seedTenantData(String tenantId, long now) {
        if ("t-compressor".equals(tenantId)) {
            seedCase("C-1024", tenantId, "海外设备采购商 A", "Overseas buyer A",
                    "空压机采购咨询", "Compressor inquiry",
                    "我们工厂需要空压机，要求 10bar，能帮忙推荐型号和报价吗？",
                    "Our factory needs an air compressor at 10 bar. Can you recommend a model and quote?",
                    "WhatsApp", "open", "high", "start", "U-SALES-C", now - 2 * HOUR);
            seedCase("C-1023", tenantId, "设备经销商 B", "Equipment distributor B",
                    "经销合作咨询", "Distribution inquiry",
                    "想了解你们的设备系列和经销合作方式。",
                    "We would like to understand your product ranges and dealer terms.",
                    "Email", "progress", "normal", "clarify", "U-SALES-C", now - 26 * HOUR);
            seedProduct("P-01", tenantId, "AC-DEMO-01",
                    "喷油螺杆式空压机（示意）", "Oil-injected screw compressor (sample)",
                    "仅展示产品知识归档方式，技术参数须以真实厂家资料为准。",
                    "Illustrates product records only. Verify technical specifications against manufacturer files.",
                    "Demo catalog", now - 30 * HOUR);
            seedProduct("P-02", tenantId, "AC-DEMO-02",
                    "空压机油气分离组件（示意）", "Air/oil separator assembly (sample)",
                    "示例部件，不对应真实零件号。", "Illustrative part, not linked to any real part number.",
                    "Demo diagram", now - 50 * HOUR);
        } else if ("t-lubricant".equals(tenantId)) {
            seedCase("C-2024", tenantId, "工厂采购方", "Factory purchasing team",
                    "润滑油规格咨询", "Lubricant specification inquiry",
                    "我们有设备维护需求，想了解适合的油品，需要准备哪些参数？",
                    "We need lubricant for equipment maintenance. Which specifications should we provide?",
                    "Email", "open", "normal", "start", "U-SALES-L", now - 5 * HOUR);
            seedProduct("P-03", tenantId, "LUB-DEMO-01",
                    "工业润滑油产品档案（示意）", "Industrial lubricant record (sample)",
                    "型号与规格待补充，不能用作选型依据。", "Model and specifications are placeholders, not a selection basis.",
                    "Demo catalog", now - 30 * HOUR);
        } else if ("t-alpaca".equals(tenantId)) {
            seedCase("C-3024", tenantId, "国内零售客户", "Domestic retail customer",
                    "羊驼工艺品礼物咨询", "Alpaca gift inquiry",
                    "想买一个送朋友，有哪些款式？多久能发货？",
                    "I want a gift for a friend. What styles are available and when can you ship?",
                    "Wechat", "open", "normal", "start", "U-SALES-A", now - 8 * HOUR);
            seedProduct("P-04", tenantId, "ALP-DEMO-01",
                    "羊驼手工摆件（示意）", "Handcrafted alpaca ornament (sample)",
                    "展示款式记录与客服答疑模板，库存需人工确认。", "Demonstrates catalog and customer reply. Stock must be checked.",
                    "Demo product list", now - 30 * HOUR);
        }
    }

    private void seedCase(String id, String tenantId, String customer, String customerEn,
                          String topic, String topicEn, String message, String messageEn,
                          String channel, String status, String priority, String stage,
                          String ownerId, long createdAt) {
        jdbc.update("INSERT INTO cases(id, tenant_id, customer, customer_en, topic, topic_en, message, message_en, " +
                        "channel, status, priority, stage, owner_id, created_at, updated_at) " +
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                id, tenantId, customer, customerEn, topic, topicEn, message, messageEn,
                channel, status, priority, stage, ownerId, createdAt, createdAt);
    }

    private void seedProduct(String id, String tenantId, String sku, String name, String nameEn,
                             String summary, String summaryEn, String source, long createdAt) {
        jdbc.update("INSERT INTO products(id, tenant_id, sku, name, name_en, summary, summary_en, source, " +
                        "review_status, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                id, tenantId, sku, name, nameEn, summary, summaryEn, source, "unreviewed", 1, createdAt, createdAt);
    }
}
