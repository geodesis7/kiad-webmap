async function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 40.90, lng: 40.50 },
    zoom: 10,
  });

  const geojsonUrl =
    "https://raw.githubusercontent.com/geodesis7/kiad-webmap/main/data/geojson/kiad_major_km.geojson";

  try {
    const response = await fetch(geojsonUrl);
    const data = await response.json();

    // GeoJSON'u ekle
    map.data.addGeoJson(data);

    // Nokta stilini ayarla
    map.data.setStyle((feature) => {
      const kmLabel = feature.getProperty("km"); // etiket için gerekli

      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 3,              // nokta boyutu
          fillColor: "#007aff",  // mavi
          fillOpacity: 1,
          strokeColor: "#0051a8",
          strokeWeight: 1,
        },
        label: {
          text: kmLabel,
          fontSize: "12px",
          color: "#1e1e1e",
        },
      };
    });

  } catch (error) {
    console.error("GeoJSON yüklenemedi:", error);
  }
}