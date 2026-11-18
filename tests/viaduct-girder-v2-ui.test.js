"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "webmap", "js");
const context = vm.createContext({
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {} },
    toFiniteNumber: value => value == null || value === "" ? null : Number(value),
    console
});
vm.runInContext(fs.readFileSync(path.join(root, "structure-itinerary.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "viaduct-detail.js"), "utf8"), context);

test("Girder V2 overlays only exact span and stable component IDs", () => {
    const data = {
        spans: [
            { code: "A1-P1", components: [{ id: "V02:A1-P1:GIRDER_GROUP", type: "GIRDER_GROUP", status: "UNKNOWN" }] },
            { code: "P1-P2", components: [{ id: "V02:P1-P2:GIRDER_GROUP", type: "GIRDER_GROUP", status: "UNKNOWN" }] },
            { code: "P2-P3", components: [{ id: "V02:P2-P3:GIRDER_GROUP", type: "GIRDER_GROUP", status: "UNKNOWN" }] }
        ]
    };
    const rows = [
        { component_type: "GIRDER_GROUP", span_code: "A01-P01", stable_id: "V02:A1-P1:GIRDER_GROUP", canonical_status: "COMPLETED" },
        { component_type: "GIRDER_GROUP", span_code: "P1-P2", stable_id: "V02:P1-P2:GIRDER_GROUP", canonical_status: "COMPLETED", installed_count: 10 },
        { component_type: "GIRDER_GROUP", span_code: "P2-P3", stable_id: "different-id", canonical_status: "COMPLETED" }
    ];
    const result = vm.runInContext("mergeViaductGirderV2Itinerary", context)(data, rows);
    assert.equal(result.spans[0].components[0].status, "UNKNOWN");
    assert.equal(result.spans[0].components[0].girder_v2, undefined);
    assert.equal(result.spans[1].components[0].status, "COMPLETED");
    assert.equal(result.spans[1].components[0].completed_quantity, 10);
    assert.equal(result.spans[2].components[0].status, "UNKNOWN");
    assert.equal(data.spans[1].components[0].status, "UNKNOWN");
});

test("production and installation presentation remain separate", () => {
    const production = vm.runInContext("createViaductGirderProduction", context)([
        { production_code: "K-1", production_date: "2026-07-21", quantity: "1" }
    ]);
    assert.match(production, /K-1/);
    assert.match(production, /montaj konumlarıyla fiziksel olarak eşleştirilmez/);
    const installation = vm.runInContext("createViaductGirderInstallations", context)(
        [{ span_code: "P1-P2", girder_slot: 1, installation_status: "INSTALLED", installation_date: "2026-11-18" }],
        [{ span_code: "P1-P2", installed_count: 1, planned_count: 10, installation_progress_status: "COMPLETED" }]
    );
    assert.match(installation, /P1-P2/);
    assert.match(installation, /Monte edildi/);
    assert.doesNotMatch(installation, /K-1/);
});
