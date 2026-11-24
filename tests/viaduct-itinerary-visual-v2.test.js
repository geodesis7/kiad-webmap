"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {} },
    console
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "webmap", "js", "structure-itinerary.js"), "utf8"), context);
const run = expression => vm.runInContext(expression, context);
const setItinerary = data => { context.testItinerary = data; run("itineraryData = testItinerary"); };

test("V03-like canonical spans render 18 independent girder and deck components", () => {
    const supports = Array.from({ length: 19 }, (_, index) => ({
        id: `V03:S${index + 1}`, code: `A${index + 1}`, type: index === 0 || index === 18 ? "ABUTMENT" : "PIER",
        components: [{ id: `V03:S${index + 1}:PILE_GROUP`, type: "PILE_GROUP", status: "IN_PROGRESS", planned_quantity: index === 0 || index === 18 ? 15 : 36 }]
    }));
    const spans = Array.from({ length: 18 }, (_, index) => ({
        id: `V03:SPAN${index + 1}`, code: `A${index + 1}-A${index + 2}`,
        from_support_id: supports[index].id, to_support_id: supports[index + 1].id,
        components: [
            { id: `V03:SPAN${index + 1}:GIRDER_GROUP`, type: "GIRDER_GROUP", status: "UNKNOWN", planned_quantity: 10 },
            { id: `V03:SPAN${index + 1}:DECK_SLAB`, type: "DECK_SLAB", status: "NOT_STARTED" }
        ]
    }));
    setItinerary({ structure: { type: "VIADUCT", asset_code: "v03" }, supports, spans });
    const html = run("createItinerarySvg(itineraryData.supports, itineraryData.spans)");
    assert.equal((html.match(/class="itinerary-span"/g) ?? []).length, 18);
    assert.equal((html.match(/class="itinerary-support /g) ?? []).length, 19);
    assert.equal((html.match(/data-itinerary-component="V03:SPAN\d+:GIRDER_GROUP"/g) ?? []).length, 18);
    assert.equal((html.match(/data-itinerary-component="V03:SPAN\d+:DECK_SLAB"/g) ?? []).length, 18);
    assert.equal((html.match(/is-viaduct-girder-unknown/g) ?? []).length, 18);
    assert.match(html, /Prekast Kiriş Grubu/);
    assert.match(html, /is-status-not_started/);
    assert.match(html, /x="90" y="54" width="112" height="14"/);
    assert.equal(supports.reduce((sum, support) => sum + support.components[0].planned_quantity, 0), 642);
});

test("V02 girder detail shows installation count without deriving percent or using production", () => {
    setItinerary({ structure: { type: "VIADUCT", asset_code: "v02" }, supports: [], spans: [] });
    const detail = run("createComponentDetail({type:'GIRDER_GROUP', status:'IN_PROGRESS', planned_quantity:10, completed_quantity:4, girder_v2:true, production_count:9, progress_percent:90}, itineraryData)");
    assert.match(detail, /Planlanan kiriş/);
    assert.match(detail, /10 adet/);
    assert.match(detail, /Monte edilen kiriş/);
    assert.match(detail, /4 adet/);
    assert.doesNotMatch(detail, /Montaj ilerlemesi/);
    assert.doesNotMatch(detail, /90%/);
    const noInstallation = run("createComponentDetail({type:'GIRDER_GROUP', status:'UNKNOWN', planned_quantity:10, completed_quantity:9}, itineraryData)");
    assert.doesNotMatch(noInstallation, /Monte edilen kiriş/);
    const withCanonicalPercent = run("createComponentDetail({type:'GIRDER_GROUP', status:'IN_PROGRESS', planned_quantity:10, installed_count:4, installation_progress_percent:40}, itineraryData)");
    assert.match(withCanonicalPercent, /Montaj ilerlemesi/);
    assert.match(withCanonicalPercent, /40%/);
});

test("bridge schematic markup and UNKNOWN / NOT_STARTED contract stay unchanged", () => {
    setItinerary({ structure: { type: "BRIDGE", asset_code: "kp2a" }, supports: [], spans: [] });
    const bridge = run("createSpanSvg({id:'bridge-span', code:'A1-P1', components:[{id:'bridge-girder',type:'GIRDER_GROUP',status:'UNKNOWN'},{id:'bridge-deck',type:'DECK_SLAB',status:'NOT_STARTED'}]},0,[],new Map(),132,88)");
    assert.match(bridge, /class="itinerary-girder-beam is-status-unknown/);
    assert.match(bridge, /data-itinerary-component="bridge-deck"/);
    assert.doesNotMatch(bridge, /data-itinerary-component="bridge-girder"/);
    assert.doesNotMatch(bridge, /is-viaduct-girder-unknown/);
    assert.match(bridge, /Prekast Kiriş Grubu/);
});
