"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {} }
});
for (const script of ["tunnel-forecast", "tunnel-detail", "dashboard"]) {
    const file = path.join(__dirname, "..", "webmap", "js", `${script}.js`);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const renderers = [context.createTunnelForecastView, context.createDashboardForecastRow];

const verified = {
    asset_id: 1011, asset_code: "emt04", asset_name: "EMT04", tunnel_category: "EMERGENCY",
    forecast_group: "SAFETY_ESCAPE", design_length_m: 1000, completed_excavation_m: 786.74,
    remaining_excavation_m: 213.26, mapped_face_count: 2, active_face_count: 2,
    v30: 3.5, v60: 3, v90: 2.5, projected_rate: 3.25, estimated_days: 66,
    estimated_finish_date: "2027-01-30", trend: "ACCELERATING", confidence: "HIGH",
    forecast_state: "AVAILABLE", quality_flags: [], data_as_of: "2026-11-24",
    source_synced_at: "2026-11-25T08:00:00+03:00", calculation_version: "tunnel_forecast_v1"
};
const current = {
    ...verified, last_verified_forecast: verified, last_verified_snapshot_id: "verified-snapshot",
    last_verified_source_sha256: "a".repeat(64), last_verified_source_synced_at: verified.source_synced_at,
    last_verified_certified_at: "2026-11-25T09:00:00+03:00", candidate_run_id: 42,
    candidate_source_sha256: "a".repeat(64), candidate_snapshot_id: "verified-snapshot",
    candidate_status: "VERIFIED", freshness_status: "CURRENT", block_reason: null
};
const stale = {
    ...current, completed_excavation_m: null, remaining_excavation_m: null,
    active_face_count: 0, v30: null, v60: null, v90: null, projected_rate: null,
    estimated_days: null, estimated_finish_date: null, trend: null, confidence: null,
    forecast_state: "INVALID_PROGRESS_HISTORY", data_as_of: "2026-11-26",
    source_synced_at: "2026-11-26T08:00:00+03:00", candidate_run_id: 43,
    candidate_source_sha256: "b".repeat(64), candidate_snapshot_id: null,
    candidate_status: "PENDING", freshness_status: "STALE"
};
const blocked = {
    ...stale, candidate_status: "BLOCKED", candidate_snapshot_id: "blocked-snapshot",
    block_reason: {
        code: "INVALID_STAGING_VALUE",
        errors: [{ sheet: "EMT04", row: 42, field: "top_end_km", raw_value: "<abc>", reason: "INVALID_KM" }]
    }
};
const withoutVerified = {
    ...blocked, last_verified_forecast: null, last_verified_snapshot_id: null,
    last_verified_source_sha256: null, last_verified_source_synced_at: null,
    last_verified_certified_at: null, freshness_status: "UNAVAILABLE"
};

function assertForecastValues(html) {
    assert.match(html, /30(?: Ocak |\.01\.)2027/u);
    assert.match(html, /3,5 m\/gün/u);
    assert.match(html, /3,25 m\/gün/u);
    assert.match(html, /Yüksek/u);
}

test("CURRENT / AVAILABLE renders API forecast metrics in both surfaces", () => {
    for (const render of renderers) {
        const html = render(current);
        assertForecastValues(html);
        assert.doesNotMatch(html, /tarihsel|doğrulama bekliyor/u);
    }
    assert.match(renderers[1](current), /213,26 m/u);
});

test("STALE uses the saved projection and its source date in both surfaces", () => {
    for (const render of renderers) {
        const html = render(stale);
        assertForecastValues(html);
        assert.match(html, /Güncel kaynak doğrulama bekliyor.*Son doğrulanmış tarihsel tahmin · Kaynak tarihi 25\.11\.2026/u);
        assert.doesNotMatch(html, /26(?: Kasım |\.11\.)2026/u);
        assert.match(render({ ...stale, candidate_status: "NO_CANDIDATE", candidate_run_id: null,
            candidate_source_sha256: null }), /Tahmin güncel değil/u);
    }
});

test("same-source PENDING still labels the returned values historical", () => {
    const response = { ...current, candidate_status: "PENDING", candidate_run_id: 43,
        candidate_snapshot_id: null, freshness_status: "STALE" };
    for (const render of renderers) {
        const html = render(response);
        assertForecastValues(html);
        assert.match(html, /doğrulama bekliyor.*tarihsel/u);
    }
});

test("BLOCKED / STALE shows the reason and only the historical projection", () => {
    for (const render of renderers) {
        const html = render(blocked);
        assert.match(html, /Güncel tahmin oluşturulamadı.*geçersiz değer.*tarihsel tahmin/u);
        assert.match(html, /INVALID_STAGING_VALUE.*Satır 42.*&lt;abc&gt;.*INVALID_KM/u);
        assertForecastValues(html);
    }
});

test("BLOCKED / UNAVAILABLE shows no dates or progress without a verified result", () => {
    for (const render of renderers) {
        const html = render(withoutVerified);
        assert.match(html, /Güncel tahmin oluşturulamadı.*Doğrulanmış tahmin bulunmuyor/u);
        assert.doesNotMatch(html, /2026|2027|m\/gün|tarihsel tahmin/u);
    }
});

test("null progress renders empty while actual zero stays zero", () => {
    const forecast = { ...verified, completed_excavation_m: null, remaining_excavation_m: null };
    const response = { ...current, ...forecast, last_verified_forecast: forecast };
    for (const render of renderers) {
        assert.doesNotMatch(render(response), />0 m</u);
    }
    assert.match(renderers[1](response), /<td>—<\/td>/u);
    assert.equal(context.formatTunnelForecastMeters(0), "0 m");
    assert.equal(context.formatTunnelForecastMeters(null), "—");
});

test("LOW confidence remains a confidence label in both surfaces", () => {
    const forecast = { ...verified, confidence: "LOW" };
    for (const render of renderers) {
        const html = render({ ...current, ...forecast, last_verified_forecast: forecast });
        assert.match(html, /Düşük/u);
        assert.doesNotMatch(html, /doğrula|oluşturulamadı/u);
    }
});

test("legacy projections and other tunnels retain their rendering", () => {
    const unavailable = { ...stale, forecast_state: "INSUFFICIENT_HISTORY" };
    for (const render of renderers) {
        assert.equal(render(verified), render(current));
        assert.equal(render(verified), render({ ...verified, freshness_status: null, candidate_status: null }));
        assert.match(render({ ...unavailable, freshness_status: undefined }), /Yeterli geçmiş veri yok/u);
        const other = { ...verified, asset_id: 1012, asset_code: "emt05" };
        assert.equal(render(other), render({ ...blocked, ...other }));
    }
});

test("dashboard portfolio renders the lifecycle row from the API envelope", () => {
    const result = { status: "ready", data: { count: 1, items: [blocked] } };
    const items = context.getDashboardForecastItems(result);
    const html = context.createDashboardForecastPortfolio(items, result);
    assert.match(html, /Emniyet \/ Kaçış Tünelleri/u);
    assert.match(html, /data-dashboard-tunnel-id="1011"/u);
    assert.match(html, /Güncel tahmin oluşturulamadı.*tarihsel tahmin/u);
});
