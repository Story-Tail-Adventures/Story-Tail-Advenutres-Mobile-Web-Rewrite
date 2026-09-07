/**
 * Icon path data, copied verbatim from design/source-prototype/shared/icons.jsx
 * (24-unit viewBox, round caps and joins, default stroke 1.7).
 *
 * Only the glyphs the web app uses are ported. To add one, copy its `d` string from the
 * prototype file so the two sets never drift; do not draw new glyphs here.
 */
export declare const ICON_PATHS: {
    readonly search: "M11 4a7 7 0 1 1-4.95 11.95L3 19l3.05-3.05A7 7 0 0 1 11 4Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z";
    readonly user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.7-8 6v2h16v-2c0-3.3-3.6-6-8-6Z";
    readonly message: "M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z";
    readonly calendar: "M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z";
    readonly plane: "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22L12 21l3.5 1.5V20.5L13 19v-5.5L21 16Z";
    readonly ship: "M3 18s2 2 5 2 5-2 5-2 2 2 5 2 3-2 3-2l-2-6H5l-2 6Zm9-13v3m-5 4V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4";
    readonly palm: "M12 3c4 0 7 2 7 2s-4 0-6 2c3-1 5 1 5 1s-3-1-5 1c1-1 3-1 4-3-2 1-4 3-5 5l1 11h-2l1-11c-1-2-3-4-5-5 1 2 3 2 4 3-2-2-5-1-5-1s2-2 5-1c-2-2-6-2-6-2s3-2 7-2Z";
    readonly map: "M9 4v15M15 5v15M3 6l6-2 6 2 6-2v15l-6 2-6-2-6 2V6Z";
    readonly card: "M3 6h18v12H3zM3 10h18M7 15h3";
    readonly shield: "M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-3Z";
    readonly heart: "M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9Z";
    readonly star: "m12 3 2.6 5.5 6 .9-4.3 4.3 1 6L12 17l-5.4 2.7 1-6L3.3 9.4l6-.9L12 3Z";
    readonly check: "m5 12 5 5L20 6";
    readonly arrow_right: "M5 12h14m-5-6 6 6-6 6";
    readonly arrow_left: "M19 12H5m6-6-6 6 6 6";
    readonly chevron_right: "m9 6 6 6-6 6";
    readonly chevron_left: "m15 6-6 6 6 6";
    readonly chevron_down: "m6 9 6 6 6-6";
    readonly more: "M5 12h.01M12 12h.01M19 12h.01";
    readonly close: "M6 6l12 12M6 18 18 6";
    readonly filter: "M4 5h16M7 12h10m-7 7h4";
    readonly download: "M12 3v12m-5-5 5 5 5-5M5 21h14";
    readonly pin: "M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
    readonly clock: "M12 7v5l3 2m-3 7a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z";
    readonly sparkle: "m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 11 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z";
    readonly utensils: "M6 3v8a2 2 0 0 0 2 2h0v8m0-18v6M18 3c-2 1-3 4-3 6s1 3 3 3v9";
    readonly warning: "M12 4 2 20h20L12 4Zm0 6v4m0 3h.01";
    readonly info: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 8v6m0-9h.01";
    readonly menu: "M4 7h16M4 12h16M4 17h16";
    readonly users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 3c-4 0-7 2-7 5v2h14v-2c0-3-3-5-7-5Zm9 0c-1 0-2 .2-3 .5 1.5 1 2.5 2.5 2.5 4.5v2h5v-2c0-3-2-5-4.5-5Z";
    readonly question: "M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.4-1.5 2.4m0 4h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z";
    readonly external: "M14 4h6v6m0-6L10 14M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6";
    readonly phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z";
    readonly mail: "M3 7l9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z";
    readonly home: "M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z";
};
export type IconName = keyof typeof ICON_PATHS;
export declare const ICON_NAMES: IconName[];
