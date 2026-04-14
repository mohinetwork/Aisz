"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_THEME_ID = exports.THEME_IDS = exports.THEME_META = void 0;
exports.parseThemeId = parseThemeId;
exports.getThemeLabel = getThemeLabel;
exports.THEME_META = {
    violet_pulse: {
        label: "Violet Pulse",
        shortDescription: "Modern violet premium glow"
    },
    aurora_stripe: {
        label: "Aurora Stripe",
        shortDescription: "Pink aurora premium"
    },
    dark_black_white: {
        label: "Black & White",
        shortDescription: "Monochrome premium contrast"
    },
    neon_glass: {
        label: "Neon Glass",
        shortDescription: "Green premium glow"
    }
};
exports.THEME_IDS = Object.keys(exports.THEME_META);
exports.DEFAULT_THEME_ID = "violet_pulse";
function parseThemeId(value) {
    if (value === "orbit_hud") {
        return "violet_pulse";
    }
    if (value === "midnight_blue") {
        return "violet_pulse";
    }
    if (value === "terminal_pro") {
        return "dark_black_white";
    }
    return value in exports.THEME_META ? value : undefined;
}
function getThemeLabel(themeId) {
    return exports.THEME_META[themeId].label;
}
