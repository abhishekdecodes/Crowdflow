import { useState, useEffect, useRef, useCallback } from 'react';
import { useJsApiLoader, GoogleMap, Marker, DirectionsRenderer, Autocomplete } from '@react-google-maps/api';
import { auth, db, logInWithGoogle, logOut } from './firebase'; 
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import './index.css';

// ── Image Compression Utility (Max 800px, 70% Quality) ────────
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; const MAX_HEIGHT = 800;
        let width = img.width; let height = img.height;
        
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
        else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
        
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Output compressed base64 JPEG format strictly
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl.replace('data:image/jpeg;base64,', '').replace(/^.+,/, ''));
      };
    };
  });
};

const mapContainerStyle = { width: '100%', height: '350px', borderRadius: '12px', marginTop: '1rem' };
const mapCenter = { lat: 18.5204, lng: 73.8567 };

// ── Smart offline chatbot ───────────────────────────────────────
const SMART_REPLIES = {
  default: [
    'Where is the nearest food stall?',
    'Which gate has least crowd?',
    'How long is the washroom queue?',
    'Best route to VIP parking?',
    'Any active incidents near me?',
  ],
  responses: {
    food: 'Food Stall B has the shortest queue — estimated 3 min wait.',
    gate: 'Gate 1 is at 45% capacity — least crowded. Gate 2 is at 85%.',
    washroom: 'Washroom Block B is nearly empty right now. Block A has 8 min wait.',
    parking: 'VIP Parking is at 60% capacity. Take the eastern corridor from Gate 3.',
    incident: 'No critical incidents near your location. Monitoring all zones.',
    route: 'Best path: Head to Section A via the western corridor. Avoid Gate 2 area.',
    crowd: 'Peak zones: Food Stall A (92%) and Parking (95%). Least busy: Washroom B.',
  }
};

const getSmartResponse = (msg) => {
  const l = msg.toLowerCase();
  if (l.includes('food') || l.includes('stall') || l.includes('eat')) return SMART_REPLIES.responses.food;
  if (l.includes('gate') || l.includes('entrance') || l.includes('exit')) return SMART_REPLIES.responses.gate;
  if (l.includes('washroom') || l.includes('toilet') || l.includes('restroom')) return SMART_REPLIES.responses.washroom;
  if (l.includes('parking') || l.includes('car')) return SMART_REPLIES.responses.parking;
  if (l.includes('incident') || l.includes('emergency') || l.includes('help')) return SMART_REPLIES.responses.incident;
  if (l.includes('route') || l.includes('path') || l.includes('direction')) return SMART_REPLIES.responses.route;
  if (l.includes('crowd') || l.includes('congestion') || l.includes('busy')) return SMART_REPLIES.responses.crowd;
  return 'I can help with crowd info, queue times, gate status, or navigation!';
};

// ── Slider content ─────────────────────────────────────────────
const SLIDER_MESSAGES = [
  { icon: '🏟️', text: 'Welcome to CrowdFlow — Smart Stadium Experience Platform' },
  { icon: '👨‍💻', text: 'Built by Dr. Abhishek | Cloud-Native AI Architecture' },
  { icon: '🤖', text: 'Powered by Google Vertex AI, Firebase & Cloud Run' },
  { icon: '📍', text: 'Real-time crowd tracking across all venue zones' },
  { icon: '🌐', text: 'Supporting 6 Indian Regional Languages via Cloud Translation' },
];

// ── Notification pool ──────────────────────────────────────────
const NOTIFICATION_POOL = [
  { type: 'warning', message: 'Exit Gate 2 is crowded — use Gate 5 instead' },
  { type: 'danger',  message: 'Gate 4 approaching full capacity (94%) — redirect now' },
  { type: 'success', message: 'Washroom Block B is now empty — 0 min wait' },
  { type: 'warning', message: 'Food Stall A: 15 min wait — try Stall C (2 min)' },
  { type: 'info',    message: 'VIP Parking Section 3 has 12 free spots available' },
  { type: 'danger',  message: 'Congestion at North Entrance — delay expected 8 mins' },
  { type: 'success', message: 'Gate 1 is now clear — crowd dropped to 22%' },
  { type: 'warning', message: 'Washroom Block A: 11 min wait — Block D is free' },
  { type: 'info',    message: 'Food Stall D now open — currently only 2 min wait' },
  { type: 'danger',  message: 'General Parking is full — use Overflow Zone B' },
  { type: 'success', message: 'Gate 6 now open — fast entry available' },
  { type: 'warning', message: 'Section 202 crowd surge detected — monitor area' },
  { type: 'info',    message: 'Shuttle service now running every 5 mins from Gate 3' },
  { type: 'success', message: 'Food Stall B restocked — wait time dropped to 3 min' },
  { type: 'danger',  message: 'Emergency alert: Medical team deployed to Block C' },
];

const randomNotifs = () => {
  const shuffled = [...NOTIFICATION_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((n, i) => ({
    ...n, id: i, time: i === 0 ? 'Just now' : `${i * 2} mins ago`, original: n.message
  }));
};

// ── Free translation helper ────────────────────────────────────
const translateText = async (text, lang) => {
  if (lang === 'en') return text;
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`
    );
    const d = await r.json();
    return d.responseData?.translatedText || text;
  } catch { return text; }
};

// ── Translate a whole object's string values ───────────────────
const translateObj = async (obj, lang) => {
  const entries = await Promise.all(
    Object.entries(obj).map(async ([k, v]) => [k, await translateText(String(v), lang)])
  );
  return Object.fromEntries(entries);
};

// ── Default UI labels ──────────────────────────────────────────
const DEFAULT_LABELS = {
  heatmapTitle: 'Real-Time Crowd Heatmap',
  navTitle: 'Navigation',
  originPlaceholder: 'Origin (leave blank for Pune center)',
  destPlaceholder: 'Destination — e.g. IMAX Pune, MG Road stadium',
  getDirections: 'Get Directions',
  calculating: 'Calculating Route...',
  notificationsTitle: 'Notifications',
  incidentTitle: 'Report Incident',
  incidentPlaceholder: 'Describe the incident...',
  incidentScanUpload: 'Scan & Upload Image',
  incidentScanning: 'Scanning & Uploading...',
  visionScanResult: 'Cloud Vision Scan Result',
  liveIncidentFeed: 'Live Incident Feed (Firestore)',
  noIncidents: 'No incidents reported.',
  adminTitle: 'Admin Dashboard',
  vertexAiLabel: 'Vertex AI Prediction',
  activeAttendeesLabel: 'Active Attendees',
  openIncidentsLabel: 'Open Incidents',
  signIn: 'Sign In',
  logout: 'Logout',
  chatGreeting: "Hi! I'm the CrowdFlow Assistant. Tap a quick question below or type your own!",
  chatPlaceholder: 'Ask about crowd, queue, route...',
  openChat: 'Open CrowdFlow AI Assistant',
  closeChat: 'Close assistant',
  sendMessage: 'Send message',
};

function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [isDark, setIsDark] = useState(true);

  // Map/Routing
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [cinemaName, setCinemaName] = useState('');
  const [isRouting, setIsRouting] = useState(false);
  const originRef = useRef(null);
  const destinationRef = useRef(null);

  // Translation
  const [lang, setLang] = useState('en');
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [sliderTexts, setSliderTexts] = useState(SLIDER_MESSAGES);
  const [notifications, setNotifications] = useState(randomNotifs);
  const [isTranslating, setIsTranslating] = useState(false);

  // Vision / Incident
  const [cameraCount, setCameraCount] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [visionResult, setVisionResult] = useState(null);
  const [liveIncidents, setLiveIncidents] = useState([]);

  // Chatbot
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatLog, setChatLog] = useState([{ sender: 'bot', text: DEFAULT_LABELS.chatGreeting }]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Heatmap
  const [locations, setLocations] = useState([
    { name: 'Entrance Gate 1', congestion: 45 },
    { name: 'Entrance Gate 2', congestion: 85 },
    { name: 'Food Stall A', congestion: 92 },
    { name: 'Food Stall B', congestion: 30 },
    { name: 'Washroom Block A', congestion: 78 },
    { name: 'Washroom Block B', congestion: 15 },
  ]);

  const [adminStats] = useState({ activeUsers: 14520, incidents: 2, predictedSurge: 'Gate 2 in 15 mins' });

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_MAPS_API_KEY || 'AIzaSyApmiSTVkhLyr-T4vhkjxnM6mR_cyTcyUY',
    libraries: ['places']
  });

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const sliderTimer = setInterval(() => setSliderIndex(i => (i + 1) % SLIDER_MESSAGES.length), 3500);
    const notifTimer = setInterval(() => {
      const fresh = randomNotifs();
      setNotifications(prev => {
        // Re-translate with current lang if needed
        return fresh;
      });
    }, 6000);
    const dataTimer = setInterval(() => {
      setLocations(prev => prev.map(loc => ({
        ...loc, congestion: Math.max(5, Math.min(100, loc.congestion + Math.floor(Math.random() * 11) - 5))
      })));
    }, 4000);

    const unsubAuth = onAuthStateChanged(auth, u => setUser(u));
    const unsubIncidents = onSnapshot(collection(db, 'incidents'), snap => {
      if (!snap.empty) setLiveIncidents(snap.docs.map(d => d.data()));
    });

    return () => {
      clearInterval(timer); clearInterval(sliderTimer);
      clearInterval(notifTimer); clearInterval(dataTimer);
      unsubAuth(); unsubIncidents();
    };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog]);

  // ── Full-page translation ─────────────────────────────────────
  const handleLanguageChange = useCallback(async (e) => {
    const targetLang = e.target.value;
    setLang(targetLang);

    if (targetLang === 'en') {
      setLabels(DEFAULT_LABELS);
      setSliderTexts(SLIDER_MESSAGES);
      setNotifications(randomNotifs());
      setChatLog([{ sender: 'bot', text: DEFAULT_LABELS.chatGreeting }]);
      return;
    }

    setIsTranslating(true);
    try {
      // Translate all UI labels, slider texts, and notifications in parallel
      const [translatedLabels, translatedSlider, translatedNotifs] = await Promise.all([
        translateObj(DEFAULT_LABELS, targetLang),
        Promise.all(SLIDER_MESSAGES.map(async m => ({ ...m, text: await translateText(m.text, targetLang) }))),
        Promise.all(randomNotifs().map(async n => ({
          ...n,
          message: await translateText(n.original, targetLang),
        }))),
      ]);

      setLabels(translatedLabels);
      setSliderTexts(translatedSlider);
      setNotifications(translatedNotifs);
      setChatLog([{ sender: 'bot', text: translatedLabels.chatGreeting }]);
    } catch (err) {
      console.error('Translation error:', err);
    } finally {
      setIsTranslating(false);
    }
  }, []);

  // ── Image upload (Vision count only) ─────────────────────────
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    
    // Compress image to < 200KB before network request
    const b64 = await compressImage(file);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/vision/count`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: b64 })
      });
      const data = await res.json();
      setCameraCount(data.personCount);
    } catch { } finally { setIsUploading(false); }
  };

  // ── Incident report (Vision scan + GCS upload) ───────────────
  const handleIncidentReport = async (e) => {
    const file = e.target.files[0];
    if (!file || !incidentDesc) { alert('Please describe the incident first.'); return; }
    
    setIsReporting(true); setVisionResult(null);
    let currentLabel = 'UNKNOWN';
    
    // Compress image massively improves latency
    const b64 = await compressImage(file);

    try {
      const visionRes = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/vision/count`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: b64 })
      });
      const vd = await visionRes.json();
      const count = vd.personCount ?? 0;
      currentLabel = count >= 15 ? '🔴 OVERCROWDED' : count >= 6 ? '🟡 MODERATE CROWD' : '🟢 LOW DENSITY';
      setVisionResult({ count, label: currentLabel });
    } catch { 
      currentLabel = '⚪ Vision API offline';
      setVisionResult({ count: '?', label: currentLabel }); 
    }

    try {
      await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/incident/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: b64, description: incidentDesc, label: currentLabel })
      });
      setIncidentDesc('');
    } catch {
      // Fallback: Store directly into Firestore if backend storage API is completely offline
      try {
        await addDoc(collection(db, 'incidents'), {
          description: incidentDesc,
          status: currentLabel,
          imageUrl: '', // Offline meaning no GCS upload
          timestamp: serverTimestamp()
        });
        setIncidentDesc('');
      } catch (err) {
        console.error('Firebase offline fallback failed', err);
      }
    } finally { setIsReporting(false); }
  };

  // ── Chatbot ───────────────────────────────────────────────────
  const sendChatMessage = async (text) => {
    const msg = text || chatInput;
    if (!msg.trim()) return;
    setChatLog(prev => [...prev, { sender: 'user', text: msg }]);
    setChatInput(''); setIsChatLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      setChatLog(prev => [...prev, { sender: 'bot', text: data.reply || getSmartResponse(msg) }]);
    } catch {
      setTimeout(() => setChatLog(prev => [...prev, { sender: 'bot', text: getSmartResponse(msg) }]), 500);
    } finally { setIsChatLoading(false); }
  };

  // ── Maps routing ──────────────────────────────────────────────
  const findRoute = async () => {
    if (!window.google) return;
    setIsRouting(true); setDirectionsResponse(null);
    const originPlace = originRef.current?.getPlace();
    const destPlace = destinationRef.current?.getPlace();
    // eslint-disable-next-line no-undef
    const ds = new google.maps.DirectionsService();
    const origin = originPlace?.geometry?.location || mapCenter;
    const destination = destPlace?.geometry?.location;
    if (!destination) {
      // eslint-disable-next-line no-undef
      const ps = new google.maps.places.PlacesService(document.createElement('div'));
      const q = destinationRef.current?.value || 'cinema hall';
      ps.findPlaceFromQuery({ query: q, fields: ['geometry', 'name'] }, async (results, status) => {
        // eslint-disable-next-line no-undef
        if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
          setCinemaName(results[0].name);
          try {
            // eslint-disable-next-line no-undef
            const r = await ds.route({ origin, destination: results[0].geometry.location, travelMode: google.maps.TravelMode.DRIVING });
            setDirectionsResponse(r);
          } catch { }
        }
        setIsRouting(false);
      });
    } else {
      setCinemaName(destPlace.name || '');
      try {
        // eslint-disable-next-line no-undef
        const r = await ds.route({ origin, destination, travelMode: google.maps.TravelMode.DRIVING });
        setDirectionsResponse(r);
      } catch { }
      setIsRouting(false);
    }
  };

  const getStatusColor = (p) => p <= 40 ? 'status-low' : p <= 75 ? 'status-medium' : 'status-high';

  return (
    <div className={`dashboard-container ${isDark ? 'dark' : 'light'}`}>

      {/* Skip Navigation */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Welcome Slider */}
      <div className="welcome-slider" role="marquee" aria-live="polite" aria-label="Platform announcements">
        <div className="slider-content">
          <span className="slider-icon" aria-hidden="true">{sliderTexts[sliderIndex].icon}</span>
          <span className="slider-text">{sliderTexts[sliderIndex].text}</span>
        </div>
        <div className="slider-dots" role="tablist" aria-label="Announcement slides">
          {sliderTexts.map((msg, i) => (
            <div key={i} role="tab" aria-selected={i === sliderIndex}
              aria-label={`Slide ${i + 1}`} tabIndex={0}
              className={`slider-dot ${i === sliderIndex ? 'active' : ''}`}
              onClick={() => setSliderIndex(i)}
              onKeyDown={e => e.key === 'Enter' && setSliderIndex(i)}>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="header" role="banner">
        <div className="header-brand">
          <h1>
            <svg className="icon" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
            CrowdFlow
          </h1>
          <span className="platform-subtitle">Smart Stadium Experience Platform</span>
        </div>

        <div className="header-controls">
          {/* Theme Toggle */}
          <button
            className="theme-toggle"
            onClick={() => setIsDark(d => !d)}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light Mode' : 'Dark Mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* Language Selector */}
          <label htmlFor="lang-select" className="sr-only">Select language</label>
          <select
            id="lang-select"
            className="btn-secondary lang-select"
            value={lang}
            onChange={handleLanguageChange}
            disabled={isTranslating}
            aria-label="Translate page to language"
          >
            <option value="en">🌐 English</option>
            <option value="hi">हिंदी (Hindi)</option>
            <option value="bn">বাংলা (Bengali)</option>
            <option value="te">తెలుగు (Telugu)</option>
            <option value="mr">मराठी (Marathi)</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="gu">ગુજરાતી (Gujarati)</option>
          </select>

          {isTranslating && <span className="translating-badge" aria-live="polite">Translating...</span>}

          {/* Auth */}
          {!user
            ? <button className="btn-primary" onClick={logInWithGoogle}>{labels.signIn}</button>
            : <div className="user-info">
                <span>Hi, {user.displayName}</span>
                <button className="btn-secondary" onClick={logOut}>{labels.logout}</button>
              </div>
          }

          <div className="live-badge" role="status" aria-label="System status: Live GCP connections active">
            <div className="pulse-dot" aria-hidden="true"></div>Live GCP
          </div>
          <div className="current-time" aria-label="Current time">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </header>

      <main id="main-content" className="grid" role="main">

        {/* Heatmap */}
        <section className="card card-wide" aria-labelledby="heatmap-title">
          <h2 id="heatmap-title" className="card-title">{labels.heatmapTitle}</h2>
          <div className="heatmap-grid">
            {locations.map((loc, idx) => (
              <div key={idx} className="heatmap-item" role="article" aria-label={`${loc.name}: ${loc.congestion}% congestion`}>
                <div className="heatmap-info">
                  <span className="loc-name">{loc.name}</span>
                  <span className={`status-text ${getStatusColor(loc.congestion)}`}>{loc.congestion}%</span>
                </div>
                <div className="progress-bar-container" role="progressbar" aria-valuenow={loc.congestion} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`progress-bar ${getStatusColor(loc.congestion)}`} style={{ width: `${loc.congestion}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Navigation */}
        <section className="card" aria-labelledby="nav-title">
          <h2 id="nav-title" className="card-title">{labels.navTitle}</h2>
          {isLoaded ? (
            <>
              <div className="route-inputs">
                <Autocomplete onLoad={ref => (originRef.current = ref)}>
                  <input type="text" placeholder={`📍 ${labels.originPlaceholder}`} className="route-input" aria-label="Route origin" />
                </Autocomplete>
                <Autocomplete onLoad={ref => (destinationRef.current = ref)}>
                  <input type="text" placeholder={`🏁 ${labels.destPlaceholder}`} className="route-input" aria-label="Route destination" />
                </Autocomplete>
                <button className="btn-primary" onClick={findRoute} disabled={isRouting} aria-busy={isRouting}>
                  {isRouting ? labels.calculating : labels.getDirections}
                </button>
                {cinemaName && <p className="destination-name" aria-live="polite">📍 {cinemaName}</p>}
              </div>
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={mapCenter}
                zoom={14}
                options={{ disableDefaultUI: true, styles: isDark ? [{ featureType: 'all', elementType: 'geometry.fill', stylers: [{ color: '#1a202c' }] }, { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#ffffff' }] }] : [] }}
              >
                {!directionsResponse && <Marker position={mapCenter} label="You" />}
                {directionsResponse && <DirectionsRenderer directions={directionsResponse} options={{ polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 6, strokeOpacity: 0.9 } }} />}
              </GoogleMap>
            </>
          ) : (
            <div className="map-placeholder" role="img" aria-label="Map loading">Maps Loading...</div>
          )}

          <h3 className="section-sub-title">{labels.notificationsTitle}</h3>
          <div className="notifications-list" role="log" aria-live="polite" aria-label="Live stadium notifications" aria-relevant="additions">
            {notifications.map(notif => (
              <div key={notif.id} className={`notification-item notif-${notif.type}`} role="alert">
                <div className="notif-icon" aria-hidden="true"></div>
                <div className="notif-content"><p>{notif.message}</p><span>{notif.time}</span></div>
              </div>
            ))}
          </div>
        </section>

        {/* Incident Report */}
        <section className="card" aria-labelledby="incident-title">
          <h2 id="incident-title" className="card-title">{labels.incidentTitle}</h2>
          <div className="incident-form">
            <label htmlFor="incident-desc" className="sr-only">Incident description</label>
            <input
              id="incident-desc"
              type="text"
              placeholder={labels.incidentPlaceholder}
              value={incidentDesc}
              onChange={e => setIncidentDesc(e.target.value)}
              className="route-input"
              aria-required="true"
            />
            <label htmlFor="incident-file" className="incident-file-label">{labels.incidentScanUpload}</label>
            <input id="incident-file" type="file" accept="image/*" onChange={handleIncidentReport} className="sr-only" aria-label="Upload incident image" />
            {isReporting && <p className="status-msg-blue" aria-live="polite">{labels.incidentScanning}</p>}
            {visionResult && (
              <div className="vision-result" aria-live="polite" role="status">
                <p className="vision-result-label">{labels.visionScanResult}:</p>
                <p className="vision-result-value">{visionResult.label}</p>
                <p className="vision-result-count">{visionResult.count !== '?' ? `${visionResult.count} people detected` : 'Count unavailable'}</p>
              </div>
            )}
          </div>

          <h3 className="section-sub-title">{labels.liveIncidentFeed}</h3>
          <div className="incident-feed" aria-live="polite" aria-label="Live incident feed from Firestore">
            {liveIncidents.length === 0
              ? <p className="empty-msg">{labels.noIncidents}</p>
              : liveIncidents.map((inc, i) => (
                <div key={i} className="incident-card" role="article">
                  <p className="incident-status">{inc.status} — {inc.description}</p>
                  {inc.imageUrl && <img src={inc.imageUrl} alt={`Incident: ${inc.description}`} className="incident-img" />}
                </div>
              ))
            }
          </div>
        </section>

        {/* Admin Dashboard */}
        <section className="card admin-panel card-wide" aria-labelledby="admin-title">
          <h2 id="admin-title" className="card-title">{labels.adminTitle}</h2>
          <div className="admin-stats-grid">
            <div className="stat-box">
              <div className="stat-label">{labels.vertexAiLabel}</div>
              <div className="stat-value text-warning" aria-live="polite">{adminStats.predictedSurge}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">{labels.activeAttendeesLabel}</div>
              <div className="stat-value">{adminStats.activeUsers.toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">{labels.openIncidentsLabel}</div>
              <div className="stat-value text-danger" aria-live="polite">{adminStats.incidents}</div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating Chatbot */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000 }} role="region" aria-label="CrowdFlow AI Assistant">
        {isChatOpen ? (
          <div role="dialog" aria-modal="true" aria-labelledby="chat-title" className="chat-window">
            <div className="chat-header">
              <div>
                <h3 id="chat-title">CrowdFlow Assistant</h3>
                <p>Powered by Vertex AI Gemini</p>
              </div>
              <button onClick={() => setIsChatOpen(false)} aria-label={labels.closeChat} className="chat-close">×</button>
            </div>

            <div role="log" aria-live="polite" aria-label="Chat messages" className="chat-log">
              {chatLog.map((log, i) => (
                <div key={i} className={`chat-bubble ${log.sender}`} aria-label={`${log.sender === 'user' ? 'You' : 'Assistant'}: ${log.text}`}>
                  {log.text}
                </div>
              ))}
              {isChatLoading && <div className="chat-bubble bot thinking" aria-live="polite">Thinking...</div>}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-quick-replies" aria-label="Quick reply suggestions">
              {SMART_REPLIES.default.slice(0, 3).map((q, i) => (
                <button key={i} onClick={() => sendChatMessage(q)} className="quick-chip" aria-label={`Quick reply: ${q}`}>{q}</button>
              ))}
            </div>

            <div className="chat-input-row">
              <label htmlFor="chat-input" className="sr-only">Type your question</label>
              <input
                id="chat-input"
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendChatMessage()}
                className="chat-input"
                placeholder={labels.chatPlaceholder}
                aria-label="Chat message input"
              />
              <button onClick={() => sendChatMessage()} aria-label={labels.sendMessage} className="chat-send">▶</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsChatOpen(true)}
            aria-label={labels.openChat}
            aria-expanded={isChatOpen}
            className="chat-fab"
          >
            <svg width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        )}
      </div>

    </div>
  );
}

export default App;
