# Structure Itinerary API Handoff

Frontend renderer expects one authenticated, canonical endpoint:

`GET /api/viaducts/{asset_id}/itinerary`

It must be assembled only from the canonical itinerary projections, not from
raw viaduct progress tables. The endpoint should return a single nested JSON
document, without screen coordinates or frontend-specific SVG geometry.

```json
{
  "structure": {
    "asset_id": 3002,
    "asset_code": "v02",
    "name": "viyaduk-02",
    "design": {
      "version": "VYD002-UYP-001-REV0-PROVISIONAL",
      "state": "PENDING_AUTHORITATIVE_APPROVAL",
      "provenance": "PROVISIONAL",
      "data_as_of": "2026-09-11"
    }
  },
  "supports": [{
    "id": "canonical-id",
    "code": "canonical-code",
    "type": "ABUTMENT|PIER|OTHER",
    "order": 1,
    "chainage": 0,
    "components": [{
      "id": "canonical-component-id",
      "type": "PILE_GROUP|FOUNDATION|ELEVATION_BODY|CAP|BEARING_BLOCK",
      "label": "optional canonical label",
      "design_order": 1,
      "design_presence": "DESIGN_PRESENT_NO_PROGRESS|DESIGN_NOT_PRESENT|DESIGN_PRESENT",
      "status": "UNKNOWN|NOT_STARTED|IN_PROGRESS|COMPLETED|BLOCKED|NOT_APPLICABLE",
      "status_reason": "optional canonical reason",
      "actual_start": null,
      "actual_finish": null,
      "last_activity": null,
      "progress": { "planned_count": null, "completed_count": null },
      "quality": { "level": "OK|WARNING|ERROR|UNVERIFIED", "code": "optional" }
    }]
  }],
  "spans": [{
    "id": "canonical-span-id",
    "code": "canonical-span-code",
    "order": 1,
    "from_support_id": "canonical-id",
    "to_support_id": "canonical-id",
    "components": [{ "type": "GIRDER_GROUP", "status": "UNKNOWN" }]
  }],
  "quality_summary": ["STAGE_DESIGN_UNVERIFIED"],
  "data_as_of": "2026-09-11"
}
```

`order` is mandatory and canonical. `PIER_STAGE` must not be emitted as a V1
design component: elevation-stage facts may instead appear only in quality or
provenance metadata. Girder production dates must not be converted into a
construction status.
