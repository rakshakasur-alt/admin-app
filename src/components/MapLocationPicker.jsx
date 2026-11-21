import { useEffect, useRef, useState } from 'react';

/**
 * MapLocationPicker
 * - Address search input with debounced place suggestions (Nominatim)
 * - Interactive Leaflet / OpenStreetMap container with draggable pinpoint marker
 * - Reverse geocoding on pin drag / map click
 * - Pure vanilla Leaflet loaded dynamically via CDN with zero build dependencies
 */
export default function MapLocationPicker({
  value = '',
  onChange,
  onCoordinatesChange,
  coordinates = { lat: 28.6139, lng: 77.2090 }, // Default New Delhi, India
  disabled = false,
  error = '',
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [coords, setCoords] = useState(coordinates);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync incoming value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Load Leaflet dynamically if not already loaded
  useEffect(() => {
    let isMounted = true;

    function initMap() {
      if (!isMounted || !mapContainerRef.current || !window.L) return;
      if (mapInstanceRef.current) return;

      try {
        const L = window.L;
        const initialLat = coords.lat || 28.6139;
        const initialLng = coords.lng || 77.2090;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 13,
          zoomControl: true,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        // Custom pin marker icon
        const pinIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `<div style="background:#2B1D17;color:#FAF6F0;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #FAF6F0;"><span style="transform:rotate(45deg);font-size:14px;">📍</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        });

        const marker = L.marker([initialLat, initialLng], {
          draggable: !disabled,
          icon: pinIcon,
        }).addTo(map);

        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          const newCoords = { lat: pos.lat, lng: pos.lng };
          setCoords(newCoords);
          if (onCoordinatesChange) onCoordinatesChange(newCoords);
          await reverseGeocode(pos.lat, pos.lng);
        });

        map.on('click', async (e) => {
          if (disabled) return;
          const { lat, lng } = e.latlng;
          marker.setLatLng([lat, lng]);
          const newCoords = { lat, lng };
          setCoords(newCoords);
          if (onCoordinatesChange) onCoordinatesChange(newCoords);
          await reverseGeocode(lat, lng);
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      } catch (err) {
        console.warn('[MapLocationPicker] Error initializing map:', err);
      }
    }

    if (window.L) {
      initMap();
    } else {
      // Inject Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        // Subresource Integrity: the browser refuses the file if the CDN copy changes.
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }
      // Inject Leaflet JS
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = 'anonymous';
        script.async = true;
        script.onload = () => {
          initMap();
        };
        document.head.appendChild(script);
      } else {
        const existingScript = document.getElementById('leaflet-js');
        existingScript.addEventListener('load', initMap);
      }
    }

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
      }
    };
  }, [disabled]);

  // Reverse geocode when pin moves
  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.display_name) {
        setQuery(data.display_name);
        if (onChange) onChange(data.display_name);
      }
    } catch (_) {}
  }

  // Handle address input typing & debounce place suggestions
  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    if (onChange) onChange(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!val || val.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoadingSuggestions(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val.trim())}&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (!res.ok) {
          setLoadingSuggestions(false);
          return;
        }
        const data = await res.json();
        setSuggestions(data || []);
        setShowDropdown(true);

        // Auto-center map pin to top matching result for typed address
        if (data && data.length > 0) {
          const topMatch = data[0];
          const lat = parseFloat(topMatch.lat);
          const lng = parseFloat(topMatch.lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            const newCoords = { lat, lng };
            setCoords(newCoords);
            if (onCoordinatesChange) onCoordinatesChange(newCoords);
            if (mapInstanceRef.current && markerRef.current) {
              mapInstanceRef.current.setView([lat, lng], 15);
              markerRef.current.setLatLng([lat, lng]);
            }
          }
        }
      } catch (_) {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 450);
  }

  // User clicked a suggested place
  function handleSelectSuggestion(item) {
    const displayName = item.display_name;
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);

    setQuery(displayName);
    setShowDropdown(false);
    setSuggestions([]);
    if (onChange) onChange(displayName);

    const newCoords = { lat, lng };
    setCoords(newCoords);
    if (onCoordinatesChange) onCoordinatesChange(newCoords);

    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([lat, lng], 15);
      markerRef.current.setLatLng([lat, lng]);
    }
  }

  // Forward geocode when user finishes typing or presses Enter
  async function handleGeocodeNow(addressText) {
    const target = (addressText || query || '').trim();
    if (!target || target.length < 3) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(target)}&limit=1&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.length > 0) {
        const topMatch = data[0];
        const lat = parseFloat(topMatch.lat);
        const lng = parseFloat(topMatch.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          const newCoords = { lat, lng };
          setCoords(newCoords);
          if (onCoordinatesChange) onCoordinatesChange(newCoords);
          if (mapInstanceRef.current && markerRef.current) {
            mapInstanceRef.current.setView([lat, lng], 15);
            markerRef.current.setLatLng([lat, lng]);
          }
        }
      }
    } catch (_) {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
        Hotel Address & Location
      </label>

      {/* Address Search Field */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          onBlur={() => handleGeocodeNow(query)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleGeocodeNow(query);
              setShowDropdown(false);
            }
          }}
          placeholder="Search street, area, city or pin on map..."
          disabled={disabled}
          autoComplete="street-address"
          style={{
            width: '100%',
            padding: '10px 36px 10px 14px',
            borderRadius: 'var(--radius)',
            border: `1px solid ${error ? 'var(--border)' : 'var(--border)'}`,
            background: 'var(--input-bg)',
            color: 'var(--input-fg)',
            fontSize: '14px',
            fontFamily: 'var(--font-body)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '16px',
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
          }}
        >
          {loadingSuggestions ? '⏳' : '📍'}
        </span>

        {/* Suggestions Dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            {suggestions.map((item, idx) => (
              <div
                key={item.place_id || idx}
                onClick={() => handleSelectSuggestion(item)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: idx < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: '13px',
                  fontFamily: 'var(--font-body)',
                  color: 'var(--text)',
                  lineHeight: 1.4,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 600 }}>{item.name || item.display_name.split(',')[0]}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.display_name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--text)', fontSize: '12px', marginTop: '2px', fontFamily: 'var(--font-body)' }}>
          {error}
        </div>
      )}

      {/* Interactive Pinpoint Map */}
      <div style={{ marginTop: '4px' }}>
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '180px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            background: 'var(--bg-subtle)',
            position: 'relative',
          }}
        >
          {!mapReady && (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Interactive Map Loading…
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '4px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>Drag marker or click map to pinpoint table/restaurant</span>
          <span>
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
