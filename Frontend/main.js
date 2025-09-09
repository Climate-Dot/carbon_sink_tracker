const map = L.map("map").setView([22.5, 72.5], 9); // Gujarat center

// Configurable API base URL: set window.API_BASE in production (e.g., Render)
const API_BASE = window.API_BASE || "http://localhost:8000";

// Add OSM base layer
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

L.control
  .scale({
    imperial: false, // set to true if you also want miles/feet
    metric: true, // show km/m
    position: "bottomright",
    maxWidth: 200, // adjust the length of the scale bar
  })
  .addTo(map);

const st = new Date().getTime();

function getColor(code) {
  const palette = {
    10: "#ffff64",
    11: "#ffff64",
    12: "#ffff00",
    20: "#ead082",
    51: "#4c7300",
    52: "#006400",
    61: "#474b32ff",
    62: "#00a000",
    71: "#005000",
    72: "#003c00",
    81: "#286400",
    82: "#285000",
    91: "#a0b432",
    92: "#788200",
    120: "#966400",
    121: "#964b00",
    122: "#966400",
    130: "#ffb432",
    140: "#ffdcd2",
    150: "#ffebaf",
    152: "#ffd278",
    153: "#ffebaf",
    181: "#00a884",
    182: "#73ffdf",
    183: "#9ebb3b",
    184: "#828282",
    185: "#f57ab6",
    186: "#66cdab",
    187: "#444f89",
    190: "#c31400",
    200: "#fff5d7",
    201: "#dcdcdc",
    202: "#fff5d7",
    210: "#0046c8",
    220: "#ffffff",
    0: "#ffffff",
  };
  return palette[code] || "#888888"; // fallback gray
}

async function populateDistrictCheckboxes() {
  const districtContainer = document.getElementById("district-checkboxes");

  try {
    const districtRes = await fetch(`${API_BASE}/districts`);
    const districts = await districtRes.json();

    // Clear previous content
    districtContainer.innerHTML = "";

    // Add checkboxes for each district
    districts.forEach((d) => {
      // Format district name: First letter uppercase, rest lowercase
      const formattedName =
        d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "district";
      checkbox.value = formattedName;
      checkbox.id = `district-${formattedName}`;

      const label = document.createElement("label");
      label.htmlFor = checkbox.id;
      label.textContent = formattedName;

      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.marginBottom = "5px"; // vertical spacing between rows
      wrapper.style.gap = "8px"; // horizontal spacing between checkbox and label
      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      districtContainer.appendChild(wrapper);
    });
  } catch (error) {
    alert("Failed to load districts: " + error);
  }
}

fetch(`${API_BASE}/metadata`)
  .then((res) => res.json())
  .then((data) => {
    const districtBoundary = data.district_boundary;
    const stateBoundary = data.state_boundary;
    const districtLayer = L.geoJSON(districtBoundary, {
      style: {
        color: "#414d55c4",
        weight: 2,
        fillOpacity: 0,
      },
    }).addTo(map);

    // Draw state boundary
    L.geoJSON(stateBoundary, {
      style: {
        color: "#111010ff",
        weight: 4,
        fillOpacity: 0,
      },
    }).addTo(map);

    // Zoom to district layer bounds
    map.fitBounds(districtLayer.getBounds());
    console.log("Map loaded in", (new Date().getTime() - st) / 1000, "seconds");
    loadLULC_State();
  })
  .catch((err) => console.error("Failed to load metadata:", err));

let lulcLayerState = null;
let villageLayer = null;
let legend = null;
let currentLayer = null;

// Fetch LULC separately
function loadLULC_State() {
  // Remove previous LULC if exists
  if (lulcLayerState) {
    map.removeLayer(lulcLayerState);
    lulcLayerState = null;
    console.log("✅ Existing LULC removed");
  }

  fetch(`${API_BASE}/lulc-preview`)
    .then((res) => res.json())
    .then((lulc2020) => {
      // Add LULC to map and assign to global variable
      lulcLayerState = L.geoJSON(lulc2020, {
        style: (feature) => ({
          color: getColor(feature.properties.lulc_type),
          weight: 0.5,
          fillOpacity: 0, // transparent fill for preview
        }),
      }).addTo(map);
      console.log("✅ State LULC loaded");
      console.log(
        "Map loaded in",
        (new Date().getTime() - st) / 1000,
        "seconds"
      );
    })
    .catch((err) => console.error("Failed to load LULC:", err));
}

function getSelectedDistricts() {
  const checkboxes = document.querySelectorAll(
    'input[name="district"]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

async function loadLULC() {
  const districts = getSelectedDistricts();
  const year = document.getElementById("yearSlider").value;
  const filterType = document.getElementById("lulcFilter").value;
  const submitBtn = document.getElementById("submitBtn");

  if (!districts || districts.length === 0 || !year) {
    alert("Please select at least one district and year.");
    return;
  }

  // Remove previous layers
  if (lulcLayerState) map.removeLayer(lulcLayerState);
  if (villageLayer) map.removeLayer(villageLayer);
  if (legend) map.removeControl(legend);

  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  try {
    // Fetch metadata once
    const metadataRes = await fetch(`${API_BASE}/metadata`);
    if (!metadataRes.ok) throw new Error("Failed to fetch metadata");
    const metadata = await metadataRes.json();

    // District ID mapping
    const districtNameToId = {};
    metadata.district_boundary.features.forEach((f) => {
      const name = f.properties.name?.toUpperCase();
      if (name) districtNameToId[name] = f.properties.id;
    });

    // Build query for selected districts
    const query = new URLSearchParams();
    districts.forEach((d) => {
      const id = districtNameToId[d.toUpperCase()];
      if (id) query.append("district_id", id);
    });
    query.append("year", year);

    const url = `${API_BASE}/lulc-geojson?${query.toString()}`;
    console.log("Fetching LULC data from:", url);

    const lulcRes = await fetch(url);
    if (!lulcRes.ok) throw new Error("Failed to fetch LULC data");
    const lulcData = await lulcRes.json();

    // Define LULC type groups
    const forestTypes = [
      51, 52, 61, 62, 71, 72, 81, 82, 91, 92, 181, 182, 183, 186,
    ];
    const wetlandTypes = [181, 182, 183, 186];

    // Filter LULC features
    const filteredFeatures = lulcData.features.filter((f) => {
      const t = Number(f.properties.type_id);
      if (filterType === "forest") return forestTypes.includes(t);
      if (filterType === "wetland") return wetlandTypes.includes(t);
      return true;
    });

    // Collect unique type_ids
    const uniqueIds = [
      ...new Set(lulcData.features.map((f) => Number(f.properties.type_id))),
    ];

    // Fetch type names mapping
    const typeRes = await fetch(
      `${API_BASE}/lulc-types?${uniqueIds
        .map((id) => `type_id=${id}`)
        .join("&")}`
    );
    if (!typeRes.ok) throw new Error("Failed to fetch LULC type names");
    const typeMapping = await typeRes.json(); // { "51": "Evergreen Forest", "181": "Wetland", ... }

    // Add LULC layer
    currentLayer = L.geoJSON(
      { type: "FeatureCollection", features: filteredFeatures },
      {
        style: (f) => ({
          color: "#333",
          weight: forestTypes.includes(Number(f.properties.type_id)) ? 0.5 : 0,
          fillColor: getColor(Number(f.properties.type_id)),
          fillOpacity: 0.6,
        }),
        onEachFeature: (f, layer) => {
          const typeId = Number(f.properties.type_id);
          const typeName = typeMapping[typeId] || "Unknown";
          layer.bindPopup(
            `<b>Type:</b> ${typeName}<br>
            <b>Area:</b> ${f.properties.area?.toFixed(2) || "N/A"} ha`
          );
        },
      }
    ).addTo(map);

    // Add village boundaries for selected districts
    // const selectedDistrictsUpper = districts.map(d => d.toUpperCase());
    // const filteredVillages = {
    //   type: "FeatureCollection",
    //   features: metadata.village_boundary.features.filter(f => {
    //     const districtName = f.properties?.DISTRICT?.toUpperCase() || f.properties?.District?.toUpperCase();
    //     return selectedDistrictsUpper.includes(districtName);
    //   })
    // };

    // villageLayer = L.geoJSON(filteredVillages, {
    //   style: {
    //     color: "#ddd5e8",
    //     weight: 2,
    //     fillOpacity: 0,
    //   },
    //   onEachFeature: (feature, layer) => {
    //     layer.bindPopup(
    //       `<b>Village:</b> ${feature.properties.VILLAGE || "N/A"}<br>
    //        <b>District:</b> ${feature.properties.DISTRICT || feature.properties.District || "N/A"}`
    //     );
    //   }
    // }).addTo(map);

    // Bring LULC on top
    currentLayer.bringToFront();

    // Fit map to LULC bounds
    if (filteredFeatures.length > 0) map.fitBounds(currentLayer.getBounds());

    // Build legend
    const uniqueTypes = {};
    filteredFeatures.forEach((f) => {
      const t = f.properties.type_id;
        // Skip unwanted types (71, 72, 81)
      if ([71, 72, 81, 82].includes(t)) return;
      if (!uniqueTypes[t]) uniqueTypes[t] = typeMapping[t] || "Unknown";
    });

    legend = L.control({ position: "bottomright" });
    legend.onAdd = function (map) {
      const div = L.DomUtil.create("div", "info legend");
      let html = `<h4>${
        filterType === "forest"
          ? "Forest & Wetland"
          : filterType === "wetland"
          ? "Wetlands"
          : "LULC Legend"
      }</h4>`;
      for (const [code, label] of Object.entries(uniqueTypes)) {
        html += `<i style="background:${getColor(
          Number(code)
        )}; width: 29px; height: 18px; display: inline-block; margin-right: 8px;"></i> ${label}<br>`;
      }
      div.innerHTML = html;
      return div;
    };
    legend.addTo(map);
  } catch (err) {
    console.error(err);
    alert("Failed to load LULC data: " + err.message);
  } finally {
    submitBtn.textContent = "Load";
    submitBtn.disabled = false;
  }
}

const yearSlider = document.getElementById("yearSlider");
const yearDisplay = document.getElementById("yearDisplay");

yearSlider.addEventListener("change", () => {
  yearDisplay.textContent = yearSlider.value;
  loadLULC();
});

function clearLULC() {
  // clear the year and reset the year slider to 2020
  const yearSlider = document.getElementById("yearSlider");
  const yearDisplay = document.getElementById("yearDisplay");
  yearSlider.value = 2020;
  yearDisplay.textContent = 2020;

  // Clear district checkboxes
  let checkboxes = document.querySelectorAll("input[name='district']");
  checkboxes.forEach((cb) => (cb.checked = false));

  // Remove current LULC layer if exists
  if (currentLayer) {
    map.removeLayer(currentLayer);
    currentLayer = null;
  }

  // Remove village layer if exists
  if (villageLayer) {
    map.removeLayer(villageLayer);
    villageLayer = null;
  }

  // Remove legend if exists
  if (legend) {
    map.removeControl(legend);
    legend = null;
  }

  console.log("Cleared year, districts, layers, and legend");
}

function downloadLULC() {
  if (!currentLayer) {
    alert("No LULC data to download. Please load the map first.");
    return;
  }

  // Extract features from current LULC layer
  const features = [];
  currentLayer.eachLayer((layer) => {
    if (layer.feature && layer.feature.properties) {
      const props = layer.feature.properties;
      features.push({
        district: props.district || props.DISTRICT || "N/A",
        lulc_type: props.type_name || "Unknown",
        area: props.area_ha ? props.area_ha.toFixed(2) : "N/A",
      });
    }
  });

  if (features.length === 0) {
    alert("No feature data found to export.");
    return;
  }

  // Convert to CSV
  const headers = ["District", "LULC Type", "Area (ha)"];
  const rows = features.map((f) => [f.district, f.lulc_type, f.area].join(","));
  const csvContent = [headers.join(","), ...rows].join("\n");

  // Create and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lulc_data.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Populate dropdowns when page loads
window.onload = () => {
  populateDistrictCheckboxes();
};
