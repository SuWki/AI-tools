package com.aiworkhub.common;

import java.util.UUID;

public final class Ids {

    private Ids() {
    }

    public static String shortId(String prefix) {
        String raw = Long.toString(System.currentTimeMillis(), 36).toUpperCase();
        String tail = raw.length() > 6 ? raw.substring(raw.length() - 6) : raw;
        return prefix + tail;
    }

    public static String uuid() {
        return UUID.randomUUID().toString();
    }
}
