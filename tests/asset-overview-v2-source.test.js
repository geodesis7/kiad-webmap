"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "webmap");
const source = fs.readFileSync(path.join(root, "js", "asset-overview.js"), "utf8");
const auth = fs.readFileSync(path.join(root, "js", "auth.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sourceSelection = source.slice(0, source.indexOf("const ASSET_OVERVIEW_LAYER_ID"));

function selectedLayer(hostname) {
    return vm.runInNewContext(
        `${sourceSelection}\nASSET_OVERVIEW_SOURCE_LAYER`,
        { window: { location: { hostname } } }
    );
}

test("production selects V2 and local development retains canonical source", () => {
    assert.equal(selectedLayer("kiad.tr"), "public.web_asset_overview_points_v2");
    assert.equal(selectedLayer("127.0.0.1"), "public.web_asset_overview_points");
    assert.equal(selectedLayer("localhost"), "public.web_asset_overview_points");
});

test("tile URL and MapLibre source-layer use the same selected source", () => {
    assert.match(source, /getVectorTileUrl\(ASSET_OVERVIEW_SOURCE_LAYER\)/);
    assert.match(source, /"source-layer": ASSET_OVERVIEW_SOURCE_LAYER/);
});

test("cache versions load the source switch", () => {
    assert.match(auth, /asset-overview\.js\?v=3/);
    assert.match(html, /auth\.js\?v=45/);
});
