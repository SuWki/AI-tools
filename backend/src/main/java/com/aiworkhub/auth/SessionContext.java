package com.aiworkhub.auth;

public class SessionContext {

    private final String userId;
    private final String tenantId;
    private final String role;
    private final String email;
    private final String displayName;
    private final String locale;

    public SessionContext(String userId, String tenantId, String role, String email, String displayName, String locale) {
        this.userId = userId;
        this.tenantId = tenantId;
        this.role = role;
        this.email = email;
        this.displayName = displayName;
        this.locale = locale;
    }

    public String getUserId() {
        return userId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getRole() {
        return role;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getLocale() {
        return locale;
    }

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    public boolean canReviewKnowledge() {
        return "ADMIN".equals(role) || "REVIEWER".equals(role);
    }
}
