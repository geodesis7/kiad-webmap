async function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 40.67, lng: 43.21 },
    zoom: 12,
  });

  const geojsonUrl =
    "https://raw.githubusercontent.com/geodesis7/kiad-webmap/main/data/geojson/kiad_major_km.geojson";

  try {
    const response = await fetch(geojsonUrl);
    const data = await response.json();

    map.data.addGeoJson(data);

    map.data.setStyle({
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 4,
        strokeColor: "#FF0000",
        fillColor: "#FF0000",
        fillOpacity: 1,
      },
    });

  } catch (error) {
    console.error("GeoJSON yüklenemedi:", error);
  }
}

