
// Initialize Leaflet map centered on Gujarat
const map = L.map("map").setView([22.5, 72.5], 9); // Gujarat center

// Configurable API base URL: set window.API_BASE in production (e.g., Render)
// Empty string is valid for same-origin requests, so check for undefined/null explicitly
const API_BASE = (window.API_BASE !== undefined && window.API_BASE !== null) ? window.API_BASE : "http://localhost:8000";

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
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    dropdownBtn.classList.toggle('dropdown-open', !isOpen);
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
      dropdownBtn.classList.remove('dropdown-open');
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
// let animationInterval = null;
// let isPlaying = false;
// let currentAnimationYear = 2022;
// // Cache for animation data by year
// let animationDataCache = {};

// Helper function to get formatted timestamp
function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

// Helper function to format duration in milliseconds
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

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
  console.log('🎨 Polygon drawn! Starting LULC fetch...');
  const layer = e.layer;
  drawnItems.addLayer(layer);
  
  // Show loading indicator
  layer.bindPopup('Loading LULC data...').openPopup();
  
  try {
    const geom = layer.toGeoJSON().geometry;
    const year = document.getElementById('yearSlider').value;
    console.log(`📅 Fetching LULC data for year: ${year}`);
    console.log(`📍 Polygon coordinates:`, geom.coordinates[0].slice(0, 3), '... (showing first 3 points)');

    // Query backend for LULC intersecting the drawn polygon
    console.log(`🌐 Sending request to: ${API_BASE}/lulc-by-polygon?year=${year}`);
    const res = await fetch(`${API_BASE}/lulc-by-polygon?year=${encodeURIComponent(year)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geom)
    });
    
    if (!res.ok) {
      console.error(`❌ Backend error: ${res.status}`);
      throw new Error(`Backend error ${res.status}`);
    }
    
    console.log('✅ Received response from backend, parsing data...');
    const geojson = await res.json();
    console.log(`✂️ Received ${geojson.features?.length || 0} clipped LULC features (only portions inside polygon)`);

    // Close loading popup
    layer.closePopup();

    if (!geojson.features || geojson.features.length === 0) {
      console.log('⚠️ No LULC data found in the drawn polygon');
      layer.bindPopup('No LULC data found in this area').openPopup();
      return;
    }

    // Get LULC type names for popup information
    const uniqueIds = [...new Set(geojson.features.map((f) => Number(f.properties.type_id)))];
    console.log(`🔍 Found ${uniqueIds.length} unique LULC types:`, uniqueIds);
    let typeMapping = {};
    
    try {
      console.log('📝 Fetching LULC type names...');
      const typeRes = await fetch(`${API_BASE}/lulc-types?${uniqueIds.map((id) => `type_id=${id}`).join("&")}`);
      if (typeRes.ok) {
        typeMapping = await typeRes.json();
        console.log('✅ LULC type names fetched:', Object.keys(typeMapping).length, 'types');
      }
    } catch (typeErr) {
      console.warn('⚠️ Failed to fetch LULC type names:', typeErr);
    }

    // Render the results with styling and popups
    // Only the clipped portions of LULC features inside the polygon are displayed
    console.log('🎨 Rendering clipped LULC features on map...');
    const layerResult = L.geoJSON(geojson, {
      style: (f) => ({
        color: '#333',
        weight: 1,
        fillColor: getColor(Number(f.properties.type_id)),
        fillOpacity: 0.7,
      }),
      onEachFeature: (feature, layerPopup) => {
        const typeId = Number(feature.properties.type_id);
        const typeName = typeMapping[typeId] || `LULC Type ${typeId}`;
        const area = feature.properties.area ? feature.properties.area.toFixed(2) : 'N/A';
        const isClipped = feature.properties.clipped === true || feature.properties.clipped === 'true';
        const originalArea = feature.properties.original_area ? feature.properties.original_area.toFixed(2) : null;
        
        let popupContent = `<b>${typeName}</b><br>
           <b>Type ID:</b> ${typeId}<br>
           <b>Area (clipped):</b> ${area} ha`;
        
        if (isClipped && originalArea) {
          popupContent += `<br><small>Original area: ${originalArea} ha</small>`;
        }
        
        popupContent += `<br><small>Clipped to polygon</small>`;
        
        layerPopup.bindPopup(popupContent);
      }
    }).addTo(map);
    
    // Store this layer for cleanup
    loadedLulcLayers.push(layerResult);
    
    // Update drawn polygon popup with summary
    const totalFeatures = geojson.features.length;
    const summary = totalFeatures === 1 
      ? `Found ${totalFeatures} LULC polygon within this area`
      : `Found ${totalFeatures} LULC polygons within this area`;
    
    layer.bindPopup(`<b>Drawn Polygon</b><br>${summary}<br><b>Year:</b> ${year}`).closePopup();
    
    // Fit bounds to show both drawn polygon and LULC results
    console.log('🗺️ Fitting map bounds to show polygon and LULC data...');
    const bounds = L.latLngBounds()
      .extend(layer.getBounds())
      .extend(layerResult.getBounds());
    map.fitBounds(bounds);
    
    console.log('✅ Polygon LULC fetch completed successfully!');
    console.log(`📈 Summary: ${totalFeatures} features displayed for year ${year}`);
    
  } catch (err) {
    console.error('❌ Polygon query failed:', err);
    console.error('Error details:', err.message, err.stack);
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
      // Convert area to hectares if it appears to be in square kilometers
      // If area is less than 50, assume it's in km² and convert to hectares (multiply by 100)
      let areaValue = typeof f.properties.area === "number" ? f.properties.area : Number(f.properties.area) || 0;
      if (areaValue > 0 && areaValue < 50) {
        // Likely in square kilometers, convert to hectares
        areaValue = areaValue * 100;
      }
      return {
        ...f,
        properties: {
          ...f.properties,
          type_name: typeMapping[typeIdNum] || "Unknown",
          district: districtIdToName[f.properties.district_id] || "N/A",
          area_ha: areaValue,
          area: areaValue, // Update the area property as well for popup display
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

    // Separate into forest and others groups
    const forestGroup = {};
    const othersGroup = {};
    
    for (const [code, label] of Object.entries(uniqueTypes)) {
      const codeNum = Number(code);
      // Check if this type is in the forestTypes array (includes forests and wetlands)
      if (forestTypes.includes(codeNum)) {
        forestGroup[code] = label;
      } else {
        othersGroup[code] = label;
      }
    }

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
      
      // Forest group with dropdown
      if (Object.keys(forestGroup).length > 0) {
        html += `<div class="legend-group">
          <div class="legend-group-header" onclick="toggleLegendGroup(this)">
            <span class="legend-arrow">▼</span>
            <strong style="color: #4c7300;">Forest</strong>
          </div>
          <div class="legend-group-content" style="display: block;">
        `;
        for (const [code, label] of Object.entries(forestGroup)) {
          html += `<div style="margin-left: 15px; margin-bottom: 4px;">
            ${label}
          </div>`;
        }
        html += `</div></div>`;
      }
      
      // Others group with dropdown
      if (Object.keys(othersGroup).length > 0) {
        const marginTop = Object.keys(forestGroup).length > 0 ? ' style="margin-top: 12px;"' : '';
        html += `<div class="legend-group"${marginTop}>
          <div class="legend-group-header" onclick="toggleLegendGroup(this)">
            <span class="legend-arrow">▼</span>
            <strong style="color: #ffc107;">Others</strong>
          </div>
          <div class="legend-group-content" style="display: block;">
        `;
        for (const [code, label] of Object.entries(othersGroup)) {
          html += `<div style="margin-left: 15px; margin-bottom: 4px;">
            ${label}
          </div>`;
        }
        html += `</div></div>`;
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
  
  // Update district dropdown button label
  updateDistrictDropdownBtnLabel();

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

// Download chart as PNG
function downloadChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    alert("Chart not found. Please ensure the graph is loaded.");
    return;
  }

  // Convert canvas to PNG data URL
  const dataURL = canvas.toDataURL('image/png');
  
  // Create download link
  const link = document.createElement('a');
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.png`;
  link.href = dataURL;
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
      data: districtDataArray ? tonnesToMegatonnes(districtDataArray) : new Array(12).fill(0),
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
      data: tonnesToMegatonnes(totalEmissions),
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

// Helper function to convert tonnes to megatonnes
function tonnesToMegatonnes(tonnesArray) {
  return tonnesArray.map(value => value / 1000000);
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
      label: 'Forest CO2e',
      data: tonnesToMegatonnes(stateData.state_forest.data),
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
      label: 'Wetland CO2e',
      data: tonnesToMegatonnes(stateData.state_wetland.data),
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
        data: tonnesToMegatonnes(totalEmissions),
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
          padding: 9
        }
        }
      },
      scales: {
        y: {
        beginAtZero: true, // Always start at zero!
          title: {
            display: true,
          text: 'Annual emissions/removals (Mt CO₂/year)'
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
        radius: 5,
        hoverRadius: 7,
        pointStyle: 'triangle' // Use triangles instead of circles
        }
      }
  };
}

// Animation functions for forest/wetland timeline
// function toggleAnimation() {
//   console.log('toggleAnimation called');
//   const playBtn = document.getElementById('playBtn');
//   
//   if (!playBtn) {
//     console.error('Play button not found');
//     return;
//   }
//   
//   if (isPlaying) {
//     console.log('Stopping animation');
//     // Stop animation
//     clearInterval(animationInterval);
//     playBtn.textContent = '▶️ Play';
//     playBtn.classList.remove('playing');
//     isPlaying = false;
//   } else {
//     console.log('Starting animation');
//     // Start animation from 2015
//     if (currentAnimationYear > 2022 || currentAnimationYear < 2015) {
//       currentAnimationYear = 2014; // Will increment to 2015 on first tick
//     }
//     // Start animation
//     playBtn.textContent = '⏸️ Pause';
//     playBtn.classList.add('playing');
//     isPlaying = true;
//     
//     // Fixed speed of 800ms for smooth animation
//     animationInterval = setInterval(() => {
//       currentAnimationYear++;
//       if (currentAnimationYear > 2022) {
//         currentAnimationYear = 2015;
//       }
//       console.log('Animation year:', currentAnimationYear);
//       updateAnimationYear(currentAnimationYear);
//     }, 800);
//   }
// }

// function updateAnimationYear(year) {
//   const currentYearSpan = document.getElementById('currentYear');
//   const animationSlider = document.getElementById('animationSlider');
//   
//   if (!currentYearSpan || !animationSlider) {
//     console.error(`[${getTimestamp()}] Animation year elements not found`);
//     return;
//   }
//   
//   currentYearSpan.textContent = year;
//   animationSlider.value = year;
//   currentAnimationYear = year;
//   
//   console.log(`[${getTimestamp()}] Updating animation to year ${year}`);
//   
//   // Load forest and wetland data for this year
//   loadAnimationData(year);
// }

// async function loadAnimationData(year) {
//   const startTime = performance.now();
//   const startTimestamp = getTimestamp();
//   
//   try {
//     console.log(`[${startTimestamp}] Loading animation data for year ${year}...`);
//     
//     // Check cache first
//     if (animationDataCache[year]) {
//       const cacheStartTime = performance.now();
//       console.log(`[${getTimestamp()}] Using cached data for year ${year}`);
//       const cachedData = animationDataCache[year];
//       
//       // Remove previous animation layer
//       if (currentLayer && map.hasLayer(currentLayer)) {
//         map.removeLayer(currentLayer);
//       }
//       
//       // Update statistics box
//       updateStatsBox(cachedData.forestArea, cachedData.wetlandArea, cachedData.totalArea);
//       
//       // Create GeoJSON layer from cached data
//       const geojson = {
//         type: "FeatureCollection",
//         features: cachedData.filteredFeatures,
//       };
//       
//       // Add layer to map
//       currentLayer = L.geoJSON(geojson, {
//         style: (f) => ({
//           color: '#333',
//           weight: 0,
//           fillColor: getColor(Number(f.properties.type_id)),
//           fillOpacity: 0.6,
//         }),
//         onEachFeature: (feature, layerPopup) => {
//           const typeId = Number(feature.properties.type_id);
//           const forestTypes = [51, 52, 61, 62, 71, 72, 81, 82, 91, 92];
//           const typeName = forestTypes.includes(typeId) ? 'Forest' : 'Wetland';
//           const popupContent = `
//             <div style="font-size: 12px;">
//               <strong>Type:</strong> ${typeName}<br>
//               <strong>Area:</strong> ${feature.properties.area?.toFixed(2) || 'N/A'} sq km<br>
//               <strong>Year:</strong> ${year}
//             </div>
//           `;
//           layerPopup.bindPopup(popupContent);
//         },
//       }).addTo(map);
//       
//       // Bring to front
//       currentLayer.bringToFront();
//       const cacheEndTime = performance.now();
//       const cacheDuration = cacheEndTime - cacheStartTime;
//       console.log(`[${getTimestamp()}] Animation data loaded from cache for year ${year} (took ${formatDuration(cacheDuration)})`);
//       return;
//     }
//     
//     // Show loading indicator only if fetching new data
//     const playBtn = document.getElementById('playBtn');
//     if (playBtn) {
//       playBtn.textContent = '⏳ Loading...';
//       playBtn.disabled = true;
//     }
//     
//     // Get ALL districts for state-level data
//     const districtsFetchStart = performance.now();
//     const allDistrictsRes = await fetch(`${API_BASE}/districts`);
//     const allDistricts = await allDistrictsRes.json();
//     const districtsFetchTime = performance.now() - districtsFetchStart;
//     console.log(`[${getTimestamp()}] Found ${allDistricts.length} districts (took ${formatDuration(districtsFetchTime)})`);

//     // Remove previous animation layer
//     if (currentLayer && map.hasLayer(currentLayer)) {
//       map.removeLayer(currentLayer);
//     }

//     // Fetch metadata for district mapping
//     const metadataFetchStart = performance.now();
//     const metadataRes = await fetch(`${API_BASE}/metadata`);
//     if (!metadataRes.ok) throw new Error("Failed to fetch metadata");
//     const metadata = await metadataRes.json();
//     const metadataFetchTime = performance.now() - metadataFetchStart;
//     console.log(`[${getTimestamp()}] Metadata fetched (took ${formatDuration(metadataFetchTime)})`);

//     // District ID mapping
//     const mappingStart = performance.now();
//     const districtNameToId = {};
//     metadata.district_boundary.features.forEach((f) => {
//       const name = f.properties.name?.toUpperCase();
//       if (name) districtNameToId[name] = f.properties.id;
//     });
//     const mappingTime = performance.now() - mappingStart;
//     console.log(`[${getTimestamp()}] District ID mapping completed (took ${formatDuration(mappingTime)})`);

//     // Build query for ALL districts (state-level)
//     const query = new URLSearchParams();
//     allDistricts.forEach((d) => {
//       const id = districtNameToId[d.toUpperCase()];
//       if (id) query.append("district_id", id);
//     });
//     query.append("year", year);

//     const url = `${API_BASE}/lulc-geojson?${query.toString()}`;
//     console.log(`[${getTimestamp()}] Fetching LULC data from: ${url}`);
//     const lulcFetchStart = performance.now();
//     const lulcRes = await fetch(url);
//     if (!lulcRes.ok) throw new Error("Failed to fetch LULC data");
//     const lulcData = await lulcRes.json();
//     const lulcFetchTime = performance.now() - lulcFetchStart;
//     console.log(`[${getTimestamp()}] Received ${lulcData.features.length} features (took ${formatDuration(lulcFetchTime)})`);

//     // Filter for forest and wetland types only (faster)
//     const filterStart = performance.now();
//     const forestTypes = [51, 52, 61, 62, 71, 72, 81, 82, 91, 92];
//     const wetlandTypes = [181, 182, 183, 186];
//     const carbonSinkTypes = [...forestTypes, ...wetlandTypes];
//     
//     const filteredFeatures = lulcData.features.filter((f) => {
//       const typeId = Number(f.properties.type_id);
//       return carbonSinkTypes.includes(typeId);
//     });
//     const filterTime = performance.now() - filterStart;
//     console.log(`[${getTimestamp()}] Filtered to ${filteredFeatures.length} forest/wetland features (took ${formatDuration(filterTime)})`);

//     if (filteredFeatures.length === 0) {
//       const totalTime = performance.now() - startTime;
//       console.warn(`[${getTimestamp()}] No forest/wetland data found for year ${year} (total time: ${formatDuration(totalTime)})`);
//       updateStatsBox(0, 0, 0);
//       // Cache empty result to avoid refetching
//       animationDataCache[year] = {
//         filteredFeatures: [],
//         forestArea: 0,
//         wetlandArea: 0,
//         totalArea: 0
//       };
//       return;
//     }

//     // Calculate areas
//     const calcStart = performance.now();
//     let forestArea = 0;
//     let wetlandArea = 0;
//     
//     filteredFeatures.forEach((f) => {
//       const typeId = Number(f.properties.type_id);
//       const area = Number(f.properties.area) || 0;
//       
//       if (forestTypes.includes(typeId)) {
//         forestArea += area;
//       } else if (wetlandTypes.includes(typeId)) {
//         wetlandArea += area;
//       }
//     });

//     const totalArea = forestArea + wetlandArea;
//     const calcTime = performance.now() - calcStart;
//     console.log(`[${getTimestamp()}] Areas calculated - Forest: ${forestArea.toFixed(2)}, Wetland: ${wetlandArea.toFixed(2)}, Total: ${totalArea.toFixed(2)} (took ${formatDuration(calcTime)})`);

//     // Cache the data for this year
//     const cacheStart = performance.now();
//     animationDataCache[year] = {
//       filteredFeatures: filteredFeatures,
//       forestArea: forestArea,
//       wetlandArea: wetlandArea,
//       totalArea: totalArea
//     };
//     const cacheTime = performance.now() - cacheStart;
//     console.log(`[${getTimestamp()}] Cached data for year ${year} (took ${formatDuration(cacheTime)})`);

//     // Update statistics box
//     updateStatsBox(forestArea, wetlandArea, totalArea);

//     // Create GeoJSON layer
//     const renderStart = performance.now();
//     const geojson = {
//       type: "FeatureCollection",
//       features: filteredFeatures,
//     };

//     // Add layer to map
//     currentLayer = L.geoJSON(geojson, {
//       style: (f) => ({
//         color: '#333',
//         weight: 0,
//         fillColor: getColor(Number(f.properties.type_id)),
//         fillOpacity: 0.6,
//       }),
//       onEachFeature: (feature, layerPopup) => {
//         const typeId = Number(feature.properties.type_id);
//         const typeName = forestTypes.includes(typeId) ? 'Forest' : 'Wetland';
//         const popupContent = `
//           <div style="font-size: 12px;">
//             <strong>Type:</strong> ${typeName}<br>
//             <strong>Area:</strong> ${feature.properties.area?.toFixed(2) || 'N/A'} sq km<br>
//             <strong>Year:</strong> ${year}
//           </div>
//         `;
//         layerPopup.bindPopup(popupContent);
//       },
//     }).addTo(map);

//     // Bring to front
//     currentLayer.bringToFront();
//     const renderTime = performance.now() - renderStart;
//     const totalTime = performance.now() - startTime;
//     console.log(`[${getTimestamp()}] Animation data loaded successfully for year ${year} - Rendering took ${formatDuration(renderTime)}, Total time: ${formatDuration(totalTime)}`);

//   } catch (error) {
//     const totalTime = performance.now() - startTime;
//     console.error(`[${getTimestamp()}] Animation data loading failed for year ${year} (took ${formatDuration(totalTime)}):`, error);
//     updateStatsBox(0, 0, 0);
//   } finally {
//     // Restore play button
//     const playBtn = document.getElementById('playBtn');
//     if (playBtn) {
//       playBtn.disabled = false;
//       if (isPlaying) {
//         playBtn.textContent = '⏸️ Pause';
//       } else {
//         playBtn.textContent = '▶️ Play';
//       }
//     }
//   }
// }

// Update statistics box
// function updateStatsBox(forestArea, wetlandArea, totalArea) {
//   const forestEl = document.getElementById('forest-area');
//   const wetlandEl = document.getElementById('wetland-area');
//   const totalEl = document.getElementById('total-area');
//   
//   if (forestEl) forestEl.textContent = `${forestArea.toFixed(2)} sq km`;
//   if (wetlandEl) wetlandEl.textContent = `${wetlandArea.toFixed(2)} sq km`;
//   if (totalEl) totalEl.textContent = `${totalArea.toFixed(2)} sq km`;
// }

// Preload all animation years in parallel for faster playback
// async function preloadAllAnimationYears() {
//   const preloadStartTime = performance.now();
//   const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];
//   const initBtn = document.getElementById('initAnimationBtn');
//   
//   console.log(`[${getTimestamp()}] Starting preload of ${years.length} years...`);
//   
//   // Update button to show loading progress
//   if (initBtn) {
//     initBtn.textContent = '⏳ Loading data...';
//     initBtn.disabled = true;
//   }
//   
//   // Load all years in parallel (but limit concurrency to avoid overwhelming the server)
//   const batchSize = 3; // Load 3 years at a time
//   
//   for (let i = 0; i < years.length; i += batchSize) {
//     const batch = years.slice(i, i + batchSize);
//     
//     const batchPromises = batch.map(year => {
//       // Only load if not already cached
//       if (!animationDataCache[year]) {
//         return loadAnimationData(year).catch(err => {
//           console.error(`[${getTimestamp()}] Failed to preload year ${year}:`, err);
//         });
//       }
//       return Promise.resolve();
//     });
//     
//     await Promise.all(batchPromises);
//     
//     // Count how many are now cached
//     const cachedCount = years.filter(year => animationDataCache[year]).length;
//     
//     if (initBtn) {
//       initBtn.textContent = `⏳ Loading... (${cachedCount}/${years.length})`;
//     }
//   }
//   
//   const preloadTime = performance.now() - preloadStartTime;
//   console.log(`[${getTimestamp()}] Preload completed! All ${years.length} years cached (took ${formatDuration(preloadTime)})`);
//   
//   if (initBtn) {
//     initBtn.textContent = '✅ Ready to Play';
//     initBtn.disabled = false;
//     // Reset button text after a moment
//     setTimeout(() => {
//       if (initBtn) {
//         initBtn.textContent = '🚀 Load Animation';
//       }
//     }, 2000);
//   }
// }

// Initialize animation controls
// function initializeAnimationControls() {
//   const animationSlider = document.getElementById('animationSlider');
//   
//   if (!animationSlider) {
//     console.error('Animation control elements not found');
//     return;
//   }
//   
//   // Slider change handler
//   animationSlider.addEventListener('input', (e) => {
//     if (!isPlaying) {
//       updateAnimationYear(parseInt(e.target.value));
//     }
//   });
//   
//   // Load initial data for current year (will use cache if preloaded)
//   loadAnimationData(2022);
// }

// Function to initialize animation controls when user is ready
// async function initializeAnimationWhenReady() {
//   console.log(`[${getTimestamp()}] Initializing animation controls...`);
//   
//   // First, preload all years in parallel
//   await preloadAllAnimationYears();
//   
//   initializeAnimationControls();
//   
//   // Hide init button and show animation controls
//   const initBtn = document.getElementById('initAnimationBtn');
//   const playBtn = document.getElementById('playBtn');
//   const currentYear = document.getElementById('currentYear');
//   const sliderContainer = document.querySelector('.year-slider-container');
//   
//   if (initBtn) initBtn.style.display = 'none';
//   if (playBtn) playBtn.style.display = 'inline-block';
//   if (currentYear) currentYear.style.display = 'inline-block';
//   if (sliderContainer) sliderContainer.style.display = 'block';
//   
//   console.log(`[${getTimestamp()}] Animation controls ready!`);
// }

// Make it available globally so it can be called from console or button
// window.initializeAnimation = initializeAnimationWhenReady;

// Toggle legend group dropdown
function toggleLegendGroup(header) {
  const content = header.nextElementSibling;
  const arrow = header.querySelector('.legend-arrow');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    arrow.textContent = '▼';
    arrow.style.transform = 'rotate(0deg)';
  } else {
    content.style.display = 'none';
    arrow.textContent = '▶';
    arrow.style.transform = 'rotate(0deg)';
  }
}

// Make toggleLegendGroup available globally
window.toggleLegendGroup = toggleLegendGroup;

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
