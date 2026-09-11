/**
 * MapRenderer
 * Default mode needs NO API key: renders "Open in Google Maps" links
 * (https://www.google.com/maps?q=lat,lng) for every coordinate actually
 * extracted from source documents. If the user has configured a
 * restricted GOOGLE_MAPS_API_KEY in js/config.js, an embedded map with
 * markers is loaded instead. Only real, extracted coordinates are ever
 * plotted — never a village-name geocode, never a fabricated point.
 */
const MapRenderer = (() => {

  function pointsFromMatches(matches) {
    return matches
      .filter(m => m.bhuNaksha && m.bhuNaksha.coordinateAvailable)
      .map(m => ({
        lat: m.bhuNaksha.latitude,
        lng: m.bhuNaksha.longitude,
        plotNo: m.plot.plotNo,
        khataNo: m.plot.khataNo,
        holderName: m.plot.holderName || ''
      }));
  }

  function googleMapsLink(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  function renderLinks(container, points) {
    container.innerHTML = '';
    if (!points.length) {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = 'कोई सत्यापित निर्देशांक उपलब्ध नहीं (No verified coordinates available)';
      container.appendChild(p);
      return;
    }
    points.forEach(pt => {
      const a = document.createElement('a');
      a.href = googleMapsLink(pt.lat, pt.lng);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'map-link';
      a.textContent = `📍 खसरा ${pt.plotNo} · खाता ${pt.khataNo} — ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`;
      container.appendChild(a);
    });
  }

  let jsApiLoaded = false;
  function loadGoogleMapsJsApi(apiKey) {
    return new Promise((resolve, reject) => {
      if (jsApiLoaded && window.google && window.google.maps) return resolve();
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
      script.onload = () => { jsApiLoaded = true; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function renderEmbeddedMap(container, points, apiKey) {
    if (!points.length) return renderLinks(container, points);
    try {
      await loadGoogleMapsJsApi(apiKey);
      container.innerHTML = '';
      const mapDiv = document.createElement('div');
      mapDiv.style.width = '100%';
      mapDiv.style.height = '320px';
      mapDiv.style.borderRadius = '10px';
      container.appendChild(mapDiv);

      const map = new google.maps.Map(mapDiv, {
        center: { lat: points[0].lat, lng: points[0].lng },
        zoom: 15
      });
      points.forEach(pt => {
        const marker = new google.maps.Marker({
          position: { lat: pt.lat, lng: pt.lng },
          map,
          title: `खसरा ${pt.plotNo} · खाता ${pt.khataNo}`
        });
        const info = new google.maps.InfoWindow({
          content: `<strong>खसरा:</strong> ${pt.plotNo}<br><strong>खाता:</strong> ${pt.khataNo}<br>${pt.lat}, ${pt.lng}`
        });
        marker.addListener('click', () => info.open(map, marker));
      });
    } catch (e) {
      console.warn('Google Maps JS API failed to load, falling back to links.', e);
      renderLinks(container, points);
    }
  }

  function render(container, matches) {
    const points = pointsFromMatches(matches);
    const apiKey = (window.BHOOMITRACE_CONFIG && window.BHOOMITRACE_CONFIG.GOOGLE_MAPS_API_KEY) || '';
    if (apiKey) {
      renderEmbeddedMap(container, points, apiKey);
    } else {
      renderLinks(container, points);
    }
  }

  return { render, pointsFromMatches };
})();
