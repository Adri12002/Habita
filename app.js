// Config
const CONFIG = {
  MAPBOX_TOKEN: 'pk.eyJ1IjoiYWRyaTEyMDAyIiwiYSI6ImNtOW9rMnpvcTB5Mm4yb3M5OXFuZnZxMTYifQ.OG_1wCEq1fV7YCUJz9V_ZQ',
  GEOAPIFY_KEY: '892b86482da04c61a15c033badbec2f3', 
  DEFAULT_CENTER: [48.8566, 2.3522], // Paris
  DEFAULT_ZOOM: 13,
  MAX_RESULTS: 50,
  STORAGE_KEY: 'savedIsochrones',
  ISOCHRONE_COLORS: {
    iso1: '#4a6bff',
    iso2: '#ff6b9e',
    transit: '#9c27b0' // Nouvelle couleur pour le transport
  }
};


let allowSecondPoint = false;


document.getElementById('zone-mode').addEventListener('change', (e) => {
  currentZoneMode = e.target.value;
  updateIsochroneVisibility();

  if (centerMarkers.iso1) {
    const options = getCurrentOptions();
    currentResults = filterResultsByZone(currentDisplayMode);
    displayResults(currentResults);
    updateMarkerAppearance();
  }
});

document.getElementById('toggle-tiers-btn').addEventListener('click', () => {
  showAllLayers = !showAllLayers; // C'est showAllLayers et PAS showTiers
  updateIsochroneVisibility();
});



function getCurrentZoneGeometry() {
  if (currentZoneMode === 'iso1' && currentIsochrones.iso1) {
    return currentIsochrones.iso1.toGeoJSON().features[0];
  } else if (currentZoneMode === 'iso2' && currentIsochrones.iso2) {
    return currentIsochrones.iso2.toGeoJSON().features[0];
  } else if (currentZoneMode === 'intersection' && currentIsochrones.intersection) {
    return currentIsochrones.intersection.toGeoJSON();
  } else if (currentZoneMode === 'union' && currentIsochrones.union) {
    return currentIsochrones.union.toGeoJSON();
  } else {
    return null;
  }
}

function updateDisplayedMarkers() {
  const currentZoneGeometry = getCurrentZoneGeometry();
  
  if (!currentZoneGeometry) {
    console.warn('No active zone geometry to display markers.');
    return;
  }

  // 1. Supprimer les anciens markers  housingLayerGroup.clearLayers();

  // 2. Filtrer et réafficher
  const jobsInZone = jobsData.filter(job => turf.booleanPointInPolygon(turf.point([job.lng, job.lat]), currentZoneGeometry));
  const housingInZone = housingData.filter(house => turf.booleanPointInPolygon(turf.point([house.lng, house.lat]), currentZoneGeometry));

  jobsInZone.forEach(job => addJobMarker(job));
  housingInZone.forEach(house => addHousingMarker(house));
}


// App State
let map;
let currentIsochrones = {
  iso1: null,
  iso2: null,
  intersection: null,
  union: null
};
let centerMarkers = {
  iso1: null,
  iso2: null
};
let savedMaps = [];
let currentResults = [];
let markersLayer = L.layerGroup();
let allMarkers = [];
let jobsData = [];
let housingData = [];
let currentDisplayMode = 'both'; // 'both', 'jobs', 'housing'
let currentZoneMode = 'iso1'; // 'iso1', 'iso2', 'intersection', 'union'
let currentOnboardingStep = 1;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  setupEventListeners();
  initSavedMaps();
  initGeocoders();
  setCurrentDateTime(); // 👈 ici


 // await loadData();
  
  // Check if onboarding has been completed
  if (!localStorage.getItem('onboardingCompleted')) {
    document.getElementById('onboarding-modal').classList.add('active');
  }
});



function initMap() {
  map = L.map('map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  
  
  
  
  
  
  
  
  
  
  
  

  markersLayer.addTo(map);

  // Map click handler
  map.on('click', (e) => {
    if (!centerMarkers.iso1) {
      setCenterPoint(e.latlng, 'iso1');
      showNotification('First location set! You can set a second location if needed', 'success');
    } else if (allowSecondPoint && !centerMarkers.iso2) {
      setCenterPoint(e.latlng, 'iso2');
      showNotification('Second location set! Click "Generate" to create areas', 'success');
    } else if (!allowSecondPoint) {
      // Remplacer iso1 par le nouveau point
      setCenterPoint(e.latlng, 'iso1');
      showNotification('First location updated! (single mode)', 'info');
    } else {
      showNotification('Both locations already set. Clear map to set new locations', 'info');
    }
  });

}



const addSecondPointBtn = document.getElementById('add-second-point-btn');
const secondLocationSettings = document.getElementById('second-location-settings');

addSecondPointBtn.addEventListener('click', () => {
  allowSecondPoint = !allowSecondPoint;
  
  if (allowSecondPoint) {
    secondLocationSettings.style.display = 'block';  // <-- here
    showNotification('Second location enabled!', 'success');
    addSecondPointBtn.textContent = 'Remove Second Location';
  } else {
    secondLocationSettings.style.display = 'none';  // <-- here
    clearSecondLocation();
    showNotification('Second location disabled!', 'info');
    addSecondPointBtn.textContent = 'Add Second Location';
  }
});


function clearSecondLocation() {
  if (centerMarkers.iso2) {
    map.removeLayer(centerMarkers.iso2);
    centerMarkers.iso2 = null;
  }
  if (currentIsochrones.iso2) {
    map.removeLayer(currentIsochrones.iso2);
    currentIsochrones.iso2 = null;
  }
  if (currentIsochrones.intersection) {
    map.removeLayer(currentIsochrones.intersection);
    currentIsochrones.intersection = null;
  }
  if (currentIsochrones.union) {
    map.removeLayer(currentIsochrones.union);
    currentIsochrones.union = null;
  }
  
  document.getElementById('address-search-2').value = '';
}


  

function initGeocoders() {
  const searchConfigs = [
    { inputId: 'address-search', helperId: 'search-helper', isoType: 'iso1' },
    { inputId: 'address-search-2', helperId: 'search-helper-2', isoType: 'iso2' }
  ];

  searchConfigs.forEach(({ inputId, helperId, isoType }) => {
    const inputElement = document.getElementById(inputId);
    const helperElement = document.getElementById(helperId);
    let searchTimeout;
    let currentResults = [];

    inputElement.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      clearTimeout(searchTimeout);

      if (query.length < 3) {
        helperElement.style.display = 'none';
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${CONFIG.MAPBOX_TOKEN}&limit=5&country=fr`);
          const data = await response.json();
          currentResults = data.features || [];
          displaySuggestions(currentResults);
        } catch (error) {
          console.error('Geocoding error:', error);
        }
      }, 300);
    });

    function displaySuggestions(features) {
      helperElement.innerHTML = '';
      features.forEach((feature) => {
        const item = document.createElement('div');
        item.className = 'search-helper-item';
        item.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${feature.place_name}`;

        item.addEventListener('click', () => {
          selectFeature(feature);
        });

        helperElement.appendChild(item);
      });
      helperElement.style.display = features.length > 0 ? 'block' : 'none';
    }

    function selectFeature(feature) {
      inputElement.value = feature.place_name;
      helperElement.style.display = 'none';
      const latLng = L.latLng(feature.center[1], feature.center[0]);
      setCenterPoint(latLng, isoType);
      map.setView(latLng, 15);
    }

    let selectedIndex = -1;
    inputElement.addEventListener('keydown', (e) => {
      const items = helperElement.querySelectorAll('.search-helper-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateHighlightedItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateHighlightedItem(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          items[selectedIndex].click();
        } else if (currentResults.length > 0) {
          selectFeature(currentResults[0]);
        }
      }
    });

    function updateHighlightedItem(items) {
      items.forEach((item, index) => {
        if (index === selectedIndex) {
          item.classList.add('highlighted');
        } else {
          item.classList.remove('highlighted');
        }
      });
    }

    // Hide helper on outside click
    document.addEventListener('click', (e) => {
      if (!inputElement.contains(e.target) && !helperElement.contains(e.target)) {
        helperElement.style.display = 'none';
      }
    });
  });
}


function createGeocoderHandler(inputElement, helperElement, isoType) {
  let searchTimeout;
  let currentResults = [];

  async function searchAddresses(query) {
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${CONFIG.MAPBOX_TOKEN}&limit=5&country=fr`);
      const data = await response.json();
      return data.features || [];
    } catch (error) {
      console.error('Geocoding error:', error);
      return [];
    }
  }

  function displaySuggestions(features) {
    helperElement.innerHTML = '';

    features.forEach((feature, index) => {
      const item = document.createElement('div');
      item.className = 'search-helper-item';
      item.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${feature.place_name}`;

      item.addEventListener('click', () => {
        selectFeature(feature);
      });

      helperElement.appendChild(item);
    });

    helperElement.style.display = features.length > 0 ? 'block' : 'none';
  }

  function selectFeature(feature) {
    inputElement.value = feature.place_name;
    helperElement.style.display = 'none';

    const latLng = L.latLng(feature.center[1], feature.center[0]);
    setCenterPoint(latLng, isoType);
    map.setView(latLng, 15);
  }

  inputElement.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);

    if (query.length < 3) {
      helperElement.style.display = 'none';
      return;
    }

    searchTimeout = setTimeout(async () => {
      currentResults = await searchAddresses(query);
      displaySuggestions(currentResults);
    }, 300);
  });

  let selectedIndex = -1;

  inputElement.addEventListener('keydown', (e) => {
    const items = helperElement.querySelectorAll('.search-helper-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateHighlightedItem(items);
    } 
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateHighlightedItem(items);
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].click();
      } else if (currentResults.length > 0) {
        selectFeature(currentResults[0]);
      }
    }
  });
  
  function updateHighlightedItem(items) {
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('highlighted');
      } else {
        item.classList.remove('highlighted');
      }
    });
  }
  

  document.addEventListener('click', (e) => {
    if (!inputElement.contains(e.target) && !helperElement.contains(e.target)) {
      helperElement.style.display = 'none';
    }
  });
}



function setupEventListeners() {
  // Tab switching
// LEFT PANEL Tabs only
document.querySelectorAll('.left-panel .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.left-panel .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.left-panel .tab-content').forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('active');
  });
});






  // Panel toggle
  document.getElementById('toggle-panel').addEventListener('click', () => {
    const panel = document.querySelector('.controls');
    const toggleBtn = document.getElementById('toggle-panel');
    const appContainer = document.querySelector('.app-container');
    
    panel.classList.toggle('hidden');
    toggleBtn.classList.toggle('active');
    appContainer.classList.toggle('panel-hidden');
    map.invalidateSize();
  });


  

  // Duration inputs for isochrone 1
  document.getElementById('duration-iso1').addEventListener('input', (e) => {
    const value = e.target.value;
    document.getElementById('duration-input-iso1').value = value;
    updateSliderColor(e.target, value);
  });

  // Duration inputs for isochrone 2
  document.getElementById('duration-iso2').addEventListener('input', (e) => {
    const value = e.target.value;
    document.getElementById('duration-input-iso2').value = value;
    updateSliderColor(e.target, value);
  });

  // Transport mode buttons
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.transport-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('transport-mode').value = btn.dataset.mode;
    });
  });

  // Display mode buttons
  document.getElementById('display-jobs').addEventListener('click', () => {
    currentDisplayMode = 'jobs';
    updateDisplayMode();
    if (currentResults.length > 0) displayResults(currentResults);
  });

  document.getElementById('display-housing').addEventListener('click', () => {
    currentDisplayMode = 'housing';
    updateDisplayMode();
    if (currentResults.length > 0) displayResults(currentResults);
  });

  document.getElementById('display-both').addEventListener('click', () => {
    currentDisplayMode = 'both';
    updateDisplayMode();
    if (currentResults.length > 0) displayResults(currentResults);
  });

  // Zone mode selector
  document.getElementById('zone-mode').addEventListener('change', (e) => {
    currentZoneMode = e.target.value;
    updateIsochroneVisibility();
    if (currentResults.length > 0) {
      currentResults = filterResultsByZone(currentDisplayMode);
      displayResults(currentResults);
    }
  });

  // Generate button
  document.getElementById('generate-btn').addEventListener('click', async () => {
    if (!centerMarkers.iso1) {
      const inputAddress = document.getElementById('address-search').value.trim();
      if (inputAddress.length >= 3) {
        try {
          const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(inputAddress)}.json?access_token=${CONFIG.MAPBOX_TOKEN}&limit=1&country=fr`);
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            const latLng = L.latLng(data.features[0].center[1], data.features[0].center[0]);
            setCenterPoint(latLng, 'iso1');
          }
        } catch (error) {
          console.error('Error resolving address before generate:', error);
        }
      }
    }
  
    if (centerMarkers.iso1) {
      const generateBtn = document.getElementById('generate-btn');
      const generateText = document.getElementById('generate-text');
      const generateSpinner = document.getElementById('generate-spinner');
  
      // Show loading state
      generateBtn.disabled = true;
      generateText.textContent = 'Generating...';
      generateSpinner.style.display = 'block';
  
      try {
        const options = getCurrentOptions();
  
        let lastGenerated = 'iso1';
  
        const duration1 = parseInt(document.getElementById('duration-iso1').value);
        const isochrone1 = await generateIsochrone(centerMarkers.iso1.getLatLng(), {...options, duration: duration1}, 'iso1');
  
        let isochrone2 = null;
        if (centerMarkers.iso2) {
          const duration2 = parseInt(document.getElementById('duration-iso2').value);
          isochrone2 = await generateIsochrone(centerMarkers.iso2.getLatLng(), {...options, duration: duration2}, 'iso2');
          lastGenerated = 'iso2';
          calculateIntersectionAndUnion(isochrone1, isochrone2);
        }
  
        // === Maintenant la vraie partie importante ===
        switchZone(lastGenerated);
  
        updateIsochroneVisibility();
        updateDisplayedMarkers(); // <- 🔥 très important
        currentResults = filterResultsByZone(currentDisplayMode);
        displayResults(currentResults);
        updateMarkerAppearance();
  
        showNotification('Area generated successfully!', 'success');
  




        

        
      } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to generate area', 'error');
      } finally {
        generateBtn.disabled = false;
        generateText.textContent = 'Generate Area';
        generateSpinner.style.display = 'none';
      }
  
    } else {
      showNotification('Please set at least one location first', 'error');
    }
  });
  
  

  // Save button
  document.getElementById('save-btn').addEventListener('click', async () => {
    if (!centerMarkers.iso1) {
      showNotification('Please set at least one location first', 'error');
      return;
    }

    const addressInput = document.getElementById('address-search').value.trim();
    const name = addressInput || await getAddressFromCoordinates(centerMarkers.iso1.getLatLng());
    
    const options = getCurrentOptions();
    const newMap = {
      id: Date.now().toString(),
      name: name,
      centers: {
        iso1: centerMarkers.iso1 ? [centerMarkers.iso1.getLatLng().lat, centerMarkers.iso1.getLatLng().lng] : null,
        iso2: centerMarkers.iso2 ? [centerMarkers.iso2.getLatLng().lat, centerMarkers.iso2.getLatLng().lng] : null
      },
      options: options,
      createdAt: new Date().toISOString()
    };
    
    savedMaps.push(newMap);
    saveMapsToLocalStorage();
    initSavedMaps();
    showNotification('Area saved successfully!', 'success');
  });

  // Load button
  document.getElementById('load-btn').addEventListener('click', async () => {
    const selectedId = document.getElementById('saved-maps').value;
    if (!selectedId) {
      showNotification('Please select a saved area to load', 'error');
      return;
    }
    
    try {
      const mapData = savedMaps.find(m => m.id === selectedId);
      if (mapData) {
        // Clear existing markers and isochrones
        clearMap();
        
        // Load first center if exists
        if (mapData.centers.iso1) {
          const latLng1 = L.latLng(mapData.centers.iso1[0], mapData.centers.iso1[1]);
          setCenterPoint(latLng1, 'iso1');
        }
        
        // Load second center if exists
        if (mapData.centers.iso2) {
          const latLng2 = L.latLng(mapData.centers.iso2[0], mapData.centers.iso2[1]);
          setCenterPoint(latLng2, 'iso2');
        }
        
        // Update UI to match loaded settings
        document.getElementById('duration-iso1').value = mapData.options.duration;
        document.getElementById('duration-input-iso1').value = mapData.options.duration;
        document.getElementById('transport-mode').value = mapData.options.transportMode;
        
        // Update active transport button
        document.querySelectorAll('.transport-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.transport-btn[data-mode="${mapData.options.transportMode}"]`).classList.add('active');
        
        // Generate isochrones
        if (mapData.centers.iso1) {
          const isochrone1 = await generateIsochrone(L.latLng(mapData.centers.iso1[0], mapData.centers.iso1[1]), mapData.options, 'iso1');
          
          if (mapData.centers.iso2) {
            const isochrone2 = await generateIsochrone(L.latLng(mapData.centers.iso2[0], mapData.centers.iso2[1]), mapData.options, 'iso2');
            calculateIntersectionAndUnion(isochrone1, isochrone2);
          }
        }
        
        // Display results
        currentResults = filterResultsByZone(mapData.options.searchMode);
        displayResults(currentResults);
        
        showNotification('Area loaded successfully!', 'success');
        document.querySelector('[data-tab="results-tab"]').click();
      }
    } catch (error) {
      console.error('Error loading area:', error);
      showNotification('Failed to load area', 'error');
    }
  });

  // Delete button
  document.getElementById('delete-btn').addEventListener('click', async () => {
    const selectedId = document.getElementById('saved-maps').value;
    if (!selectedId) {
      showNotification('Please select a saved area to delete', 'error');
      return;
    }
    
    if (confirm("Are you sure you want to delete this saved area?")) {
      try {
        savedMaps = savedMaps.filter(m => m.id !== selectedId);
        saveMapsToLocalStorage();
        initSavedMaps();
        showNotification('Area deleted successfully', 'success');
      } catch (error) {
        console.error('Error deleting area:', error);
        showNotification('Failed to delete area', 'error');
      }
    }
  });

  // Clear map button
  document.getElementById('clear-map-btn').addEventListener('click', () => {
    clearMap();
    showNotification('Map cleared', 'info');
  });

  // Results sorting
  document.getElementById('results-sort').addEventListener('change', (e) => {
    if (currentResults.length > 0) {
      const sortedResults = sortResults(currentResults, e.target.value);
      displayResults(sortedResults);
    }
  });

  // POI'S
  document.getElementById('load-pois-btn').addEventListener('click', loadPOIs);

    // API France Travail
  document.getElementById('job-btn').addEventListener('click', loadJobsByKeyword);

  

}

function updateSliderColor(slider, value) {
  slider.classList.remove('duration-5', 'duration-15', 'duration-30', 'duration-45', 'duration-60');
  if (value <= 10) slider.classList.add('duration-5');
  else if (value <= 20) slider.classList.add('duration-15');
  else if (value <= 35) slider.classList.add('duration-30');
  else if (value <= 50) slider.classList.add('duration-45');
  else slider.classList.add('duration-60');
}

function clearMap() {
  // Clear isochrones
  Object.values(currentIsochrones).forEach(iso => {
    if (iso) map.removeLayer(iso);
  });
  currentIsochrones = {
    iso1: null,
    iso2: null,
    intersection: null,
    union: null
  };
  
  // Clear markers
  Object.values(centerMarkers).forEach(marker => {
    if (marker) map.removeLayer(marker);
  });
  centerMarkers = {
    iso1: null,
    iso2: null,
    poiLayerGroup:null,
    
  };
  
  markersLayer.clearLayers();
  currentResults = [];
  displayResults([]);
  
  // Reset all markers to their original appearance
  allMarkers.forEach(markerData => {
    const marker = markerData.marker;
    const iconElement = marker.getElement()?.querySelector('.marker-inner');
    if (iconElement) {
      iconElement.classList.remove('greyed-out');
    }
  });
  
  showAllMarkers();
}

// Avant tout : tableau pour stocker les labels
let isochroneLabels = [];

async function generateIsochrone(latlng, options, isoType) {
  const { duration, transportMode, departureTime } = options;

  // Gestion visuelle du chargement
  if (centerMarkers[isoType]) {
    const icon = centerMarkers[isoType].getElement();
    if (icon) icon.classList.add('pulse');
  }

  try {
    let data;
    if (transportMode === 'transit') {
      // === GEOAPIFY (TRANSPORT PUBLIC) ===
      const params = new URLSearchParams({
        lat: latlng.lat,
        lon: latlng.lng,
        type: 'time',
        mode: 'transit',
        range: duration * 60, // Conversion minutes -> secondes
        traffic: 'approximated',
        max_walking_time: 600, // 10 min de marche
        apiKey: CONFIG.GEOAPIFY_KEY
      });

      if (departureTime) params.set('datetime', new Date(departureTime).toISOString());

      const response = await fetch(`https://api.geoapify.com/v1/isoline?${params}`);
      data = await response.json();

      // Création de la couche
      if (currentIsochrones[isoType]) map.removeLayer(currentIsochrones[isoType]);
      currentIsochrones[isoType] = L.geoJSON(data, {
        style: {
          color: CONFIG.ISOCHRONE_COLORS[isoType],
          weight: 2,
          fillOpacity: 0.3,
          fillColor: CONFIG.ISOCHRONE_COLORS[isoType]
        }
      }).addTo(map);

    } else {
      // === MAPBOX (MARCHÉ/VÉLO/VOITURE) ===
      let contours = [duration];
      if (duration >= 15) {
        const d33 = Math.round(duration * 0.33);
        const d66 = Math.round(duration * 0.66);
        contours = [d33, d66, duration];
      }

      let url = `https://api.mapbox.com/isochrone/v1/mapbox/${transportMode}/${latlng.lng},${latlng.lat}?contours_minutes=${contours.join(',')}&polygons=true&access_token=${CONFIG.MAPBOX_TOKEN}`;
      if (departureTime) url += `&depart_at=${encodeURIComponent(departureTime)}`;

      const response = await fetch(url);
      data = await response.json();

      // Suppression anciennes couches
      if (currentIsochrones[isoType]) map.removeLayer(currentIsochrones[isoType]);
      isochroneLabels.forEach(label => map.removeLayer(label));
      isochroneLabels = [];

      // Style dynamique
      const colorScales = {
        iso1: ["#0d2d5c", "#1a5b9e", "#4a8fd7"],
        iso2: ["#6a1b6e", "#c5298a", "#ff7eb8"]  
      };

      currentIsochrones[isoType] = L.geoJSON(data, {
        style: (feature) => {
          const minutes = parseInt(feature.properties['contour']);
          let idx = contours.indexOf(minutes);
          if (idx === -1) idx = contours.length - 1;
          
          return {
            color: colorScales[isoType][idx],
            weight: 2,
            fillOpacity: 0.25,
            fillColor: colorScales[isoType][idx]
          };
        },
        onEachFeature: (feature, layer) => {
          const minutes = feature.properties['contour'];
          const coords = feature.geometry.coordinates[0];
          const northMost = coords.reduce((north, coord) => coord[1] > north[1] ? coord : north, coords[0]);
          
          const label = L.divIcon({
            className: 'isochrone-label',
            html: `<div style="background: rgba(255,255,255,0.7); padding: 2px 8px; border-radius: 6px; font-size: 11px; color: #333;">
                    ${minutes} min
                  </div>`,
            iconSize: [50, 20]
          });

          const smartLatLng = findBestLabelPosition(L.latLng(northMost[1], northMost[0]), 100, markersLayer);
          const labelMarker = L.marker(smartLatLng, { icon: label }).addTo(map);
          isochroneLabels.push(labelMarker);
        }
      }).addTo(map);
    }

    // Animation et zoom
    map.fitBounds(currentIsochrones[isoType].getBounds(), { padding: [30, 0] });
    
    const ping = L.circle(latlng, {
      radius: 100,
      fillColor: CONFIG.ISOCHRONE_COLORS[isoType],
      color: '#fff',
      fillOpacity: 0.8
    }).addTo(map);

    setTimeout(() => map.removeLayer(ping), 1000);
    updateMarkerAppearance();

    return data;

  } catch (error) {
    console.error('Erreur génération isochrone:', error);
    throw error;
  } finally {
    if (centerMarkers[isoType]) {
      const icon = centerMarkers[isoType].getElement();
      if (icon) icon.classList.remove('pulse');
    }
  }
}






function calculateIntersectionAndUnion(iso1Data, iso2Data) {
  try {
    // Remove existing intersection and union layers
    if (currentIsochrones.intersection) map.removeLayer(currentIsochrones.intersection);
    if (currentIsochrones.union) map.removeLayer(currentIsochrones.union);
    
    // Calculate intersection
    const intersection = turf.intersect(iso1Data.features[0], iso2Data.features[0]);
    if (intersection) {
      currentIsochrones.intersection = L.geoJSON(intersection, {
        style: {
          color: '#9c27b0',
          weight: 2,
          fillOpacity: 0.3,
          fillColor: '#9c27b0'
        }
      }).addTo(map);
    }
    
    // Calculate union
    const union = turf.union(iso1Data.features[0], iso2Data.features[0]);
    if (union) {
      currentIsochrones.union = L.geoJSON(union, {
        style: {
          color: '#4caf50',
          weight: 2,
          fillOpacity: 0.15,
          fillColor: '#4caf50'
        }
      }).addTo(map);
    }
    
    updateIsochroneVisibility();
    updateMarkerAppearance();
  } catch (error) {
    console.error('Error calculating intersection/union:', error);
  }
}

// Variable globale pour savoir si l'utilisateur veut voir toutes les couches
let showAllLayers = false; // ou false par défaut

function updateIsochroneVisibility() {
  // 🔥 Nettoyer les anciennes couches
  Object.values(currentIsochrones).forEach(layer => {
    if (layer) map.removeLayer(layer);
  });
  if (currentIsochrones._tempLargestLayer) {
    map.removeLayer(currentIsochrones._tempLargestLayer);
    delete currentIsochrones._tempLargestLayer;
  }

  if (showAllLayers) {
    if (currentIsochrones.iso1) map.addLayer(currentIsochrones.iso1);
    if (currentIsochrones.iso2) map.addLayer(currentIsochrones.iso2);
    if (currentIsochrones.intersection) map.addLayer(currentIsochrones.intersection);
    if (currentIsochrones.union) map.addLayer(currentIsochrones.union);
  } else {
    let sourceLayer = null;
    let color = '#4a6bff'; // bleu par défaut

    if (currentZoneMode === 'iso1' && currentIsochrones.iso1) {
      sourceLayer = currentIsochrones.iso1;
      color = '#4a6bff';
    } else if (currentZoneMode === 'iso2' && currentIsochrones.iso2) {
      sourceLayer = currentIsochrones.iso2;
      color = '#ff6b9e';
    } else if (currentZoneMode === 'intersection' && currentIsochrones.intersection) {
      sourceLayer = currentIsochrones.intersection;
      color = '#9c27b0';
    } else if (currentZoneMode === 'union' && currentIsochrones.union) {
      sourceLayer = currentIsochrones.union;
      color = '#4caf50';
    }

    if (sourceLayer) {
      const geojson = sourceLayer.toGeoJSON();
      let largestFeature = null;

      if (geojson.features && geojson.features.length > 1) {
        largestFeature = geojson.features.reduce((largest, f) => {
          return parseInt(f.properties?.contour || 0) > parseInt(largest.properties?.contour || 0) ? f : largest;
        }, geojson.features[0]);
      } else if (geojson.features && geojson.features.length === 1) {
        largestFeature = geojson.features[0];
      } else if (geojson.type === 'Feature') {
        largestFeature = geojson;
      }

      if (largestFeature) {
        currentIsochrones._tempLargestLayer = L.geoJSON(largestFeature, {
          style: {
            color: color,
            fillColor: color,
            weight: 2,
            fillOpacity: 0.3
          }
        }).addTo(map);
      }
    }
  }

  // 🎯 Cacher ou afficher les légendes d'isochrone selon le mode
  isochroneLabels.forEach(label => {
    if (label && label.getElement) {
      const el = label.getElement();
      if (el) {
        el.classList.add('isochrone-label-fade'); // Toujours ajouter la classe pour activer transition
        if (showAllLayers) {
          el.classList.remove('isochrone-label-hidden');
        } else {
          el.classList.add('isochrone-label-hidden');
        }
      }
    }
  });
  
}





function updateDisplayMode() {
  document.getElementById('display-jobs').classList.remove('active');
  document.getElementById('display-housing').classList.remove('active');
  document.getElementById('display-both').classList.remove('active');
  document.getElementById(`display-${currentDisplayMode}`).classList.add('active');
  showAllMarkers();
}

async function getAddressFromCoordinates(latlng) {
  try {
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${latlng.lng},${latlng.lat}.json?access_token=${CONFIG.MAPBOX_TOKEN}`);
    const data = await response.json();
    return data.features[0]?.place_name || 'Custom Location';
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return 'Custom Location';
  }
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = 'notification';
  notification.classList.add(type, 'show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function getCurrentOptions() {
  return {
    duration: parseInt(document.getElementById('duration-iso1').value),
    transportMode: document.getElementById('transport-mode').value,
    searchMode: currentDisplayMode,
    departureTime: document.getElementById('departure-time').value || null
  };
}

function setCenterPoint(latlng, isoType) {
  if (centerMarkers[isoType]) map.removeLayer(centerMarkers[isoType]);
  
  centerMarkers[isoType] = L.marker(latlng, {
    icon: L.divIcon({
      className: 'center-marker',
      html: `<div style="background:${CONFIG.ISOCHRONE_COLORS[isoType]}; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:12px;"><i class="fas fa-map-marker-alt"></i></div>`,
      iconSize: [24, 24],
      className: `center-marker-${isoType}`
    })
  }).addTo(map);
  
  // Update address field if empty
  if (isoType === 'iso1' && !document.getElementById('address-search').value) {
    getAddressFromCoordinates(latlng).then(address => {
      document.getElementById('address-search').value = address;
    });
  } else if (isoType === 'iso2' && !document.getElementById('address-search-2').value) {
    getAddressFromCoordinates(latlng).then(address => {
      document.getElementById('address-search-2').value = address;
    });
  }
}

function saveMapsToLocalStorage() {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(savedMaps));
}

function loadMapsFromLocalStorage() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
}

function initSavedMaps() {
  try {
    savedMaps = loadMapsFromLocalStorage();
    const select = document.getElementById('saved-maps');
    
    // Clear existing options (keep first placeholder)
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    // Add saved maps
    savedMaps.forEach(map => {
      const option = document.createElement('option');
      option.value = map.id;
      option.text = `${map.name} - ${map.options.transportMode} (${map.options.duration} min)`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading saved maps:', error);
    showNotification('Failed to load saved areas', 'error');
  }
}

async function loadData(keyword = "consultant") {
  try {
    const jobsResponse = await fetch(`https://france-travail-api.onrender.com/jobs?keyword=${encodeURIComponent(keyword)}&max_results=5000`);
    
    if (!jobsResponse.ok) throw new Error(`API request failed: ${jobsResponse.status}`);
    
    const rawJobs = await jobsResponse.json();
    jobsData = rawJobs
      .filter(job => job.lat && job.lng && job.lat !== 0 && job.lng !== 0)
      .map(job => ({
        id: job.id,
        title: job.title || "Titre non précisé",
        company: job.company || "Entreprise non précisée",
        lat: job.lat,
        lng: job.lng,
        address: job.address || "Adresse non précisée",
        salary: job.salary || "Salaire non précisé",
        position: job.position || job.type || "Non précisé",
        imageUrl: job.imageUrl || 'default-job.png',
        suburb: job.suburb || job.address?.split('-').pop()?.trim() || "Paris"
      }));

    const housingResponse = await fetch('housing.json');
    if (!housingResponse.ok) throw new Error(`Failed housing.json: ${housingResponse.status}`);
    housingData = await housingResponse.json();

    console.log('Jobs data:', jobsData);
    console.log('Housing data:', housingData);

    createAllMarkers();
    showAllMarkers();

  } catch (error) {
    console.error('Error:', error);
    showNotification('Failed to load data: ' + error.message, 'error');
  }
}

function createAllMarkers() {
    markersLayer.clearLayers();
    allMarkers = [];
  
    // Add job markers with validation
    jobsData.forEach(job => {
      try {
        if (!job.lat || !job.lng) {
          throw new Error('Missing coordinates');
        }
        
        const marker = L.marker([job.lat, job.lng], {
          icon: L.divIcon({
            className: 'job-marker',
            html: `<div class="marker-inner" style="background-color: #34a853;">
                    <i class="fas fa-briefcase"></i>
                  </div>`,
            iconSize: [24, 24]
          })
        }).bindPopup(createJobPopup(job));
        
        allMarkers.push({
          type: 'job',
          marker: marker,
          data: job
        });
        
      } catch (error) {
        console.warn('Invalid job entry:', job, error);
      }
    });

  // Add housing markers
  housingData.forEach(home => {
    if (!home.lat || !home.lng) {
      console.warn('Invalid housing data (missing coordinates):', home);
      return;
    }
    
    const marker = L.marker([parseFloat(home.lat), parseFloat(home.lng)], {
      icon: L.divIcon({
        className: 'housing-marker',
        html: '<div class="marker-inner" style="background-color: #4285f4;"><i class="fas fa-home"></i></div>',
        iconSize: [24, 24]
      }),
      riseOnHover: true
    }).bindPopup(createHousingPopup(home));
    
    allMarkers.push({
      type: 'housing',
      marker: marker,
      data: home
    });
  });

  console.log('Created markers:', allMarkers.length, 'total markers');
}

function showAllMarkers() {
  markersLayer.clearLayers();
  allMarkers.forEach(({ marker, type }) => {
    if (currentDisplayMode === 'both' || 
        (currentDisplayMode === 'jobs' && type === 'job') || 
        (currentDisplayMode === 'housing' && type === 'housing')) {
      markersLayer.addLayer(marker);
    }
  });
}

function createJobPopup(job) {
  return `
    <div class="popup-content">
      <div class="popup-header">
        <img src="${job.imageUrl}" class="popup-logo">
        <div>
          <h4>${job.title}</h4>
          <p class="company">${job.company}</p>
        </div>
      </div>
      <div class="popup-details">
        <p><i class="fas fa-map-marker-alt"></i> ${job.address}</p>
        <p><i class="fas fa-euro-sign"></i> ${job.salary}</p>
        <p><i class="fas fa-clock"></i> ${job.position}</p>
        <p><i class="fas fa-building"></i> ${job.suburb}</p>
      </div>
    </div>
  `;
}

function createHousingPopup(home) {
  return `
    <div class="popup-content">
      <div class="popup-header">
        <img src="${home.imageUrl}" class="popup-image">
        <div>
          <h4>${home.title}</h4>
          <p class="type">${home.type} · ${home.bedrooms} bed · ${home.bathrooms} bath</p>
        </div>
      </div>
      <div class="popup-details">
        <p><i class="fas fa-map-marker-alt"></i> ${home.address}</p>
        <p><i class="fas fa-euro-sign"></i> ${home.price}</p>
        <p><i class="fas fa-building"></i> ${home.suburb}</p>
      </div>
    </div>
  `;
}

function filterResultsByZone(searchType) {
  const activeZone = currentZoneMode;
  
  if (!currentIsochrones.iso1) return [];
  
  const results = allMarkers
    .filter(item => searchType === 'both' || item.type === searchType)
    .map(item => {
      try {
        const latLng = item.marker.getLatLng();
        const point = turf.point([latLng.lng, latLng.lat]);
        
        let isWithin = false;
        let distance = 0;
        
        if (activeZone === 'iso1') {
          isWithin = turf.booleanPointInPolygon(point, currentIsochrones.iso1.toGeoJSON().features[0]);
          distance = getDistance([latLng.lat, latLng.lng], 
                               [centerMarkers.iso1.getLatLng().lat, centerMarkers.iso1.getLatLng().lng]);
        } 
        else if (activeZone === 'iso2' && currentIsochrones.iso2) {
          isWithin = turf.booleanPointInPolygon(point, currentIsochrones.iso2.toGeoJSON().features[0]);
          distance = getDistance([latLng.lat, latLng.lng], 
                               [centerMarkers.iso2.getLatLng().lat, centerMarkers.iso2.getLatLng().lng]);
        }
        else if (activeZone === 'intersection' && currentIsochrones.intersection) {
          isWithin = turf.booleanPointInPolygon(point, currentIsochrones.intersection.toGeoJSON().features[0]);
          distance = getDistance([latLng.lat, latLng.lng], 
                               [centerMarkers.iso1.getLatLng().lat, centerMarkers.iso1.getLatLng().lng]);
        }
        else if (activeZone === 'union' && currentIsochrones.union) {
          isWithin = turf.booleanPointInPolygon(point, currentIsochrones.union.toGeoJSON().features[0]);
          distance = getDistance([latLng.lat, latLng.lng], 
                               [centerMarkers.iso1.getLatLng().lat, centerMarkers.iso1.getLatLng().lng]);
        }
        
        return {
          ...item.data,
          isWithinZone: isWithin,
          distance: distance,
          transportType: 'other'
        };
      } catch (e) {
        console.error('Error checking point in polygon:', e);
        return {
          ...item.data,
          isWithinZone: false,
          distance: 0
        };
      }
    })
    .filter(item => item.isWithinZone)
    .slice(0, CONFIG.MAX_RESULTS);
    
  return results;
}

function updateMarkerAppearance() {
  allMarkers.forEach(markerData => {
    try {
      const marker = markerData.marker;
      const latLng = marker.getLatLng();
      const point = turf.point([latLng.lng, latLng.lat]);
      
      let isWithin = false;
      
      if (currentZoneMode === 'iso1' && currentIsochrones.iso1) {
        isWithin = turf.booleanPointInPolygon(point, currentIsochrones.iso1.toGeoJSON().features[0]);
      } 
      else if (currentZoneMode === 'iso2' && currentIsochrones.iso2) {
        isWithin = turf.booleanPointInPolygon(point, currentIsochrones.iso2.toGeoJSON().features[0]);
      }
      else if (currentZoneMode === 'intersection' && currentIsochrones.intersection) {
        isWithin = turf.booleanPointInPolygon(point, currentIsochrones.intersection.toGeoJSON().features[0]);
      }
      else if (currentZoneMode === 'union' && currentIsochrones.union) {
        isWithin = turf.booleanPointInPolygon(point, currentIsochrones.union.toGeoJSON().features[0]);
      }
      
      const iconElement = marker.getElement();
      
      if (iconElement) {
        const innerElement = iconElement.querySelector('.marker-inner');
        if (innerElement) {
          if (isWithin) {
            innerElement.classList.remove('greyed-out');
            // Reset to original color based on type
            if (markerData.type === 'job') {
              innerElement.style.backgroundColor = '#34a853'; // Job green
            } else {
              innerElement.style.backgroundColor = '#4285f4'; // Housing blue
            }
          } else {
            innerElement.classList.add('greyed-out');
          }
        }
      }
    } catch (error) {
      console.error('Error updating marker appearance:', error);
    }
  });
}

function displayResults(results) {
  const resultsList = document.getElementById(`${type}-results-list`);
if (!resultsList) {
  console.error("resultsList element not found for type:", type);
  return;
}

  const resultsCount = document.getElementById('results-count');
  
  resultsCount.textContent = results.length;
  
  if (results.length === 0) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-map-marker-alt"></i>
        <p>No results found in this area</p>
      </div>
    `;
    return;
  }
  
  resultsList.innerHTML = '';
  
  results.forEach(result => {
    const wrapper = document.createElement(result.url ? 'a' : 'div');
    wrapper.className = 'result-item within-zone';
    if (result.url) {
      wrapper.href = result.url;
      wrapper.target = '_blank';
    }

    wrapper.innerHTML = `
      <div class="result-content">
        <div class="result-image">
          <img src="${result.imageUrl || 'default.jpg'}" alt="${result.company}">
        </div>
        <div class="result-details">
          <h4>${result.title}</h4>
          <p class="company">${result.company}</p>
          <p class="type">${result.type}</p>
          <div class="result-meta">
            <span><i class="fas fa-map-marker-alt"></i> ${result.location}</span>
            <span><i class="fas fa-clock"></i> ${result.duration || 'N/A'} mins</span>
          </div>
        </div>
      </div>
    `;

    resultsList.appendChild(wrapper);
  });
}function getDistance(point1, point2) {
  // Haversine distance calculation
  const R = 6371e3; // Earth radius in meters
  const φ1 = point1[0] * Math.PI/180;
  const φ2 = point2[0] * Math.PI/180;
  const Δφ = (point2[0]-point1[0]) * Math.PI/180;
  const Δλ = (point2[1]-point1[1]) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

function sortResults(results, sortBy) {
  return [...results].sort((a, b) => {
    switch (sortBy) {
      case 'distance':
        return a.distance - b.distance;
      case 'price':
        const priceA = parseFloat(a.salary ? a.salary.replace(/[^\d]/g, '') : a.price.replace(/[^\d]/g, ''));
        const priceB = parseFloat(b.salary ? b.salary.replace(/[^\d]/g, '') : b.price.replace(/[^\d]/g, ''));
        return priceA - priceB;
      default:
        return 0;
    }
  });
}

function setCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
  
  const departureInput = document.getElementById('departure-time');
  if (departureInput) {
    departureInput.value = formatted;
  }
}

function setupFilters() {
  document.getElementById('apply-filters-btn').addEventListener('click', () => {
    const maxPrice = parseInt(document.getElementById('filter-price').value) || Infinity;
    const minBedrooms = parseInt(document.getElementById('filter-bedrooms').value) || 0;
    const minSalary = parseInt(document.getElementById('filter-salary').value) || 0;
    const contractType = document.getElementById('filter-contract').value;

    const filtered = currentResults.filter(item => {
      if (item.price && parseInt(item.price.replace(/[^\d]/g, '')) > maxPrice) return false;
      if (item.bedrooms && item.bedrooms < minBedrooms) return false;
      if (item.salary && parseInt(item.salary.replace(/[^\d]/g, '')) < minSalary) return false;
      if (contractType && item.position && !item.position.includes(contractType)) return false;
      return true;
    });

    displayResults(filtered);
  });
}



document.getElementById('share-map-btn').addEventListener('click', () => {
  // Récupérer les coordonnées actuelles et le zoom de la carte
  const center = map.getCenter();
  const zoom = map.getZoom();
  
  // Vérifier si l'isochrone est présent
  const isochrone1 = currentIsochrones.iso1 ? currentIsochrones.iso1.toGeoJSON() : null;
  const isochrone2 = currentIsochrones.iso2 ? currentIsochrones.iso2.toGeoJSON() : null;

  // Créer un objet de l'état de la carte
  const mapState = {
    lat: center.lat,
    lng: center.lng,
    zoom: zoom,
    isochrone1: isochrone1,
    isochrone2: isochrone2
  };

  // Encoder l'état de la carte en tant que chaîne JSON et le transformer en base64
  const mapStateStr = btoa(JSON.stringify(mapState));

  // Créer le lien dynamique pour partager
  const mapLink = `https://ton-site.com/map.html?state=${mapStateStr}`;

  // Copier le lien dans le presse-papiers
  const el = document.createElement('textarea');
  el.value = mapLink;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);

  // Afficher une notification
  alert('Lien copié dans le presse-papiers !');
});

window.onload = function() {
  const urlParams = new URLSearchParams(window.location.search);
  const stateParam = urlParams.get('state');

  if (stateParam) {
    try {
      // Décoder l'état de la carte depuis l'URL
      const mapState = JSON.parse(atob(stateParam));

      // Récupérer les coordonnées et le zoom
      const { lat, lng, zoom, isochrone1, isochrone2 } = mapState;

      // Initialiser la carte avec les données de l'URL
      const map = L.map('map').setView([lat, lng], zoom);
      

      // Ajouter la carte
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      
      
      
      
      
      

      // Si l'isochrone est présent, l'ajouter à la carte
      if (isochrone1) {
        L.geoJSON(isochrone1, {
          style: { color: '#4a6bff', weight: 2, fillOpacity: 0.2 }
        }).addTo(map);
      }
      if (isochrone2) {
        L.geoJSON(isochrone2, {
          style: { color: '#ff6b9e', weight: 2, fillOpacity: 0.2 }
        }).addTo(map);
      }

      // Optionnel : ajouter d'autres éléments de la carte (par exemple, des markers, etc.)
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de la carte :', error);
    }
  } else {
    console.warn('Aucun état de carte trouvé dans l\'URL');
  }
};




// Fonction pour afficher les POIs dans la zone de l'isochrone
async function showPOIsInIsochrone(poiType) {
  const isoZone = getIsochroneArea(); // Obtenir la zone de l'isochrone actuelle (tu devras l'adapter selon ton implémentation)

  const pois = await searchPOIs(poiType, isoZone);

  // Supprimer les anciens marqueurs avant d'afficher les nouveaux
  markers.clearLayers();

  // Afficher les nouveaux POIs sur la carte
  pois.forEach(poi => {
    const { lat, lon, tags } = poi;
    const latLng = L.latLng(lat, lon);
    const marker = L.marker(latLng).addTo(markers);

    let popupContent = `<strong>${tags.name || 'Nom inconnu'}</strong><br>`;

    // Afficher l'URL du site si disponible
    if (tags.website) {
      popupContent += `<a href="${tags.website}" target="_blank">Site officiel</a>`;
    }

    // Ajouter une popup au marqueur
    marker.bindPopup(popupContent);
  });
}

// Fonction pour récupérer les POIs via Overpass API en fonction du type et de la zone de l'isochrone
async function fetchPOIs(poiType, isoZone) {
  const overpassUrl = 'https://overpass-api.de/api/interpreter';

  
  // Définir les tags OSM appropriés pour chaque type de POI
  const poiTags = {
    restaurant: { key: "amenity", value: "restaurant" },
    hotel: { key: "tourism", value: "hotel" },
    supermarket: { key: "shop", value: "supermarket" },
    pharmacy: { key: "amenity", value: "pharmacy" }
  };
  
  const tag = poiTags[poiType];
  if (!tag) return [];

  const query = `
    [out:json];
    (
      node["${tag.key}"="${tag.value}"](${isoZone});
      way["${tag.key}"="${tag.value}"](${isoZone});
      relation["${tag.key}"="${tag.value}"](${isoZone});
    );
    out body;
  `;
  
  const response = await fetch(overpassUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `data=${encodeURIComponent(query)}`
  });
  
  const data = await response.json();
  return data.elements;
}

// Fonction pour afficher les POIs récupérés sur la carte
function displayPOIsOnMap(pois) {
  markersLayer.clearLayers(); // Nettoyer anciens POIs

  pois.forEach(poi => {
    const { lat, lon, tags } = poi;
    if (!lat || !lon) return; // Sécurité si POI mal formé

    const latLng = L.latLng(lat, lon);

    // Dictionnaire POI ➔ icône et couleur
    const poiTypeIcons = {
      restaurant: { icon: 'fa-utensils', color: '#e74c3c' },   // Rouge
      hotel: { icon: 'fa-hotel', color: '#2980b9' },           // Bleu
      supermarket: { icon: 'fa-shopping-cart', color: '#27ae60' }, // Vert
      pharmacy: { icon: 'fa-plus-square', color: '#8e44ad' },  // Violet
      cafe: { icon: 'fa-coffee', color: '#f39c12' },            // Orange
      school: { icon: 'fa-school', color: '#3498db' },          // Bleu clair
      bank: { icon: 'fa-university', color: '#2c3e50' },       // Bleu foncé
    };

    // Trouver type de POI : on se base sur tags.amenity
    let poiType = tags?.amenity || tags?.shop || tags?.tourism || 'default';

    // S'il existe dans notre dictionnaire, sinon icône générique
    const iconInfo = poiTypeIcons[poiType] || { icon: 'fa-map-marker-alt', color: '#ff7f50' };

    const poiIcon = L.divIcon({
      className: 'poi-marker',
      html: `
        <div class="marker-inner" style="background-color: ${iconInfo.color};">
          <i class="fas ${iconInfo.icon}"></i>
        </div>
      `,
      iconSize: [24, 24]
    });

    const marker = L.marker(latLng, { icon: poiIcon });

    let popupContent = `<strong>${tags.name || 'Nom inconnu'}</strong><br>`;

    if (tags.website) {
      popupContent += `<a href="${tags.website}" target="_blank">Site officiel</a>`;
    }

    marker.bindPopup(popupContent);
    markersLayer.addLayer(marker);
  });
}





document.getElementById('load-pois-btn').addEventListener('click', async () => {
  const poiType = document.getElementById('poi-select').value;

  const currentZoneGeometry = getCurrentZoneGeometry();
  if (!currentZoneGeometry) {
    alert('Please generate an area first!');
    return;
  }

  // Transforme GeoJSON en poly-string pour Overpass
  const coordinates = currentZoneGeometry.geometry.coordinates[0];
  const polyString = coordinates.map(coord => `${coord[1]} ${coord[0]}`).join(' ');
  const isoZone = `poly:"${polyString}"`;

  try {
    const pois = await fetchPOIs(poiType, isoZone);
    displayPOIsOnMap(pois);
  } catch (error) {
    console.error('Erreur lors de la récupération des POIs :', error);
    alert('Erreur lors de la récupération des POIs');
  }
});

// === POI MARKERS ===
let poiLayerGroup = null;

// Fonction pour charger les POIs
async function loadPOIs() {
  const poiType = document.getElementById('poi-select').value;
  const currentZoneGeometry = getCurrentZoneGeometry();

  if (!currentZoneGeometry) {
    showNotification('Please generate an area first!', 'error');
    return;
  }

  // Spinner ou loading state
  const loadBtn = document.getElementById('load-pois-btn');
  loadBtn.disabled = true;
  loadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading POIs...`;

  // Transforme GeoJSON en poly-string pour Overpass API
  const coordinates = currentZoneGeometry.geometry.coordinates[0];
  const polyString = coordinates.map(coord => `${coord[1]} ${coord[0]}`).join(' ');
  const isoZone = `poly:"${polyString}"`;

  try {
    const pois = await fetchPOIs(poiType, isoZone);
    if (pois.length === 0) {
      showNotification('No POIs found for this category!', 'info');
    }
    displayPOIsOnMap(pois);
    showNotification(`Found ${pois.length} POIs`, 'success');
  } catch (error) {
    console.error('Erreur lors de la récupération des POIs:', error);
    showNotification('Error loading POIs!', 'error');
  } finally {
    loadBtn.disabled = false;
    loadBtn.innerHTML = `Load POIs`;
  }
}





function switchZone(mode) {
  currentZoneMode = mode;
  const zoneSelector = document.getElementById('zone-mode');
  
  if (zoneSelector) {
    zoneSelector.value = mode;
  }

  updateIsochroneVisibility();
  updateDisplayedMarkers();
}


function findBestLabelPosition(center, radiusMeters, avoidLayers) {
  const directions = [
    [0, 1],   // nord
    [1, 0],   // est
    [0, -1],  // sud
    [-1, 0],  // ouest
    [1, 1],   // nord-est
    [-1, 1],  // nord-ouest
    [1, -1],  // sud-est
    [-1, -1], // sud-ouest
  ];

  for (let dir of directions) {
    const offsetLat = dir[1] * radiusMeters / 111320;  // Approximation 1° ≈ 111.32 km
    const offsetLng = dir[0] * radiusMeters / (40075000 * Math.cos(center.lat * Math.PI / 180) / 360);

    const testLatLng = L.latLng(center.lat + offsetLat, center.lng + offsetLng);

    let collision = false;
    avoidLayers.eachLayer(layer => {
      if (layer.getLatLng && layer.getLatLng().distanceTo(testLatLng) < 50) { // 50m collision radius
        collision = true;
      }
    });

    if (!collision) {
      return testLatLng;
    }
  }

  // Aucun endroit parfait trouvé, utiliser la position initiale
  return center;
}



async function loadJobsByKeyword() {
  const keyword = document.getElementById('job-search').value.trim() || 'consultant';

  const jobBtn = document.getElementById('job-btn');
  const jobText = document.getElementById('job-text');
  const jobSpinner = document.getElementById('job-spinner');

  jobBtn.disabled = true;
  jobText.textContent = 'Chargement...';
  jobSpinner.style.display = 'inline-block';

  try {
    const response = await fetch(`https://france-travail-api.onrender.com/jobs?keyword=${encodeURIComponent(keyword)}&max_results=250`);
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);

    const rawJobs = await response.json();

    const allJobs = rawJobs
      .filter(job => job.lat && job.lng && job.lat !== 0 && job.lng !== 0)
      .map(job => ({
        id: job.id,
        title: job.title || "Titre non précisé",
        company: job.company || "Entreprise non précisée",
        lat: job.lat,
        lng: job.lng,
        address: job.address || "Adresse non précisée",
        salary: job.salary || "Salaire non précisé",
        position: job.position || job.type || "Non précisé",
        imageUrl: job.imageUrl || 'default-job.png',
        suburb: job.suburb || job.address?.split('-').pop()?.trim() || "Paris"
      }));

    // 🔥 Filtrage si une zone isochrone existe
    if (currentIsochrones.iso1 && centerMarkers.iso1) {
      jobsData = filterJobsByIsochrone1(allJobs);
      console.log(`Nombre d'offres dans l'isochrone : ${jobsData.length}`);
    } else {
      jobsData = allJobs;
    }

    createAllMarkers();
    showAllMarkers();
    currentResults = jobsData;
    displayResults(currentResults);

  } catch (error) {
    console.error('Error loading jobs by keyword:', error);
    showNotification('Échec du chargement des offres : ' + error.message, 'error');
  } finally {
    jobBtn.disabled = false;
    jobText.textContent = 'Rechercher les offres';
    jobSpinner.style.display = 'none';
  }
}



// Récupère la distance maximale de l'isochrone 1 pour l'API france travail

function filterJobsByIsochrone1(jobs) {
  if (!currentIsochrones.iso1 || !centerMarkers.iso1) return jobs;

  const polygon = currentIsochrones.iso1.toGeoJSON().features?.[0];
  if (!polygon) return jobs;

  return jobs.filter(job => {
    if (!job.lat || !job.lng) return false;
    const point = turf.point([job.lng, job.lat]);
    return turf.booleanPointInPolygon(point, polygon);
  });
  currentResults = jobsData;
updateDisplayedMarkers(); // <- met à jour les marqueurs sur la carte
displayResults(currentResults); // <- met à jour le panneau latéral
updateMarkerAppearance(); // <- applique les classes CSS (grisé ou non)
console.log('Jobs chargés:', allJobs.length);
console.log('Jobs dans l\'isochrone:', jobsData.length);

}






// app.js - Injection de données depuis profil.html

// app.js - Injection de données depuis profil.html avec déclenchement

// app.js - Injection depuis profil.html avec sécurité et ordonnancement

// app.js - Injection depuis profil.html avec sécurité, département et déclenchement dynamique

window.addEventListener("DOMContentLoaded", () => {
  const profileData = localStorage.getItem("habita-profile");

  if (profileData) {
    try {
      const profile = JSON.parse(profileData);

      const addressInput = document.getElementById("address-search");
      const durationRange = document.getElementById("duration-iso1");
      const durationInput = document.getElementById("duration-input-iso1");
      const transportBtns = document.querySelectorAll(".transport-btn");
      const jobInput = document.getElementById("job-search");
      const transportField = document.getElementById("transport-mode");
      const savedDepartement = profile.departement || "";

      if (addressInput && profile.address) addressInput.value = profile.address;
      if (durationRange && durationInput && profile.duration) {
        durationRange.value = profile.duration;
        durationInput.value = profile.duration;
      }
      if (transportBtns.length && profile.transport && transportField) {
        transportField.value = profile.transport;
        transportBtns.forEach(btn => {
          btn.classList.remove("active");
          if (btn.dataset.mode === profile.transport) btn.classList.add("active");
        });
      }
      if (jobInput && profile.job) jobInput.value = profile.job;

      // Déclenche la zone automatiquement
      setTimeout(() => {
        const generateBtn = document.getElementById("generate-btn");
        if (generateBtn && profile.address && profile.duration && profile.transport) {
          generateBtn.click();

          // Lance la recherche d'emploi (même sans mot-clé)
          setTimeout(() => {
            const jobBtn = document.getElementById("job-btn");
            const jobField = document.getElementById("job-search");
            if (jobBtn && jobField) {
              const query = jobField.value.trim();
              const dep = savedDepartement.trim();

              const params = new URLSearchParams();
              if (query.length > 0) params.append("motsCles", query);
              if (dep.length > 0) params.append("departement", dep);
              params.append("range", "0-10");

              fetch(`/api/offres?${params.toString()}`)
                .then(r => r.json())
                .then(data => {
                  console.log("Résultats France Travail:", data);
                  // TODO: injecter dans ton UI
                })
                .catch(err => console.error("Erreur offres:", err));
            }
          }, 1500);
        }
      }, 1000);

      localStorage.removeItem("habita-profile");
    } catch (e) {
      console.error("Erreur de traitement du profil:", e);
    }
  }
});

