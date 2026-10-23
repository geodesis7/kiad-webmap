# 05.1 handoff — tunnel lining source-KM intervals (fulfilled)

The authenticated `GET /api/tunnel-lining/{asset_id}` response now exposes
source kilometre intervals from `public.vw_tunnel_lining_intervals_v1` in Dev
(backend commit `786681f`). Source KM is independent of the approximate map
polygon; never derive it from geometry or the general alignment.

Contract per stage:

```json
{
  "portal_direction": "GIRIS",
  "lining_stage": "INVERT",
  "contiguous_interval_groups": [
    {
      "interval_no": 1,
      "source_km_start": 66122.0,
      "source_km_end": 66339.8,
      "constructed_length_m": 217.8,
      "concrete_volume_m3": null,
      "ano_count": 18,
      "first_work_date": null,
      "latest_work_date": null
    }
  ]
}
```

Values above illustrate the shape and must come from the current canonical
view, not fixtures or frontend constants. The API preserves numeric metres,
NULLs, and group order by `interval_no`. For `NO_DATA`, it returns an empty
array. Disjoint source ranges remain multiple objects, never one min/max span.
The backend uses a fixed number of queries rather than per-stage N+1 queries.

Frontend display renders each group separately and keeps a safe fallback if
the field is absent. Real Dev data confirms T01/GIRIS/INVERT has one interval,
66+122,00–66+339,80, 18 ano and 217,8 m. The frontend fixture test checks
split intervals and empty ARCH rows. The pg_tileserv map overlay remains
approximate even though these source KM values are canonical.
