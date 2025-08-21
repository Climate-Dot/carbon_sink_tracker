const map = L.map("map").setView([22.5, 72.5], 8); // Gujarat center

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

fetch("http://localhost:8000/metadata")
  .then((res) => res.json())
  .then((data) => {
    const districtBoundary = data.district_boundary;
    const stateBoundary = data.state_boundary;
    console.log("working");
    // const lulcVector = data.lulc_vector;
    // const lulc = data.lulc;

    const districtLayer = L.geoJSON(districtBoundary, {
      style: {
        color: "#414d55c4",
        weight: 2,
        fillOpacity: 0,
      },
      // onEachFeature: function (feature, layer) {
      //   if (feature.properties && feature.properties.DISTRICT) {
      //     // Get centroid of the feature geometry
      //     var centroid = layer.getBounds().getCenter();
      //     var marker = L.marker(centroid).addTo(map);
      //     // Bind tooltip or popup with district name
      //     marker.bindPopup(feature.properties.DISTRICT);
      //     marker.openPopup();
      //   }
      // },
    }).addTo(map);

    // Draw state boundary
    L.geoJSON(stateBoundary, {
      pointToLayer: () => L.layerGroup([]),
      style: {
        color: "#111010ff",
        weight: 4,
        fillOpacity: 0,
      },
    }).addTo(map);

    // L.geoJSON(lulc, {
    //   pointToLayer: () => L.layerGroup([]),
    //   style: function (feature) {
    //     const lulctype = feature.properties.type_id; 
    //     return {
    //       color: getColor(lulctype), 
    //       weight: 2,
    //       fillOpacity: 0.6,
    //     };
    //   },
    // }).addTo(map);

    // Zoom to district layer bounds
    map.fitBounds(districtLayer.getBounds());

    console.log("Map loaded in", (new Date().getTime() - st) / 1000, "seconds");
  })
  .catch((err) => console.error("Failed to load metadata:", err));

let currentLayer = null;

// async function populateDropdowns() {
//   const districtSelect = document.getElementById('district');
//   const yearSelect = document.getElementById('year');

//   try {
//     const [districtRes, yearRes] = await Promise.all([
//       fetch('http://127.0.0.1:8000/districts'),
//       fetch('http://127.0.0.1:8000/years')
//     ]);

//     const districts = await districtRes.json();
//     const years = await yearRes.json();

//     districtSelect.innerHTML = '<option value="" disabled selected>Select District</option>';
//     yearSelect.innerHTML = '<option value="" disabled selected>Select Year</option>';

//     districts.forEach(d => {
//       const option = document.createElement('option');
//       option.value = d;
//       option.textContent = d;
//       districtSelect.appendChild(option);
//     });

//     years.forEach(y => {
//       const option = document.createElement('option');
//       option.value = y;
//       option.textContent = y;
//       yearSelect.appendChild(option);
//     });
//   } catch (error) {
//     alert("Failed to load dropdown values: " + error);
//   }
// }

async function populateDistrictCheckboxes() {
  const districtContainer = document.getElementById("district-checkboxes");

  try {
    const districtRes = await fetch("http://127.0.0.1:8000/districts");
    const districts = await districtRes.json();

    // Clear previous content
    districtContainer.innerHTML = "";

    // Add checkboxes for each district
    districts.forEach((d) => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "district";
      checkbox.value = d;
      checkbox.id = `district-${d}`;

      const label = document.createElement("label");
      label.htmlFor = checkbox.id;
      label.textContent = d;

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

let legend = null; // global legend control reference
let villageLayer = null;

function getSelectedDistricts() {
  const checkboxes = document.querySelectorAll(
    'input[name="district"]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

async function loadLULC() {
  // const district = document.getElementById("district").value;
  // const year = document.getElementById("year").value;
  const districts = getSelectedDistricts();
  const year = document.getElementById("yearSlider").value;
  const filterType = document.getElementById("lulcFilter").value;
  const submitBtn = document.getElementById("submitBtn");

  if (!districts || !year) {
    alert("Please select both district and year.");
    return;
  }

  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  // const url = `http://127.0.0.1:8000/lulc-geojson?district=${district}&year=${year}`;

  // Build query string for multiple districts
  const query = new URLSearchParams();
  districts.forEach((d) => query.append("district", d));
  query.append("year", year);

  const url = `http://127.0.0.1:8000/lulc-geojson?${query.toString()}`;
  console.log(url);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (currentLayer) {
      map.removeLayer(currentLayer);
    }

    if (villageLayer) {
      map.removeLayer(villageLayer); // remove previous villages
    }

    const filteredFeatures = data.features.filter((feature) => {
      const type = Number(feature.properties.type_id);

      if (filterType === "forest") {
        return (
          type === 51 ||
          type === 52 || // Reserved and Protected Forest
          type === 61 ||
          type === 62 || // Forest Plantation
          type === 71 ||
          type === 72 || // Dense Forest
          type === 81 ||
          type === 82 || // Open Forest
          type === 91 ||
          type === 92 || // Scrub Forest
          type === 181 ||
          type === 182 ||
          type === 183 ||
          type === 186
        );
      } else if (filterType === "wetland") {
        return type === 181 || type === 182 || type === 183 || type === 186;
      }
      return true; // default is all
    });

    currentLayer = L.geoJSON(
      { type: "FeatureCollection", features: filteredFeatures },
      {
        style: (feature) => {
          const lulc_type = Number(feature.properties.type_id);
          let borderWeight = 0;
          const forestTypes = [
            51, 52, 61, 62, 71, 72, 81, 82, 91, 92, 181, 182, 183, 186,
          ]; // Forest and wetlands types
          const wetlandTypes = [181, 182, 183, 186]; // Wetland types
          if (
            forestTypes.includes(lulc_type) ||
            wetlandTypes.includes(lulc_type)
          ) {
            borderWeight = 0.5; // Thicker border
          }
          return {
            color: "#333",
            weight: borderWeight,
            fillColor: getColor(lulc_type),
            fillOpacity: 0.8,
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties;
          layer.bindPopup(
            `<b>Type:</b> ${props.type_name}<br><b>Area:</b> ${
              props.area_ha?.toFixed(2) || "N/A"
            } ha`
          );
          // layer.on({
          //   mouseover: function (e) {
          //     const hoveredLayer = e.target;
          //     hoveredLayer.setStyle({
          //       weight: 1,
          //       color: '#ffcc00',   // golden glow
          //       fillOpacity: 1.0
          //     });

          //     // Bring to front for visibility
          //     if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          //       hoveredLayer.bringToFront();
          //     }
          //   },
          //   mouseout: function (e) {
          //     currentLayer.resetStyle(e.target); // resets to original style
          //   }
          // });
        },
      }
    ).addTo(map);

    // Add village boundaries after LULC is drawn
    const metadataRes = await fetch("http://localhost:8000/metadata");
    const metadata = await metadataRes.json();
    const villageBoundary = metadata.village_boundary;

    villageLayer = L.geoJSON(villageBoundary, {
      style: {
        color: "#ddd5e8ff",
        weight: 1,
        fillOpacity: 0,
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.VILLAGE) {
          layer.bindPopup(`<b>Village:</b> ${feature.properties.VILLAGE}`);
        }
      },
    }).addTo(map);

    map.fitBounds(currentLayer.getBounds());

    // Build legend dynamically
    const uniqueTypes = {};
    filteredFeatures.forEach((f) => {
      const t = f.properties.type_id;
      const name = f.properties.type_name;
      if (!uniqueTypes[t]) {
        uniqueTypes[t] = {
          label: name,
        };
      }
    });

    // Remove old legend if it exists
    if (legend) {
      map.removeControl(legend);
    }

    legend = L.control({ position: "bottomright" });
    legend.onAdd = function (map) {
      const div = L.DomUtil.create("div", "info legend");

      const filterLabel = {
        all: "LULC Legend",
        forest: "Carbon Sink: Forest and Wetland",
        wetland: "Wetland Types",
      };
      const filterType = document.getElementById("lulcFilter").value;
      let html = `<h4>${filterLabel[filterType] || "LULC Legend"}</h4>`;

      for (const [code, info] of Object.entries(uniqueTypes)) {
        if (
          info.label === "Closed evergreen needle-leaved forest" ||
          info.label === "Open evergreen needle-leaved forest" ||
          info.label === "Open deciduous needle-leaved forest"
        ) {
          continue;
        }
        html += `
          <i style="background:${getColor(
            Number(code)
          )}; width: 29px; height: 18px; display: inline-block; margin-right: 8px;"></i>
          ${info.label} <br>`;
      }
      div.innerHTML = html;
      return div;
    };
    legend.addTo(map);
  } catch (err) {
    alert("Failed to load LULC data: " + err);
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

// Populate dropdowns when page loads
window.onload = () => {
  populateDistrictCheckboxes();
};
