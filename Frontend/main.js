
// Initialize Leaflet map centered on Gujarat
const map = L.map("map").setView([22.5, 72.5], 9); // Gujarat center

// Configurable API base URL: set window.API_BASE in production (e.g., Render)
const API_BASE = window.API_BASE || "http://localhost:8000";

// Add light basemap tiles (Carto Light)
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

// Add a metric-only scale control
L.control
  .scale({
    imperial: false, // set to true if you also want miles/feet
    metric: true, // show km/m
    position: "bottomright",
    maxWidth: 200, // adjust the length of the scale bar
  })
  .addTo(map);

// Start time to log load durations
const st = new Date().getTime();

function getColor(code) {
  // Handle undefined or null codes
  if (code === undefined || code === null || isNaN(code)) {
    return "#cccccc"; // Default gray color
  }
  
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

/**
 * Fetch district list and render them as checkboxes in the sidebar.
 */
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
      checkbox.classList.add('district-checkbox'); // ADDED

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
    
    // Add event listeners to district checkboxes
    addDistrictCheckboxListeners();
    
    // Immediately update the dropdown button label
    updateDistrictDropdownBtnLabel();
    
    // Refresh district charts after districts are loaded and default selections are made
    refreshDistrictCharts();
    initDistrictDropdownMultiselect();
  } catch (error) {
    alert("Failed to load districts: " + error);
  }
}

// Helper to update the dropdown button label based on selected checkboxes
function updateDistrictDropdownBtnLabel() {
  const dropdownBtn = document.getElementById('districtDropdownBtn');
  const checkboxContainer = document.getElementById('district-checkboxes');
  const checked = checkboxContainer ? checkboxContainer.querySelectorAll('input:checked') : [];
  let names = Array.from(checked).map(cb => cb.value);
  if (dropdownBtn) {
    if (names.length === 0) {
      dropdownBtn.textContent = 'Select district(s)';
      dropdownBtn.classList.remove('selected');
    } else if (names.length <= 2) {
      dropdownBtn.textContent = 'District(s): ' + names.join(', ');
      dropdownBtn.classList.add('selected');
    } else {
      dropdownBtn.textContent = names.length + ' districts selected';
      dropdownBtn.classList.add('selected');
    }
  }
}

function initDistrictDropdownMultiselect() {
  const dropdownBtn = document.getElementById('districtDropdownBtn');
  const dropdown = document.getElementById('districtDropdown');
  const checkboxContainer = document.getElementById('district-checkboxes');
  if (!dropdownBtn || !dropdown) return;

  // Unbind previous events to avoid duplicate listeners
  dropdownBtn.onclick = null;
  if (checkboxContainer) checkboxContainer.onchange = null;

  // Toggle dropdown
  dropdownBtn.onclick = function(e) {
    dropdown.style.display = (dropdown.style.display === 'block') ? 'none' : 'block';
    e.stopPropagation();
  };

  // Label update on change by delegation
  if (checkboxContainer) {
    checkboxContainer.onchange = updateDistrictDropdownBtnLabel;
  }

  // Click outside to close
  document.addEventListener('click', function clickOutsideDropdown(e) {
    if (!dropdown.contains(e.target) && e.target !== dropdownBtn) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', clickOutsideDropdown);
    }
  });

  updateDistrictDropdownBtnLabel();
}

function addDistrictCheckboxListeners() {
  // Add change event listeners to all district checkboxes
  const checkboxes = document.querySelectorAll('input[name="district"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', refreshDistrictCharts);
  });
}

// Fetch state/district boundaries (drawn once on load)
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
  })
  .catch((err) => console.error("Failed to load metadata:", err));

// Layer/state handles used across interactions
let villageLayer = null;     // Placeholder for village boundaries (optional)
let legend = null;           // Dynamic legend control
let currentLayer = null;     // Current district-filtered LULC layer
let loadedLulcLayers = [];   // Array to track all loaded LULC layers
let drawnItems = new L.FeatureGroup(); // Holds user-drawn shapes
map.addLayer(drawnItems);

// Animation variables
let animationInterval = null;
let isPlaying = false;
let currentAnimationYear = 2022;

// Add Leaflet.draw controls (polygon only)
const drawControl = new L.Control.Draw({
  draw: {
    polygon: {
      allowIntersection: false,
      showArea: true,
      drawError: { color: '#e1e100', message: '<strong>Error:</strong> polygons cannot intersect!' },
      shapeOptions: { color: '#3f51b5', weight: 2, fillOpacity: 0.1 }
    },
    rectangle: false,
    polyline: false,
    circle: false,
    marker: false,
    circlemarker: false
  },
  edit: { featureGroup: drawnItems, edit: true, remove: true }
});
map.addControl(drawControl);

// Handle polygon creation event
map.on(L.Draw.Event.CREATED, async (e) => {
  const layer = e.layer;
  drawnItems.addLayer(layer);
  
  // Show loading indicator
  layer.bindPopup('Loading LULC data...').openPopup();
  
  try {
    const geom = layer.toGeoJSON().geometry;
    const year = document.getElementById('yearSlider').value;

    // Query backend for LULC intersecting the drawn polygon
    const res = await fetch(`${API_BASE}/lulc-by-polygon?year=${encodeURIComponent(year)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geom)
    });
    if (!res.ok) throw new Error(`Backend error ${res.status}`);
    const geojson = await res.json();

    // Close loading popup
    layer.closePopup();

    if (!geojson.features || geojson.features.length === 0) {
      layer.bindPopup('No LULC data found in this area').openPopup();
      return;
    }

    // Get LULC type names for popup information
    const uniqueIds = [...new Set(geojson.features.map((f) => Number(f.properties.type_id)))];
    let typeMapping = {};
    
    try {
      const typeRes = await fetch(`${API_BASE}/lulc-types?${uniqueIds.map((id) => `type_id=${id}`).join("&")}`);
      if (typeRes.ok) {
        typeMapping = await typeRes.json();
      }
    } catch (typeErr) {
      console.warn('Failed to fetch LULC type names:', typeErr);
    }

    // Render the results with styling and popups
    const layerResult = L.geoJSON(geojson, {
      style: (f) => ({
        color: '#333',
        weight: 0,
        fillColor: getColor(Number(f.properties.type_id)),
        fillOpacity: 0.6,
      }),
      onEachFeature: (feature, layerPopup) => {
        const typeId = Number(feature.properties.type_id);
        const typeName = typeMapping[typeId] || `LULC Type ${typeId}`;
        const area = feature.properties.area ? feature.properties.area.toFixed(2) : 'N/A';
        
        layerPopup.bindPopup(
          `<b>${typeName}</b><br>
           <b>Type ID:</b> ${typeId}<br>
           <b>Area:</b> ${area} ha`
        );
      }
    }).addTo(map);
    
    loadedLulcLayers.push(layerResult);
    
    // Update drawn polygon popup with summary
    const totalFeatures = geojson.features.length;
    const summary = totalFeatures === 1 
      ? `Found ${totalFeatures} LULC polygon`
      : `Found ${totalFeatures} LULC polygons`;
    
    layer.bindPopup(`<b>Drawn Polygon</b><br>${summary}<br><b>Year:</b> ${year}`).closePopup();
    
    // Fit bounds to show both drawn polygon and LULC results
    const bounds = L.latLngBounds()
      .extend(layer.getBounds())
      .extend(layerResult.getBounds());
    map.fitBounds(bounds);
    
  } catch (err) {
    console.error('Polygon query failed:', err);
    layer.closePopup();
    layer.bindPopup(`Error: Failed to load LULC data`).openPopup();
  }
});
let availableYears = [];     // Populated from backend /years


/**
 * Return the list of selected district names from the checkbox group.
 */
function getSelectedDistricts() {
  const checkboxes = document.querySelectorAll(
    'input[name="district"]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

/**
 * Load LULC polygons for selected districts and year, optionally filtered
 * by category (forest/wetland/all). Builds legend and popups.
 */
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
  if (villageLayer) map.removeLayer(villageLayer);
  if (legend) map.removeControl(legend);
  
  // Remove all previously loaded LULC layers
  loadedLulcLayers.forEach(layer => {
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  loadedLulcLayers = []; // Clear the tracking array

  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  try {
    // Fetch metadata once
    const metadataRes = await fetch(`${API_BASE}/metadata`);
    if (!metadataRes.ok) throw new Error("Failed to fetch metadata");
    const metadata = await metadataRes.json();

    // District ID mapping (name → id) and reverse (id → readable name)
    const districtNameToId = {};
    const districtIdToName = {};
    metadata.district_boundary.features.forEach((f) => {
      const name = f.properties.name?.toUpperCase();
      if (name) districtNameToId[name] = f.properties.id;
      if (f.properties.id != null) districtIdToName[f.properties.id] = f.properties.name;
    });

    // Build query for selected districts
    const query = new URLSearchParams();
    districts.forEach((d) => {
      const id = districtNameToId[d.toUpperCase()];
      if (id) query.append("district_id", id);
    });
    query.append("year", year);

    const url = `${API_BASE}/lulc-geojson?${query.toString()}`;

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

    // Collect unique type_ids to fetch human-readable names once
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

    // Augment features with readable fields for UI/CSV
    const augmentedFeatures = filteredFeatures.map((f) => {
      const typeIdNum = Number(f.properties.type_id);
      return {
        ...f,
        properties: {
          ...f.properties,
          type_name: typeMapping[typeIdNum] || "Unknown",
          district: districtIdToName[f.properties.district_id] || "N/A",
          area_ha: typeof f.properties.area === "number" ? f.properties.area : Number(f.properties.area) || null,
        },
      };
    });

    // Add LULC layer for filtered features
    currentLayer = L.geoJSON(
      { type: "FeatureCollection", features: augmentedFeatures },
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
    
    // Add to tracking array
    loadedLulcLayers.push(currentLayer);

    // Bring LULC on top
    currentLayer.bringToFront();

    // Fit map to LULC bounds
    if (filteredFeatures.length > 0) map.fitBounds(currentLayer.getBounds());

    // Build legend based on visible types
    const uniqueTypes = {};
    augmentedFeatures.forEach((f) => {
      const t = Number(f.properties.type_id);
      // Skip unwanted types
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

// Year controls
const yearSlider = document.getElementById("yearSlider");
const yearDisplay = document.getElementById("yearDisplay");

yearSlider.addEventListener("change", () => {
  yearDisplay.textContent = yearSlider.value;
  // Removed auto-loading - user must click Load button to load LULC data
});

/**
 * Reset UI selections and remove layers/legend from the map.
 */
function clearLULC() {
  // Reset year slider to earliest available (fallback 2020)
  const yearSlider = document.getElementById("yearSlider");
  const yearDisplay = document.getElementById("yearDisplay");
  const defaultYear = availableYears.length > 0 ? availableYears[0] : 2020;
  yearSlider.value = defaultYear;
  yearDisplay.textContent = defaultYear;

  // Clear district checkboxes
  let checkboxes = document.querySelectorAll("input[name='district']");
  checkboxes.forEach((cb) => (cb.checked = false));

  // Remove all loaded LULC layers
  loadedLulcLayers.forEach(layer => {
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  loadedLulcLayers = []; // Clear the tracking array
  currentLayer = null; // Reset current layer reference

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

  // Clear district charts
  if (districtForestChartInstance) {
    districtForestChartInstance.destroy();
    districtForestChartInstance = null;
  }
  if (districtWetlandChartInstance) {
    districtWetlandChartInstance.destroy();
    districtWetlandChartInstance = null;
  }
  if (districtCombinationChartInstance) {
    districtCombinationChartInstance.destroy();
    districtCombinationChartInstance = null;
  }

}

/**
 * Download currently displayed LULC features as a CSV file.
 */
function downloadLULC() {
  if (!currentLayer && loadedLulcLayers.length === 0) {
    alert("No LULC data to download. Please load the map or draw a polygon first.");
    return;
  }

  // Extract features from current LULC layer
  const features = [];
  const collect = (layerGroup) => {
    layerGroup.eachLayer((layer) => {
      if (layer.feature && layer.feature.properties) {
        const props = layer.feature.properties;
        features.push({
          district: props.district || props.DISTRICT || "N/A",
          lulc_type: props.type_name || String(props.type_id) || "Unknown",
          area: props.area_ha ? props.area_ha.toFixed(2) : (props.area ? String(props.area) : "N/A"),
        });
      }
    });
  };
  if (currentLayer) collect(currentLayer);
  loadedLulcLayers.forEach((lyr) => collect(lyr));

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

// Right Panel Variables
let rightPanel = null;
let chartIcon = null;
let stateForestChartInstance = null;
let stateWetlandChartInstance = null;
let stateCombinationChartInstance = null;
let districtForestChartInstance = null;
let districtWetlandChartInstance = null;
let districtCombinationChartInstance = null;
let currentSection = 1; // 1 = State, 2 = District
let stateData = null; // Store loaded state data
let districtData = null; // Store loaded district data

// Right Panel Functions
function initializeRightPanel() {
  rightPanel = document.getElementById('right-panel');
  chartIcon = document.getElementById('chart-icon');
  
  // Chart icon click handler
  chartIcon.addEventListener('click', toggleRightPanel);
  
  // Close button handler
  document.getElementById('close-panel').addEventListener('click', closeRightPanel);
  
  // Section toggle handlers (State/District)
  document.querySelectorAll('.graph-toggle').forEach(button => {
    button.addEventListener('click', (e) => {
      const sectionNumber = parseInt(e.target.dataset.graph);
      switchSection(sectionNumber);
    });
  });
  
// State graph toggle handlers (Forest/Wetland/Total)
document.querySelectorAll('.state-graph-toggle').forEach(button => {
  button.addEventListener('click', (e) => {
    const graphType = e.target.dataset.stateGraph;
    switchStateGraph(graphType);
  });
});

// District graph toggle handlers (Forest/Wetland/Total)
document.querySelectorAll('.district-graph-toggle').forEach(button => {
  button.addEventListener('click', (e) => {
    const graphType = e.target.dataset.districtGraph;
    switchDistrictGraph(graphType);
  });
});
  
  // Initialize all charts
  createAllCharts();
}

function toggleRightPanel() {
  if (rightPanel.classList.contains('open')) {
    closeRightPanel();
  } else {
    openRightPanel();
  }
}

function openRightPanel() {
  rightPanel.classList.add('open');
  chartIcon.classList.add('panel-open');
  document.getElementById('map').classList.add('panel-open');
  // Change icon to satellite when panel is open
  chartIcon.textContent = '🛰️';
  
  // Auto-select Ahmedabad and Amreli when panel opens
  const ahmedabadCheckbox = document.getElementById('district-Ahmadabad');
  const amreliCheckbox = document.getElementById('district-Amreli');
  
  if (ahmedabadCheckbox) {
    ahmedabadCheckbox.checked = true;
  }
  if (amreliCheckbox) {
    amreliCheckbox.checked = true;
  }
  
  // Refresh district charts to show selected districts
  refreshDistrictCharts();
}

function closeRightPanel() {
  rightPanel.classList.remove('open');
  chartIcon.classList.remove('panel-open');
  document.getElementById('map').classList.remove('panel-open');
  // Change icon to graph when panel is closed
  chartIcon.textContent = '📊';
  
  // Auto-unselect all districts when panel closes
  const checkboxes = document.querySelectorAll('input[name="district"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Clear district charts
  if (districtForestChartInstance) {
    districtForestChartInstance.destroy();
    districtForestChartInstance = null;
  }
  if (districtWetlandChartInstance) {
    districtWetlandChartInstance.destroy();
    districtWetlandChartInstance = null;
  }
  if (districtCombinationChartInstance) {
    districtCombinationChartInstance.destroy();
    districtCombinationChartInstance = null;
  }
}

function switchSection(sectionNumber) {
  // Update active section toggle
  document.querySelectorAll('.graph-toggle').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-graph="${sectionNumber}"]`).classList.add('active');
  
  // Update active section display
  document.querySelectorAll('.graph-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(sectionNumber === 1 ? 'state-section' : 'district-section').classList.add('active');
  
  currentSection = sectionNumber;
}

function switchStateGraph(graphType) {
  // Update active state graph toggle
  document.querySelectorAll('.state-graph-toggle').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-state-graph="${graphType}"]`).classList.add('active');
  
  // Show/hide state graph containers
  document.querySelectorAll('#state-forest-container, #state-wetland-container, #state-total-container').forEach(container => {
    container.classList.remove('active');
  });
  
  // Show the selected graph container
  if (graphType === 'forest') {
    document.getElementById('state-forest-container').classList.add('active');
  } else if (graphType === 'wetland') {
    document.getElementById('state-wetland-container').classList.add('active');
  } else if (graphType === 'total') {
    document.getElementById('state-total-container').classList.add('active');
  }
}

function switchDistrictGraph(graphType) {
  // Update active district graph toggle
  document.querySelectorAll('.district-graph-toggle').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-district-graph="${graphType}"]`).classList.add('active');
  
  // Show/hide district graph containers
  document.querySelectorAll('#district-forest-container, #district-wetland-container, #district-total-container').forEach(container => {
    container.classList.remove('active');
  });
  
  // Show the selected graph container
  if (graphType === 'forest') {
    document.getElementById('district-forest-container').classList.add('active');
  } else if (graphType === 'wetland') {
    document.getElementById('district-wetland-container').classList.add('active');
  } else if (graphType === 'total') {
    document.getElementById('district-total-container').classList.add('active');
  }
}

async function loadStateData() {
  // Try API first, fallback to sample data
  await loadStateDataFromAPI();
}

async function loadDistrictData() {
  // Try API first, fallback to sample data generation
  await loadDistrictDataFromAPI();
}

async function generateSampleDistrictData() {
  // Generate sample district data as fallback
  const allDistricts = [
    "Ahmedabad", "Amreli", "Anand", "Banaskantha", "Bharuch", "Bhavnagar", 
    "Chhotaudepur", "Dahod", "Dang", "Devbhumi Dwarka", "Gandhinagar", 
    "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", 
    "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", 
    "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", 
    "Tapi", "Vadodara", "Valsad"
  ];
  
  const districtColors = generateDistrictColors(allDistricts);
  
  const generateDistrictData = (baseValue, variation) => {
    return allDistricts.map(district => {
      const districtIndex = allDistricts.indexOf(district);
      const multiplier = 0.5 + (districtIndex * 0.1); 
      return [
        baseValue * multiplier * 1.2,  // 2011
        baseValue * multiplier * 1.15, // 2012
        baseValue * multiplier * 1.1,  // 2013
        baseValue * multiplier * 1.05, // 2014
        baseValue * multiplier,        // 2015
        baseValue * multiplier * 0.95, // 2016
        baseValue * multiplier * 0.9,  // 2017
        baseValue * multiplier * 0.85, // 2018
        baseValue * multiplier * 0.8,  // 2019
        baseValue * multiplier * 0.75, // 2020
        baseValue * multiplier * 0.7,  // 2021
        baseValue * multiplier * 0.65  // 2022
      ];
    });
  };
  
  districtData = {
    districts: allDistricts,
    districtColors: districtColors,
    district_forest: {
      labels: ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
      data: Object.fromEntries(
        allDistricts.map((district, index) => [
          district, 
          generateDistrictData(-2000000, index)[index]
        ])
      )
    },
    district_wetland: {
      labels: ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
      data: Object.fromEntries(
        allDistricts.map((district, index) => [
          district, 
          generateDistrictData(-500000, index)[index]
        ])
      )
    },
    district_combination: {
      labels: ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
      data: {
        forest: Object.fromEntries(
          allDistricts.map((district, index) => [
            district, 
            generateDistrictData(-2000000, index)[index]
          ])
        ),
        wetland: Object.fromEntries(
          allDistricts.map((district, index) => [
            district, 
            generateDistrictData(-500000, index)[index]
          ])
        )
      }
    }
  };
}

// API data loading functions
async function loadStateDataFromAPI() {
  try {
    // Fetch forest and wetland data separately
    const [forestResponse, wetlandResponse] = await Promise.all([
      fetch(`${API_BASE}/state-data`),
      fetch(`${API_BASE}/wetland-state-data`)
    ]);
    
    if (!forestResponse.ok) throw new Error(`HTTP error! status: ${forestResponse.status}`);
    if (!wetlandResponse.ok) throw new Error(`HTTP error! status: ${wetlandResponse.status}`);
    
    const forestData = await forestResponse.json();
    const wetlandData = await wetlandResponse.json();
    
    // Process state data from API
    stateData = {
      state_forest: {
        labels: forestData.years || ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: forestData.forest_emissions || []
      },
      state_wetland: {
        labels: wetlandData.years || ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: wetlandData.wetland_emissions || []
      },
      state_combination: {
        labels: forestData.years || ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: {
          forest: forestData.forest_emissions || [],
          wetland: wetlandData.wetland_emissions || []
        }
      }
    };
    } catch (error) {
    console.error('Failed to load state data from API:', error);
      // Fallback to sample data
    stateData = {
      state_forest: {
        labels: ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: [-50000000, -45000000, -40000000, -35000000, -84653902.30, -44434610.46, -43484639.85, -42527855.04, -41595466.85, -39670222.41, -40475376.35, -40329589.00]
      },
      state_wetland: {
        labels: ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: [-15000000, -13500000, -12000000, -10500000, -20000000, -18000000, -16000000, -14000000, -12000000, -10000000, -8000000, -6000000]
      },
      state_combination: {
        labels: ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: {
          forest: [-50000000, -45000000, -40000000, -35000000, -84653902.30, -44434610.46, -43484639.85, -42527855.04, -41595466.85, -39670222.41, -40475376.35, -40329589.00],
          wetland: [-15000000, -13500000, -12000000, -10500000, -20000000, -18000000, -16000000, -14000000, -12000000, -10000000, -8000000, -6000000]
        }
      }
    };
  }
}

async function loadDistrictDataFromAPI() {
  try {
    // Fetch forest and wetland data separately
    const [forestResponse, wetlandResponse] = await Promise.all([
      fetch(`${API_BASE}/district-data`),
      fetch(`${API_BASE}/wetland-district-data`)
    ]);
    
    if (!forestResponse.ok) throw new Error(`HTTP error! status: ${forestResponse.status}`);
    if (!wetlandResponse.ok) throw new Error(`HTTP error! status: ${wetlandResponse.status}`);
    
    const forestData = await forestResponse.json();
    const wetlandData = await wetlandResponse.json();
    
    // Process district data from API
    const allDistricts = forestData.districts || [
      "Ahmedabad", "Amreli", "Anand", "Banaskantha", "Bharuch", "Bhavnagar", 
      "Chhotaudepur", "Dahod", "Dang", "Devbhumi Dwarka", "Gandhinagar", 
      "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", 
      "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", 
      "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", 
      "Tapi", "Vadodara", "Valsad"
    ];
    
    const districtColors = generateDistrictColors(allDistricts);
    
    districtData = {
      districts: allDistricts,
      districtColors: districtColors,
      district_forest: {
        labels: forestData.years || ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: forestData.forest_emissions || {}
      },
      district_wetland: {
        labels: wetlandData.years || ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: wetlandData.wetland_emissions || {}
      },
      district_combination: {
        labels: forestData.years || ['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'],
        data: {
          forest: forestData.forest_emissions || {},
          wetland: wetlandData.wetland_emissions || {}
        }
      }
    };
  } catch (error) {
    console.error('Failed to load district data from API:', error);
    // Fallback to sample data generation
    await generateSampleDistrictData();
  }
}

function generateDistrictColors(districts) {
  const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
    '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384', '#36A2EB', '#FFCE56',
    '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0',
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
    '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384', '#36A2EB', '#FFCE56',
    '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
  ];
  
  return Object.fromEntries(
    districts.map((district, index) => [district, colors[index % colors.length]])
  );
}

function getDistrictChartData(dataType) {
  // Get selected districts from the sidebar
  const selectedDistricts = getSelectedDistricts();
  
  // If no districts selected or districtData not loaded, return empty datasets
  if (!selectedDistricts || selectedDistricts.length === 0 || !districtData) {
    return {
      labels: districtData ? districtData[`district_${dataType}`]?.labels || [] : [],
      datasets: []
    };
  }
  
  // Get data for selected districts only
  const data = districtData[`district_${dataType}`];
  const datasets = selectedDistricts.map(districtName => {
    const districtDataArray = data.data[districtName];
    const color = districtData.districtColors[districtName] || '#4c7300';
    
    return {
      label: districtName,
      data: districtDataArray || new Array(12).fill(0),
      borderColor: color,
      backgroundColor: color + '20', // Add transparency
      tension: 0.4,
      fill: false
    };
  });
  
  return {
    labels: data.labels,
    datasets: datasets
  };
}

function getDistrictCombinedData() {
  // Get selected districts from the sidebar
  const selectedDistricts = getSelectedDistricts();
  
  if (!selectedDistricts || selectedDistricts.length === 0 || !districtData) {
    return {
      labels: districtData ? districtData.district_combination?.labels || [] : [],
      datasets: []
    };
  }
  
  const forestData = districtData.district_combination.data.forest;
  const wetlandData = districtData.district_combination.data.wetland;
  
  const datasets = [];
  
  // Add combined (total) data for each selected district
  selectedDistricts.forEach(districtName => {
    const color = districtData.districtColors[districtName] || '#4c7300';
    const forestEmissions = forestData[districtName] || new Array(12).fill(0);
    const wetlandEmissions = wetlandData[districtName] || new Array(12).fill(0);
    
    // Calculate total (forest + wetland) for each year
    const totalEmissions = forestEmissions.map((forest, index) => {
      const wetland = wetlandEmissions[index] || 0;
      return forest + wetland;
    });
    
    datasets.push({
      label: `${districtName} - Total`,
      data: totalEmissions,
      borderColor: color,
      backgroundColor: color + '20',
      tension: 0.4,
      fill: false,
      borderDash: []
    });
  });
  
  return {
    labels: districtData.district_combination.labels,
    datasets: datasets
  };
}

async function refreshDistrictCharts() {
  // Always refresh district charts when called
  await createDistrictForestChart();
  await createDistrictWetlandChart();
  await createDistrictCombinationChart();
}

async function createAllCharts() {
  // Load state data first
  await loadStateData();
  // Load district data
  await loadDistrictData();
  
  // Create all state charts
  await createStateForestChart();
  await createStateWetlandChart();
  await createStateCombinationChart();
  
  // Create all district charts
  await createDistrictForestChart();
  await createDistrictWetlandChart();
  await createDistrictCombinationChart();
}

async function createStateForestChart() {
  const ctx = document.getElementById('stateForestChartCanvas').getContext('2d');
  
  // Destroy existing chart if it exists
  if (stateForestChartInstance) {
    stateForestChartInstance.destroy();
  }
  
  const data = {
    labels: stateData.state_forest.labels,
        datasets: [{
      label: 'Forest CO2e (tonnes CO₂e/year)',
      data: stateData.state_forest.data,
          borderColor: '#4c7300',
          backgroundColor: 'rgba(76, 115, 0, 0.1)',
          tension: 0.4
        }]
      };
  
  stateForestChartInstance = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('Forest CO2e Emissions')
  });
}

async function createStateWetlandChart() {
  const ctx = document.getElementById('stateWetlandChartCanvas').getContext('2d');
  
  if (stateWetlandChartInstance) {
    stateWetlandChartInstance.destroy();
  }
  
  const data = {
    labels: stateData.state_wetland.labels,
        datasets: [{
      label: 'Wetland CO2e (tonnes CO₂e/year)',
      data: stateData.state_wetland.data,
          borderColor: '#00a884',
          backgroundColor: 'rgba(0, 168, 132, 0.1)',
          tension: 0.4
        }]
  };
  
  stateWetlandChartInstance = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('Wetland CO2e Emissions')
  });
}

async function createStateCombinationChart() {
  const ctx = document.getElementById('stateCombinationChartCanvas').getContext('2d');
  
  if (stateCombinationChartInstance) {
    stateCombinationChartInstance.destroy();
  }
  
  // Calculate total (forest + wetland) for each year
  const forestEmissions = stateData.state_combination.data.forest;
  const wetlandEmissions = stateData.state_combination.data.wetland;
  
  const totalEmissions = forestEmissions.map((forest, index) => {
    const wetland = wetlandEmissions[index] || 0;
    return forest + wetland;
  });
  
  const data = {
    labels: stateData.state_combination.labels,
    datasets: [
      {
          label: 'Total CO2e (Forest + Wetland)',
        data: totalEmissions,
        borderColor: '#2c3e50',
        backgroundColor: 'rgba(44, 62, 80, 0.1)',
        tension: 0.4,
        fill: false
      }
    ]
  };
  
  stateCombinationChartInstance = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('Total CO2e Emissions (Forest + Wetland)')
  });
}

async function createDistrictForestChart() {
  const ctx = document.getElementById('districtForestChartCanvas').getContext('2d');
  
  if (districtForestChartInstance) {
    districtForestChartInstance.destroy();
  }
  
  const data = getDistrictChartData('forest');
  
  districtForestChartInstance = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('Forest CO2e Emissions')
  });
}

async function createDistrictWetlandChart() {
  const ctx = document.getElementById('districtWetlandChartCanvas').getContext('2d');
  
  if (districtWetlandChartInstance) {
    districtWetlandChartInstance.destroy();
  }
  
  const data = getDistrictChartData('wetland');
  
  districtWetlandChartInstance = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('Wetland CO2e Emissions')
  });
}

async function createDistrictCombinationChart() {
  const ctx = document.getElementById('districtCombinationChartCanvas').getContext('2d');
  
  if (districtCombinationChartInstance) {
    districtCombinationChartInstance.destroy();
  }
  
  const data = getDistrictCombinedData();
  
  districtCombinationChartInstance = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('Total CO2e Emissions (Forest + Wetland)')
  });
}

function getChartOptions(title) {
  return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
        display: false // We're using h4 headers instead
        },
        legend: {
          display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'line',
          padding: 10
        }
        }
      },
      scales: {
        y: {
        beginAtZero: true, // Always start at zero!
          title: {
            display: true,
          text: 'CO2e (tonnes CO₂e/year)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Year'
          }
        }
      },
      elements: {
        point: {
        radius: 3,
        hoverRadius: 5
        }
      }
  };
}

// Animation functions for forest/wetland timeline
function toggleAnimation() {
  console.log('toggleAnimation called');
  const playBtn = document.getElementById('playBtn');
  
  if (!playBtn) {
    console.error('Play button not found');
    return;
  }
  
  if (isPlaying) {
    console.log('Stopping animation');
    // Stop animation
    clearInterval(animationInterval);
    playBtn.textContent = '▶️ Play';
    playBtn.classList.remove('playing');
    isPlaying = false;
  } else {
    console.log('Starting animation');
    // Start animation
    playBtn.textContent = '⏸️ Pause';
    playBtn.classList.add('playing');
    isPlaying = true;
    
    // Fixed speed of 800ms for smooth animation
    animationInterval = setInterval(() => {
      currentAnimationYear++;
      if (currentAnimationYear > 2022) {
        currentAnimationYear = 2015;
      }
      console.log('Animation year:', currentAnimationYear);
      updateAnimationYear(currentAnimationYear);
    }, 800);
  }
}

function updateAnimationYear(year) {
  const currentYearSpan = document.getElementById('currentYear');
  const animationSlider = document.getElementById('animationSlider');
  
  if (!currentYearSpan || !animationSlider) {
    console.error('Animation year elements not found');
    return;
  }
  
  currentYearSpan.textContent = year;
  animationSlider.value = year;
  currentAnimationYear = year;
  
  // Load forest and wetland data for this year
  loadAnimationData(year);
}

async function loadAnimationData(year) {
  try {
    console.log(`Loading animation data for year ${year}...`);
    
    // Show loading indicator
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.textContent = '⏳ Loading...';
      playBtn.disabled = true;
    }
    
    // Get ALL districts for state-level data
    const allDistrictsRes = await fetch(`${API_BASE}/districts`);
    const allDistricts = await allDistrictsRes.json();
    console.log(`Found ${allDistricts.length} districts`);

    // Remove previous animation layer
    if (currentLayer && map.hasLayer(currentLayer)) {
      map.removeLayer(currentLayer);
    }

    // Fetch metadata for district mapping
    const metadataRes = await fetch(`${API_BASE}/metadata`);
    if (!metadataRes.ok) throw new Error("Failed to fetch metadata");
    const metadata = await metadataRes.json();

    // District ID mapping
    const districtNameToId = {};
    metadata.district_boundary.features.forEach((f) => {
      const name = f.properties.name?.toUpperCase();
      if (name) districtNameToId[name] = f.properties.id;
    });

    // Build query for ALL districts (state-level)
    const query = new URLSearchParams();
    allDistricts.forEach((d) => {
      const id = districtNameToId[d.toUpperCase()];
      if (id) query.append("district_id", id);
    });
    query.append("year", year);

    const url = `${API_BASE}/lulc-geojson?${query.toString()}`;
    console.log(`Fetching data from: ${url}`);
    const lulcRes = await fetch(url);
    if (!lulcRes.ok) throw new Error("Failed to fetch LULC data");
    const lulcData = await lulcRes.json();
    console.log(`Received ${lulcData.features.length} features`);

    // Filter for forest and wetland types only (faster)
    const forestTypes = [51, 52, 61, 62, 71, 72, 81, 82, 91, 92];
    const wetlandTypes = [181, 182, 183, 186];
    const carbonSinkTypes = [...forestTypes, ...wetlandTypes];
    
    const filteredFeatures = lulcData.features.filter((f) => {
      const typeId = Number(f.properties.type_id);
      return carbonSinkTypes.includes(typeId);
    });

    console.log(`Filtered to ${filteredFeatures.length} forest/wetland features`);

    if (filteredFeatures.length === 0) {
      console.warn(`No forest/wetland data found for year ${year}`);
      updateStatsBox(0, 0, 0);
      return;
    }

    // Calculate areas
    let forestArea = 0;
    let wetlandArea = 0;
    
    filteredFeatures.forEach((f) => {
      const typeId = Number(f.properties.type_id);
      const area = Number(f.properties.area) || 0;
      
      if (forestTypes.includes(typeId)) {
        forestArea += area;
      } else if (wetlandTypes.includes(typeId)) {
        wetlandArea += area;
      }
    });

    const totalArea = forestArea + wetlandArea;
    console.log(`Areas - Forest: ${forestArea.toFixed(2)}, Wetland: ${wetlandArea.toFixed(2)}, Total: ${totalArea.toFixed(2)}`);

    // Update statistics box
    updateStatsBox(forestArea, wetlandArea, totalArea);

    // Create GeoJSON layer
    const geojson = {
      type: "FeatureCollection",
      features: filteredFeatures,
    };

    // Add layer to map
    currentLayer = L.geoJSON(geojson, {
      style: (f) => ({
        color: '#333',
        weight: 0,
        fillColor: getColor(Number(f.properties.type_id)),
        fillOpacity: 0.6,
      }),
      onEachFeature: (feature, layerPopup) => {
        const typeId = Number(feature.properties.type_id);
        const typeName = forestTypes.includes(typeId) ? 'Forest' : 'Wetland';
        const popupContent = `
          <div style="font-size: 12px;">
            <strong>Type:</strong> ${typeName}<br>
            <strong>Area:</strong> ${feature.properties.area?.toFixed(2) || 'N/A'} sq km<br>
            <strong>Year:</strong> ${year}
          </div>
        `;
        layerPopup.bindPopup(popupContent);
      },
    }).addTo(map);

    // Bring to front
    currentLayer.bringToFront();
    console.log(`Animation data loaded successfully for year ${year}`);

  } catch (error) {
    console.error('Animation data loading failed:', error);
    updateStatsBox(0, 0, 0);
  } finally {
    // Restore play button
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.disabled = false;
      if (isPlaying) {
        playBtn.textContent = '⏸️ Pause';
      } else {
        playBtn.textContent = '▶️ Play';
      }
    }
  }
}

// Update statistics box
function updateStatsBox(forestArea, wetlandArea, totalArea) {
  const forestEl = document.getElementById('forest-area');
  const wetlandEl = document.getElementById('wetland-area');
  const totalEl = document.getElementById('total-area');
  
  if (forestEl) forestEl.textContent = `${forestArea.toFixed(2)} sq km`;
  if (wetlandEl) wetlandEl.textContent = `${wetlandArea.toFixed(2)} sq km`;
  if (totalEl) totalEl.textContent = `${totalArea.toFixed(2)} sq km`;
}

// Initialize animation controls
function initializeAnimationControls() {
  const animationSlider = document.getElementById('animationSlider');
  
  if (!animationSlider) {
    console.error('Animation control elements not found');
    return;
  }
  
  // Slider change handler
  animationSlider.addEventListener('input', (e) => {
    if (!isPlaying) {
      updateAnimationYear(parseInt(e.target.value));
    }
  });
  
  // Load initial data for current year
  loadAnimationData(2022);
}

// Function to initialize animation controls when user is ready
function initializeAnimationWhenReady() {
  console.log('Initializing animation controls...');
  initializeAnimationControls();
  
  // Hide init button and show animation controls
  const initBtn = document.getElementById('initAnimationBtn');
  const playBtn = document.getElementById('playBtn');
  const currentYear = document.getElementById('currentYear');
  const sliderContainer = document.querySelector('.year-slider-container');
  
  if (initBtn) initBtn.style.display = 'none';
  if (playBtn) playBtn.style.display = 'inline-block';
  if (currentYear) currentYear.style.display = 'inline-block';
  if (sliderContainer) sliderContainer.style.display = 'block';
  
  console.log('Animation controls ready!');
}

// Make it available globally so it can be called from console or button
window.initializeAnimation = initializeAnimationWhenReady;

// On page load: populate districts and configure year slider from backend
window.onload = () => {
  populateDistrictCheckboxes();
  initializeRightPanel();
  // initializeAnimationControls(); // Commented out - load animation later
  
  // Load available years and configure slider
  fetch(`${API_BASE}/years`)
    .then((res) => res.json())
    .then((years) => {
      if (Array.isArray(years) && years.length > 0) {
        availableYears = years;
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        yearSlider.min = String(minYear);
        yearSlider.max = String(maxYear);
        yearSlider.step = "1";
        yearSlider.value = String(maxYear);
        yearDisplay.textContent = String(maxYear);
      }
    })
    .catch((err) => console.error("Failed to load years:", err));
};
