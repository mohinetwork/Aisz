"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatUsd = formatUsd;
exports.formatPercent = formatPercent;
exports.trendColor = trendColor;
exports.escapeHtml = escapeHtml;
exports.formatUtcTimestamp = formatUtcTimestamp;
function formatUsd(value) {
    const abs = Math.abs(value);
    if (abs >= 1000) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }
    if (abs >= 1) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        }).format(value);
    }
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
    }).format(value);
}
function formatPercent(value) {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
}
function trendColor(value) {
    return value >= 0 ? "#1ee27a" : "#ff4d4f";
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function formatUtcTimestamp(iso) {
    const date = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC"
    }).format(date);
}
