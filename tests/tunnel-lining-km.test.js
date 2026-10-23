"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const popupSource = fs.readFileSync(path.join(__dirname, "../webmap/js/popup.js"), "utf8");
const detailSource = fs.readFileSync(path.join(__dirname, "../webmap/js/tunnel-detail.js"), "utf8");

function functionSource(source, name) {
    const pattern = new RegExp(`^function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, "m");
    const result = source.match(pattern);
    assert.ok(result, `${name} must remain available`);
    return result[0];
}

const code = [
    functionSource(popupSource, "formatLiningKilometer"),
    functionSource(detailSource, "formatTunnelLiningQuantity"),
    functionSource(detailSource, "formatTunnelCount"),
    functionSource(detailSource, "escapeTunnelDetailHtml"),
    functionSource(detailSource, "createTunnelLiningKmIntervals"),
    "({ formatLiningKilometer, formatTunnelLiningQuantity, createTunnelLiningKmIntervals })"
].join("\n");
const {
    formatLiningKilometer, formatTunnelLiningQuantity, createTunnelLiningKmIntervals
} = vm.runInNewContext(code);

test("canonical numeric source KM uses Turkish engineering notation", () => {
    assert.equal(formatLiningKilometer(66122), "66+122,00");
    assert.equal(formatLiningKilometer(66339.8), "66+339,80");
    assert.equal(formatLiningKilometer(null), null);
});

test("one API interval renders source KM, ano count and length", () => {
    const html = createTunnelLiningKmIntervals({
        status: "IN_PROGRESS",
        contiguous_interval_groups: [{
            interval_no: 1, source_km_start: 66122, source_km_end: 66339.8,
            ano_count: 18, constructed_length_m: 217.8
        }]
    });
    assert.match(html, /66\+122,00 → 66\+339,80/);
    assert.match(html, /18 ano · 217,8 m/);
    assert.equal((html.match(/<li>/g) ?? []).length, 1);
});

test("disjoint API interval fixture remains two separate rows", () => {
    const html = createTunnelLiningKmIntervals({
        status: "IN_PROGRESS",
        source_km_start: 66122,
        source_km_end: 66360,
        contiguous_interval_groups: [
            { interval_no: 1, source_km_start: 66122, source_km_end: 66339.8,
                ano_count: 18, constructed_length_m: 217.8 },
            { interval_no: 2, source_km_start: 66350, source_km_end: 66360,
                ano_count: 1, constructed_length_m: 10 }
        ]
    });
    assert.equal((html.match(/<li>/g) ?? []).length, 2);
    assert.match(html, /66\+122,00 → 66\+339,80/);
    assert.match(html, /66\+350,00 → 66\+360,00/);
    assert.doesNotMatch(html, /66\+122,00 → 66\+360,00/);
});

test("NO_DATA and missing intervals never invent KM", () => {
    assert.equal(formatTunnelLiningQuantity(null, "m"), "—");
    assert.match(createTunnelLiningKmIntervals({
        status: "NO_DATA", contiguous_interval_groups: []
    }), /Kayıtlı imalat bulunmuyor/);
    assert.match(createTunnelLiningKmIntervals({
        status: "IN_PROGRESS"
    }), /API'de henüz yayınlanmıyor/);
});
