/**
 * TravelAgent AI — Advanced Frontend
 * Features:
 * 1. Real-time Budget Tracker (ring chart, breakdown)
 * 2. Trip Checklist / Progress
 * 3. Live Score Panel with Reward Log
 * 4. Smart Flight/Hotel/Activity Comparison with Sort & Filter
 * 5. Smart Action Bar (Message Templates, Auto-Summary)
 * 6. Live Activity Feed
 * 7. Itinerary Preview Builder
 * 8. Destination Info Cards + Theme Toggle + Session History + Dashboard Charts
 */

const API_BASE = 'http://localhost:7860';

// ─── State ───────────────────────────────────────────────────
let state = {
  currentTask: 'budget_flight_search',
  env: null,
  flightCost: 0,
  hotelCost: 0,
  activityCost: 0,
  sessionHistory: JSON.parse(localStorage.getItem('travelHistory') || '[]'),
  compareItems: [],
  theme: localStorage.getItem('theme') || 'dark',
  sortField: 'price',
  hotelFilter: 'all',
  activityFilter: 'all',
};

// ─── Destination Info DB ──────────────────────────────────────
const DEST_INFO = {
  PAR: {
    city: 'Paris', flag: '🇫🇷', country: 'France',
    timezone: 'CET (UTC+1)', currency: 'Euro (€)',
    language: 'French', bestTime: 'Apr–Jun, Sep–Nov',
    emoji: '🗼', tips: 'Book Eiffel Tower in advance!',
  },
  TYO: {
    city: 'Tokyo', flag: '🇯🇵', country: 'Japan',
    timezone: 'JST (UTC+9)', currency: 'Yen (¥)',
    language: 'Japanese', bestTime: 'Mar–May, Sep–Nov',
    emoji: '🗾', tips: 'Get a Suica IC card for transit.',
  },
  LON: {
    city: 'London', flag: '🇬🇧', country: 'UK',
    timezone: 'GMT/BST (UTC+0/+1)', currency: 'Pound (£)',
    language: 'English', bestTime: 'May–Sep',
    emoji: '🎡', tips: 'Oyster card for public transport.',
  },
};

const ACTIVITY_ICONS = {
  culture: '🏛', entertainment: '🎪', nature: '🌿',
};

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  checkApiHealth();
  setupEventListeners();
  updateDashboard();
  updateHistory();
  setInterval(checkApiHealth, 30000);
});

function setupEventListeners() {
  // Tab nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'dashboard') updateDashboard();
      if (tab === 'history') updateHistory();
    });
  });

  // Task cards
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.task-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.currentTask = card.dataset.task;
    });
  });

  // Start button
  document.getElementById('startBtn').addEventListener('click', startPlanning);

  // Sort flights
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sortField = btn.dataset.sort;
      if (state.env) renderFlights(state.env.available_flights);
    });
  });

  // Hotel filters
  document.querySelectorAll('#hotelFilters .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#hotelFilters .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.hotelFilter = pill.dataset.filter;
      if (state.env) renderHotels(state.env.available_hotels);
    });
  });

  // Activity filters
  document.querySelectorAll('#activityFilters .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#activityFilters .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activityFilter = pill.dataset.filter;
      if (state.env) renderActivities(state.env.available_activities);
    });
  });

  // Message templates
  document.querySelectorAll('.msg-template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('userMessage').value = btn.dataset.msg;
    });
  });

  // Send message
  document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);

  // Auto summary
  document.getElementById('autoSummaryBtn').addEventListener('click', generateAutoSummary);

  // Finalize
  document.getElementById('finalizeBtn').addEventListener('click', finalizeItinerary);

  // Plan another
  document.getElementById('planAnotherBtn').addEventListener('click', resetPlanner);

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Clear feed
  document.getElementById('clearFeed').addEventListener('click', () => {
    document.getElementById('feedList').innerHTML = `
      <div class="feed-empty"><div class="feed-empty-icon">🗺</div><div>Feed cleared</div></div>`;
  });

  // Clear history
  document.getElementById('clearHistory').addEventListener('click', () => {
    state.sessionHistory = [];
    localStorage.removeItem('travelHistory');
    updateHistory();
    updateDashboard();
    showToast('History cleared', 'info');
  });
}

// ─── API Health ───────────────────────────────────────────────
async function checkApiHealth() {
  const dot = document.querySelector('.status-dot');
  const txt = document.querySelector('.status-text');
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className = 'status-dot online';
      txt.textContent = 'API Online';
    } else throw new Error('not ok');
  } catch {
    dot.className = 'status-dot offline';
    txt.textContent = 'API Offline (Demo)';
  }
}

// ─── Start Planning ───────────────────────────────────────────
async function startPlanning() {
  showLoading('Initializing trip environment...');
  try {
    const data = await apiPost('/reset', { task_id: state.currentTask });
    state.env = data.observation;
    state.flightCost = 0;
    state.hotelCost = 0;
    state.activityCost = 0;
    state.compareItems = [];

    // Reset UI
    document.getElementById('goalCard').style.display = 'none';
    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('flightsSection').style.display = 'block';
    document.getElementById('hotelsSection').style.display = 'block';
    document.getElementById('activitiesSection').style.display = 'block';
    document.getElementById('actionBar').style.display = 'block';

    // Update goal text
    document.getElementById('goalCard').style.display = 'none';

    // Render everything
    renderFlights(state.env.available_flights);
    renderHotels(state.env.available_hotels);
    renderActivities(state.env.available_activities);
    updateBudget(state.env);
    updateChecklist(state.env);
    updateScore(0, {});
    updateDestInfo(getDestKey());
    updateItineraryPreview();

    document.getElementById('minActs').textContent = state.env.requirements.min_activities;

    addFeedItem('info', '🚀', `Trip started: ${state.env.origin} → ${state.env.destination}`, 'Planning initiated');
    addFeedItem('info', '💰', `Budget: $${state.env.budget_total} for ${state.env.passengers} pax`, 'Budget loaded');

    showToast(`${state.currentTask.replace(/_/g,' ')} started!`, 'success');
  } catch (err) {
    useDemoMode();
  }
  hideLoading();
}

function getDestKey() {
  const task = state.currentTask;
  if (task === 'budget_flight_search') return 'PAR';
  if (task === 'multi_preference_tokyo') return 'TYO';
  return 'LON';
}

// ─── Demo Mode (if API offline) ───────────────────────────────
function useDemoMode() {
  const DEMO_DATA = {
    budget_flight_search: {
      task_id: 'budget_flight_search', step: 0,
      goal: 'Plan a 7-day solo trip from Mumbai to Paris with a $2,000 budget.',
      budget_total: 2000, budget_remaining: 2000,
      origin: 'Mumbai', destination: 'Paris',
      duration_days: 7, passengers: 1,
      requirements: { min_hotel_stars: 3, max_hotel_stars: 4, breakfast_required: false, spa_required: false, min_activities: 2, required_activity_categories: [], prefer_direct_flight: false, only_5_star: false },
      available_flights: [
        { id: 'F001', airline: 'Air France', price: 650, duration_h: 9.5, stops: 0, type: 'economy' },
        { id: 'F002', airline: 'Emirates', price: 580, duration_h: 14.0, stops: 1, type: 'economy' },
        { id: 'F003', airline: 'IndiGo', price: 720, duration_h: 11.0, stops: 1, type: 'economy' },
      ],
      available_hotels: [
        { id: 'H001', name: 'Hotel Ibis Paris', stars: 3, price_per_night: 80, breakfast: false, spa: false },
        { id: 'H002', name: 'Novotel Paris Centre', stars: 4, price_per_night: 140, breakfast: true, spa: false },
        { id: 'H003', name: 'Le Bristol Paris', stars: 5, price_per_night: 450, breakfast: true, spa: true },
      ],
      available_activities: [
        { id: 'A001', name: 'Eiffel Tower Tour', price: 35, category: 'culture', duration_h: 3 },
        { id: 'A002', name: 'Louvre Museum', price: 20, category: 'culture', duration_h: 4 },
        { id: 'A003', name: 'Seine River Cruise', price: 45, category: 'entertainment', duration_h: 2 },
        { id: 'A004', name: 'Versailles Day Trip', price: 70, category: 'culture', duration_h: 8 },
      ],
      selected_flight: null, selected_hotel: null,
      selected_activities: [], messages_sent: [],
      itinerary_finalized: false, episode_done: false,
    },
    multi_preference_tokyo: {
      task_id: 'multi_preference_tokyo', step: 0,
      goal: 'Plan a 5-day family trip (2 adults + 2 kids) from Delhi to Tokyo with a $3,500 budget.',
      budget_total: 3500, budget_remaining: 3500,
      origin: 'Delhi', destination: 'Tokyo',
      duration_days: 5, passengers: 4,
      requirements: { min_hotel_stars: 3, max_hotel_stars: 5, breakfast_required: true, spa_required: false, min_activities: 3, required_activity_categories: ['entertainment'], prefer_direct_flight: true, only_5_star: false },
      available_flights: [
        { id: 'F004', airline: 'Japan Airlines', price: 620, duration_h: 8.5, stops: 0, type: 'economy' },
        { id: 'F005', airline: 'Air India', price: 510, duration_h: 12.0, stops: 1, type: 'economy' },
        { id: 'F006', airline: 'Singapore Air', price: 680, duration_h: 10.0, stops: 1, type: 'economy' },
      ],
      available_hotels: [
        { id: 'H004', name: 'Tokyo Inn', stars: 3, price_per_night: 90, breakfast: false, spa: false },
        { id: 'H005', name: 'Shinjuku Granbell', stars: 4, price_per_night: 160, breakfast: true, spa: false },
        { id: 'H006', name: 'Park Hyatt Tokyo', stars: 5, price_per_night: 420, breakfast: true, spa: true },
      ],
      available_activities: [
        { id: 'A005', name: 'TeamLab Planets', price: 32, category: 'entertainment', duration_h: 3 },
        { id: 'A006', name: 'Senso-ji Temple', price: 0, category: 'culture', duration_h: 2 },
        { id: 'A007', name: 'Shibuya Crossing', price: 50, category: 'entertainment', duration_h: 4 },
        { id: 'A008', name: 'Mount Fuji Day Trip', price: 80, category: 'nature', duration_h: 10 },
      ],
      selected_flight: null, selected_hotel: null,
      selected_activities: [], messages_sent: [],
      itinerary_finalized: false, episode_done: false,
    },
    complex_london_vip: {
      task_id: 'complex_london_vip', step: 0,
      goal: 'Plan a 3-day VIP corporate trip from Bangalore to London with a $3,000 budget. Only 5★ hotels with spa.',
      budget_total: 3000, budget_remaining: 3000,
      origin: 'Bangalore', destination: 'London',
      duration_days: 3, passengers: 1,
      requirements: { min_hotel_stars: 5, max_hotel_stars: 5, breakfast_required: true, spa_required: true, min_activities: 3, required_activity_categories: ['culture','entertainment'], prefer_direct_flight: true, only_5_star: true },
      available_flights: [
        { id: 'F007', airline: 'British Airways', price: 890, duration_h: 10.5, stops: 0, type: 'business' },
        { id: 'F008', airline: 'Virgin Atlantic', price: 820, duration_h: 10.5, stops: 0, type: 'economy' },
        { id: 'F009', airline: 'Qatar Airways', price: 750, duration_h: 14.0, stops: 1, type: 'economy' },
      ],
      available_hotels: [
        { id: 'H007', name: 'Travelodge London', stars: 3, price_per_night: 95, breakfast: false, spa: false },
        { id: 'H008', name: 'The Savoy', stars: 5, price_per_night: 680, breakfast: true, spa: true },
        { id: 'H009', name: "Claridge's", stars: 5, price_per_night: 750, breakfast: true, spa: true },
      ],
      available_activities: [
        { id: 'A009', name: 'Tower of London', price: 35, category: 'culture', duration_h: 3 },
        { id: 'A010', name: 'West End Theatre', price: 90, category: 'entertainment', duration_h: 3 },
        { id: 'A011', name: 'British Museum', price: 0, category: 'culture', duration_h: 3 },
        { id: 'A012', name: 'Afternoon Tea at Claridge\'s', price: 80, category: 'culture', duration_h: 2 },
      ],
      selected_flight: null, selected_hotel: null,
      selected_activities: [], messages_sent: [],
      itinerary_finalized: false, episode_done: false,
    },
  };

  state.env = JSON.parse(JSON.stringify(DEMO_DATA[state.currentTask]));
  state.flightCost = 0;
  state.hotelCost = 0;
  state.activityCost = 0;

  document.getElementById('goalCard').style.display = 'none';
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('flightsSection').style.display = 'block';
  document.getElementById('hotelsSection').style.display = 'block';
  document.getElementById('activitiesSection').style.display = 'block';
  document.getElementById('actionBar').style.display = 'block';

  renderFlights(state.env.available_flights);
  renderHotels(state.env.available_hotels);
  renderActivities(state.env.available_activities);
  updateBudget(state.env);
  updateChecklist(state.env);
  updateScore(0, {});
  updateDestInfo(getDestKey());
  updateItineraryPreview();

  document.getElementById('minActs').textContent = state.env.requirements.min_activities;
  addFeedItem('warning', '⚠️', 'API offline — running in demo mode', 'Local simulation active');
  addFeedItem('info', '🚀', `Trip: ${state.env.origin} → ${state.env.destination}`, 'Demo mode');
  showToast('Demo mode — API offline', 'warning');
}

// ─── Flight Actions ───────────────────────────────────────────
async function selectFlight(flightId) {
  if (state.env.selected_flight) {
    showToast('Flight already selected!', 'warning'); return;
  }
  showLoading('Booking flight...');
  try {
    const result = await apiPost('/step', { action_type: 'search_flights', flight_id: flightId });
    const flight = state.env.available_flights.find(f => f.id === flightId);
    const cost = flight.price * state.env.passengers;
    state.env.selected_flight = flight;
    state.env.budget_remaining -= cost;
    state.env.step++;
    state.flightCost = cost;

    updateBudget(state.env);
    updateChecklist(state.env);
    updateScore(result?.reward || 0.15, result?.info?.breakdown || { flight_selected: 0.10 });
    updateItineraryPreview();
    renderFlights(state.env.available_flights);

    addFeedItem('success', '✈️', `Flight booked: ${flight.airline}`, `$${cost} · ${flight.stops === 0 ? 'Direct' : '1 stop'}`);
    showToast(`${flight.airline} selected! $${cost}`, 'success');
  } catch {
    // Demo fallback
    const flight = state.env.available_flights.find(f => f.id === flightId);
    if (flight) {
      const cost = flight.price * state.env.passengers;
      state.env.selected_flight = flight;
      state.env.budget_remaining -= cost;
      state.flightCost = cost;
      updateBudget(state.env);
      updateChecklist(state.env);
      updateScore(0.15, { flight_selected: 0.10 });
      updateItineraryPreview();
      renderFlights(state.env.available_flights);
      addFeedItem('success', '✈️', `${flight.airline} booked (demo)`, `$${cost}`);
      showToast(`${flight.airline} selected!`, 'success');
    }
  }
  hideLoading();
}

// ─── Hotel Actions ────────────────────────────────────────────
async function bookHotel(hotelId) {
  if (state.env.selected_hotel) {
    showToast('Hotel already booked!', 'warning'); return;
  }
  showLoading('Booking hotel...');
  try {
    const result = await apiPost('/step', { action_type: 'book_hotel', hotel_id: hotelId });
    const hotel = state.env.available_hotels.find(h => h.id === hotelId);
    const cost = hotel.price_per_night * state.env.duration_days;

    if (cost > state.env.budget_remaining) {
      showToast('Exceeds budget! Choose a cheaper option.', 'error');
      addFeedItem('error', '❌', `Hotel too expensive: $${cost}`, `Budget: $${state.env.budget_remaining}`);
      hideLoading(); return;
    }

    state.env.selected_hotel = hotel;
    state.env.budget_remaining -= cost;
    state.env.step++;
    state.hotelCost = cost;

    updateBudget(state.env);
    updateChecklist(state.env);
    updateScore(result?.reward || 0.15, result?.info?.breakdown || { hotel_booked: 0.10 });
    updateItineraryPreview();
    renderHotels(state.env.available_hotels);

    addFeedItem('success', '🏨', `${hotel.name} booked`, `$${cost} · ${hotel.stars}★`);
    showToast(`${hotel.name} booked! $${cost}`, 'success');
  } catch {
    const hotel = state.env.available_hotels.find(h => h.id === hotelId);
    if (hotel) {
      const cost = hotel.price_per_night * state.env.duration_days;
      if (cost > state.env.budget_remaining) { showToast('Over budget!', 'error'); hideLoading(); return; }
      state.env.selected_hotel = hotel;
      state.env.budget_remaining -= cost;
      state.hotelCost = cost;
      updateBudget(state.env);
      updateChecklist(state.env);
      updateScore(0.15, { hotel_booked: 0.10 });
      updateItineraryPreview();
      renderHotels(state.env.available_hotels);
      addFeedItem('success', '🏨', `${hotel.name} booked (demo)`, `$${cost}`);
      showToast(`${hotel.name} booked!`, 'success');
    }
  }
  hideLoading();
}

// ─── Activity Actions ─────────────────────────────────────────
async function addActivity(activityId) {
  const already = state.env.selected_activities.find(a => a.id === activityId);
  if (already) { showToast('Already added!', 'warning'); return; }

  const activity = state.env.available_activities.find(a => a.id === activityId);
  const cost = activity.price * state.env.passengers;

  if (cost > state.env.budget_remaining) {
    showToast('Activity exceeds budget!', 'error');
    addFeedItem('error', '❌', `${activity.name} too expensive`, `Need $${cost}`);
    return;
  }

  showLoading('Adding activity...');
  try {
    await apiPost('/step', { action_type: 'add_activity', activity_id: activityId });
  } catch {}

  state.env.selected_activities.push(activity);
  state.env.budget_remaining -= cost;
  state.env.step++;
  state.activityCost += cost;

  updateBudget(state.env);
  updateChecklist(state.env);
  updateScore(0.08, { [`activity_added`]: 0.08 });
  updateItineraryPreview();
  renderActivities(state.env.available_activities);

  const icon = ACTIVITY_ICONS[activity.category] || '🎭';
  addFeedItem('success', icon, `${activity.name} added`, `$${cost} · ${activity.category}`);
  showToast(`${activity.name} added!`, 'success');
  hideLoading();
}

// ─── Messages ─────────────────────────────────────────────────
async function sendMessage() {
  const msg = document.getElementById('userMessage').value.trim();
  if (!msg) { showToast('Please type a message first', 'warning'); return; }

  showLoading('Sending message...');
  try {
    await apiPost('/step', { action_type: 'respond_to_user', message: msg });
  } catch {}

  state.env.messages_sent.push(msg);
  state.env.step++;

  updateChecklist(state.env);
  updateScore(0.05, { user_response_sent: 0.05 });
  addFeedItem('info', '💬', 'Message sent to user', msg.substring(0, 50) + (msg.length > 50 ? '...' : ''));
  document.getElementById('userMessage').value = '';
  showToast('Message sent!', 'success');
  hideLoading();
}

// ─── Auto Summary Generator ───────────────────────────────────
function generateAutoSummary() {
  const env = state.env;
  if (!env) return;

  const flight = env.selected_flight;
  const hotel = env.selected_hotel;
  const activities = env.selected_activities;

  let summary = `${env.origin} to ${env.destination} — ${env.duration_days}-Day Trip\n\n`;

  if (flight) {
    summary += `✈️ FLIGHT: ${flight.airline} (${flight.stops === 0 ? 'Direct' : '1 stop'}, ${flight.duration_h}h, ${flight.type})\n`;
  }
  if (hotel) {
    summary += `🏨 HOTEL: ${hotel.name} (${hotel.stars}★)`;
    if (hotel.breakfast) summary += ' incl. breakfast';
    if (hotel.spa) summary += ' + spa';
    summary += `\n`;
  }
  if (activities.length > 0) {
    summary += `\n🎭 ACTIVITIES:\n`;
    activities.forEach((a, i) => {
      summary += `  Day ${i + 2}: ${a.name} (${a.duration_h}h)\n`;
    });
  }

  const spent = env.budget_total - env.budget_remaining;
  summary += `\n💰 Total: $${spent} / $${env.budget_total} budget`;
  summary += `\n👥 Passengers: ${env.passengers}`;

  document.getElementById('itinerarySummary').value = summary;
  showToast('Summary generated!', 'success');
}

// ─── Finalize ─────────────────────────────────────────────────
async function finalizeItinerary() {
  const summary = document.getElementById('itinerarySummary').value.trim();
  if (!summary) { showToast('Please write a summary first', 'warning'); return; }

  showLoading('Finalizing your trip...');
  let score = 0;
  try {
    const result = await apiPost('/step', { action_type: 'finalize_itinerary', summary });
    score = (result?.info?.cumulative_reward || 0.7);
  } catch {
    score = computeLocalScore();
  }

  state.env.itinerary_finalized = true;
  const displayScore = Math.round(score * 100);
  const grade = getGrade(score);

  // Save to history
  const historyItem = {
    id: Date.now(),
    task: state.currentTask,
    origin: state.env.origin,
    destination: state.env.destination,
    score: score,
    budget_total: state.env.budget_total,
    budget_remaining: state.env.budget_remaining,
    date: new Date().toLocaleDateString(),
    flight: state.env.selected_flight?.airline || '—',
    hotel: state.env.selected_hotel?.name || '—',
    activities: state.env.selected_activities.length,
  };
  state.sessionHistory.unshift(historyItem);
  if (state.sessionHistory.length > 20) state.sessionHistory.pop();
  localStorage.setItem('travelHistory', JSON.stringify(state.sessionHistory));

  // Show result
  document.getElementById('actionBar').style.display = 'none';
  document.getElementById('resultCard').style.display = 'block';
  document.getElementById('finalScore').textContent = (score * 100).toFixed(1);
  document.getElementById('finalGrade').textContent = `${grade.emoji} ${grade.label}`;
  document.getElementById('resultSummary').textContent = summary.substring(0, 250);
  updateChecklist(state.env);
  addFeedItem('success', '🎉', `Trip finalized! Score: ${displayScore}/100`, grade.label);
  showToast(`🎉 Trip finalized! Score: ${displayScore}/100`, 'success');
  triggerConfetti();
  hideLoading();
}

function computeLocalScore() {
  const env = state.env;
  let score = 0;
  if (env.selected_flight) score += 0.20;
  if (env.selected_hotel) {
    score += 0.15;
    const r = env.requirements;
    if (r.min_hotel_stars <= env.selected_hotel.stars && env.selected_hotel.stars <= r.max_hotel_stars) score += 0.05;
    if (r.breakfast_required && env.selected_hotel.breakfast) score += 0.03;
    if (r.spa_required && env.selected_hotel.spa) score += 0.05;
  }
  const acts = env.selected_activities.length;
  const min = env.requirements.min_activities;
  score += Math.min(acts / min, 1) * 0.15;
  const spent = env.budget_total - env.budget_remaining;
  if (spent <= env.budget_total) score += 0.10;
  if (env.messages_sent.length > 0) score += 0.05;
  score += 0.08;
  return Math.min(score, 1.0);
}

function getGrade(score) {
  if (score >= 0.9) return { label: 'Outstanding', emoji: '🌟' };
  if (score >= 0.75) return { label: 'Excellent', emoji: '⭐' };
  if (score >= 0.6) return { label: 'Good', emoji: '👍' };
  if (score >= 0.45) return { label: 'Fair', emoji: '🙂' };
  return { label: 'Needs Work', emoji: '📚' };
}

// ─── Reset ────────────────────────────────────────────────────
function resetPlanner() {
  state.env = null;
  state.flightCost = 0;
  state.hotelCost = 0;
  state.activityCost = 0;

  document.getElementById('goalCard').style.display = 'block';
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('flightsSection').style.display = 'none';
  document.getElementById('hotelsSection').style.display = 'none';
  document.getElementById('activitiesSection').style.display = 'none';
  document.getElementById('actionBar').style.display = 'none';

  document.getElementById('rewardLog').innerHTML = '<div class="reward-log-empty">Actions will appear here...</div>';
  document.getElementById('scoreNumber').textContent = '0.00';
  document.getElementById('scoreBar').style.width = '0';
  document.getElementById('scoreGrade').textContent = '—';
  document.getElementById('scoreStep').textContent = 'Step 0';
  document.getElementById('itinerarySummary').value = '';
  document.getElementById('userMessage').value = '';
  document.getElementById('itineraryDays').innerHTML = '<div class="itinerary-empty">Selections will appear here...</div>';
  document.getElementById('destInfo').innerHTML = '<div class="dest-placeholder">Select a destination...</div>';

  updateBudget({ budget_total: 0, budget_remaining: 0 });
  updateChecklist({ selected_flight: null, selected_hotel: null, selected_activities: [], messages_sent: [], itinerary_finalized: false, requirements: { min_activities: 2 } });

  showToast('Ready to plan a new trip!', 'info');
}

// ─── Render Functions ─────────────────────────────────────────
function renderFlights(flights) {
  const sorted = [...flights].sort((a, b) => {
    if (state.sortField === 'stops') return a.stops - b.stops;
    return a[state.sortField] - b[state.sortField];
  });

  const grid = document.getElementById('flightsGrid');
  const pax = state.env?.passengers || 1;
  grid.innerHTML = sorted.map(f => {
    const totalCost = f.price * pax;
    const isSelected = state.env?.selected_flight?.id === f.id;
    const stopLabel = f.stops === 0 ? 'Direct' : `${f.stops} stop`;
    const isPrefDirect = state.env?.requirements?.prefer_direct_flight && f.stops === 0;
    return `
      <div class="flight-card ${isSelected ? 'selected' : ''}" data-id="${f.id}">
        <div class="flight-airline">
          ${f.airline}
          <small>${f.type} · ${f.duration_h}h</small>
        </div>
        <div class="flight-route">
          <div class="flight-city">${state.env?.origin?.substring(0,3).toUpperCase() || '—'}</div>
          <div class="flight-line"><span class="flight-plane">✈️</span></div>
          <div class="flight-city">${state.env?.destination?.substring(0,3).toUpperCase() || '—'}</div>
        </div>
        <div class="flight-stops">${stopLabel}</div>
        <div class="flight-meta">
          <div class="flight-price">$${totalCost}<small>${pax > 1 ? ` (${pax} pax)` : '/pax'}</small></div>
          <div class="flight-duration">${f.duration_h}h flight</div>
          ${isPrefDirect ? '<div class="flight-badge direct">⭐ Preferred</div>' : ''}
          ${f.stops === 0 ? '<div class="flight-badge direct">Direct</div>' : ''}
        </div>
        <button class="flight-select-btn" onclick="selectFlight('${f.id}')">
          ${isSelected ? '✓ Selected' : 'Select'}
        </button>
      </div>`;
  }).join('');
}

function renderHotels(hotels) {
  const filtered = state.hotelFilter === 'all'
    ? hotels
    : hotels.filter(h => h.stars === parseInt(state.hotelFilter));

  const grid = document.getElementById('hotelsGrid');
  const nights = state.env?.duration_days || 1;
  grid.innerHTML = filtered.map(h => {
    const totalCost = h.price_per_night * nights;
    const isSelected = state.env?.selected_hotel?.id === h.id;
    const stars = '★'.repeat(h.stars) + '☆'.repeat(5 - h.stars);
    const hotelEmojis = { 3: '🏩', 4: '🏨', 5: '🏰' };
    return `
      <div class="hotel-card ${isSelected ? 'selected' : ''}">
        <div class="hotel-thumb">${hotelEmojis[h.stars] || '🏨'}</div>
        <div class="hotel-body">
          <div class="hotel-name">${h.name}</div>
          <div class="hotel-stars">${stars}</div>
          <div class="hotel-amenities">
            ${h.breakfast ? '<span class="hotel-amenity">🍳 Breakfast</span>' : ''}
            ${h.spa ? '<span class="hotel-amenity">💆 Spa</span>' : ''}
          </div>
          <div class="hotel-price">
            <div>
              <span class="hotel-price-val">$${totalCost}</span>
              <span class="hotel-price-unit"> /${nights}n</span>
            </div>
            <span style="font-size:0.72rem;color:var(--text2)">$${h.price_per_night}/n</span>
          </div>
          <button class="hotel-book-btn" onclick="bookHotel('${h.id}')">
            ${isSelected ? '✓ Booked' : 'Book Hotel'}
          </button>
        </div>
      </div>`;
  }).join('');
}

function renderActivities(activities) {
  const filtered = state.activityFilter === 'all'
    ? activities
    : activities.filter(a => a.category === state.activityFilter);

  const grid = document.getElementById('activitiesGrid');
  const pax = state.env?.passengers || 1;
  const selected = state.env?.selected_activities || [];

  grid.innerHTML = filtered.map(a => {
    const totalCost = a.price * pax;
    const isAdded = selected.some(s => s.id === a.id);
    const icon = ACTIVITY_ICONS[a.category] || '🎭';
    return `
      <div class="activity-card ${isAdded ? 'added' : ''}">
        <div class="activity-price ${a.price === 0 ? 'activity-free' : ''}">
          ${a.price === 0 ? 'FREE' : '$' + totalCost}
        </div>
        <div class="activity-icon">${icon}</div>
        <div class="activity-name">${a.name}</div>
        <div class="activity-meta">⏱ ${a.duration_h}h · ${a.category}</div>
        <span class="activity-category ${a.category}">${a.category}</span>
        <button class="activity-add-btn" onclick="${isAdded ? '' : `addActivity('${a.id}')`}">
          ${isAdded ? '✓ Added' : '+ Add'}
        </button>
      </div>`;
  }).join('');
}

// ─── Update Budget ────────────────────────────────────────────
function updateBudget(env) {
  const total = env.budget_total || 0;
  const remaining = env.budget_remaining || 0;
  const spent = total - remaining;
  const pct = total > 0 ? spent / total : 0;
  const circumference = 314;
  const offset = circumference - (pct * circumference);

  const ring = document.getElementById('budgetRing');
  ring.style.strokeDashoffset = offset;
  ring.className = `ring-fill ${pct > 0.9 ? 'danger' : pct > 0.7 ? 'warning' : ''}`;

  document.getElementById('budgetSpent').textContent = `$${Math.round(spent)}`;
  document.getElementById('budgetRemaining').textContent = `$${Math.round(remaining)}`;
  document.getElementById('flightCost').textContent = state.flightCost > 0 ? `$${state.flightCost}` : '—';
  document.getElementById('hotelCost').textContent = state.hotelCost > 0 ? `$${state.hotelCost}` : '—';
  document.getElementById('activitiesCost').textContent = state.activityCost > 0 ? `$${state.activityCost}` : '—';
}

// ─── Update Checklist ─────────────────────────────────────────
function updateChecklist(env) {
  const checks = {
    flight: !!env.selected_flight,
    hotel: !!env.selected_hotel,
    activities: env.selected_activities?.length >= (env.requirements?.min_activities || 2),
    message: env.messages_sent?.length > 0,
    finalized: env.itinerary_finalized,
  };

  Object.entries(checks).forEach(([key, done]) => {
    const el = document.getElementById(`check-${key}`);
    if (!el) return;
    el.classList.toggle('done', done);
    el.querySelector('.check-icon').textContent = done ? '✓' : '○';
  });

  // Update activities count
  const actEl = document.querySelector('#check-activities .check-label');
  if (actEl) {
    const min = env.requirements?.min_activities || 2;
    const count = env.selected_activities?.length || 0;
    actEl.textContent = `Activities Added (${count}/${min})`;
  }

  const total = Object.values(checks).length;
  const done = Object.values(checks).filter(Boolean).length;
  const pct = Math.round((done / total) * 100);

  document.getElementById('progressPct').textContent = `${pct}%`;
  document.getElementById('progressBar').style.width = `${pct}%`;
}

// ─── Update Score ─────────────────────────────────────────────
let cumulativeScore = 0;
function updateScore(reward, breakdown) {
  cumulativeScore = Math.min(1, cumulativeScore + reward);
  const displayScore = cumulativeScore.toFixed(2);

  document.getElementById('scoreNumber').textContent = displayScore;
  document.getElementById('scoreBar').style.width = `${cumulativeScore * 100}%`;
  document.getElementById('scoreStep').textContent = `Step ${state.env?.step || 0}`;

  const grade = getGrade(cumulativeScore);
  document.getElementById('scoreGrade').textContent = `${grade.emoji} ${grade.label}`;

  // Add to reward log
  if (Object.keys(breakdown).length > 0) {
    const log = document.getElementById('rewardLog');
    if (log.querySelector('.reward-log-empty')) log.innerHTML = '';

    Object.entries(breakdown).slice(-3).forEach(([key, val]) => {
      const entry = document.createElement('div');
      entry.className = 'reward-entry';
      entry.innerHTML = `
        <span class="reward-label">${key.replace(/_/g,' ')}</span>
        <span class="reward-val ${val < 0 ? 'neg' : ''}">${val > 0 ? '+' : ''}${val.toFixed(2)}</span>`;
      log.insertBefore(entry, log.firstChild);
    });

    // Keep max 10 entries
    while (log.children.length > 10) log.removeChild(log.lastChild);
  }
}

// ─── Update Destination Info ──────────────────────────────────
function updateDestInfo(destKey) {
  const info = DEST_INFO[destKey];
  if (!info) return;

  document.getElementById('destInfo').innerHTML = `
    <div class="dest-card">
      <div class="dest-flag">${info.flag}</div>
      <div class="dest-city">${info.city}</div>
      <div class="dest-facts">
        <div class="dest-fact">
          <span class="dest-fact-label">🌍 Country</span>
          <span class="dest-fact-val">${info.country}</span>
        </div>
        <div class="dest-fact">
          <span class="dest-fact-label">🕐 Timezone</span>
          <span class="dest-fact-val">${info.timezone}</span>
        </div>
        <div class="dest-fact">
          <span class="dest-fact-label">💱 Currency</span>
          <span class="dest-fact-val">${info.currency}</span>
        </div>
        <div class="dest-fact">
          <span class="dest-fact-label">🗣 Language</span>
          <span class="dest-fact-val">${info.language}</span>
        </div>
        <div class="dest-fact">
          <span class="dest-fact-label">📅 Best Time</span>
          <span class="dest-fact-val">${info.bestTime}</span>
        </div>
        <div style="margin-top:8px;font-size:0.76rem;color:var(--accent);padding:6px 8px;background:rgba(79,158,255,0.08);border-radius:6px">
          💡 ${info.tips}
        </div>
      </div>
    </div>`;
}

// ─── Update Itinerary Preview ─────────────────────────────────
function updateItineraryPreview() {
  const env = state.env;
  if (!env) return;
  const container = document.getElementById('itineraryDays');
  const items = [];

  if (env.selected_flight) {
    items.push({ day: 'Day 1', text: `✈️ Fly ${env.origin} → ${env.destination} via ${env.selected_flight.airline}` });
  }
  if (env.selected_hotel) {
    items.push({ day: 'Day 1', text: `🏨 Check in: ${env.selected_hotel.name}` });
  }

  env.selected_activities.forEach((a, i) => {
    const day = Math.min(i + 2, env.duration_days);
    const icon = ACTIVITY_ICONS[a.category] || '🎭';
    items.push({ day: `Day ${day}`, text: `${icon} ${a.name}` });
  });

  if (items.length === 0) {
    container.innerHTML = '<div class="itinerary-empty">Selections will appear here...</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="itin-item">
      <div class="itin-dot"></div>
      <span style="color:var(--accent);font-weight:600;font-size:0.72rem;margin-right:6px">${item.day}</span>
      <span>${item.text}</span>
    </div>`).join('');
}

// ─── Feed ─────────────────────────────────────────────────────
function addFeedItem(type, icon, text, detail) {
  const list = document.getElementById('feedList');
  const empty = list.querySelector('.feed-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const item = document.createElement('div');
  item.className = `feed-item ${type}`;
  item.innerHTML = `
    <div class="feed-item-icon">${icon}</div>
    <div class="feed-item-body">
      <div class="feed-item-text">${text}</div>
      ${detail ? `<div class="feed-item-time">${detail} · ${time}</div>` : `<div class="feed-item-time">${time}</div>`}
    </div>`;
  list.insertBefore(item, list.firstChild);

  // Max 20 items
  while (list.children.length > 20) list.removeChild(list.lastChild);
}

// ─── Dashboard ────────────────────────────────────────────────
function updateDashboard() {
  const history = state.sessionHistory;
  document.getElementById('stat-trips').textContent = history.length;

  if (history.length > 0) {
    const avg = history.reduce((s, h) => s + h.score, 0) / history.length;
    document.getElementById('stat-avgscore').textContent = (avg * 100).toFixed(1);
    const best = Math.max(...history.map(h => h.score));
    document.getElementById('stat-best').textContent = (best * 100).toFixed(1);
    const totalSaved = history.reduce((s, h) => s + h.budget_remaining, 0);
    document.getElementById('stat-saved').textContent = `$${Math.round(totalSaved)}`;
  }

  drawScoreChart();
  drawBudgetChart();
}

function drawScoreChart() {
  const canvas = document.getElementById('scoreChart');
  const empty = document.getElementById('scoreChartEmpty');
  const history = state.sessionHistory;

  if (history.length === 0) {
    canvas.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  canvas.style.display = 'block';
  empty.style.display = 'none';
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = 200;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  const items = [...history].reverse().slice(-10);
  const pad = { t: 20, r: 20, b: 30, l: 40 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;

  // Grid
  const isDark = document.body.getAttribute('data-theme') !== 'light';
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (iH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iW, y); ctx.stroke();
    const val = (1 - i / 4) * 100;
    ctx.fillStyle = isDark ? '#4a5268' : '#8b92a8';
    ctx.font = '10px DM Mono, monospace';
    ctx.fillText(val.toFixed(0), 2, y + 4);
  }

  if (items.length < 2) return;

  // Line
  const gradient = ctx.createLinearGradient(pad.l, 0, pad.l + iW, 0);
  gradient.addColorStop(0, '#4f9eff');
  gradient.addColorStop(1, '#7b61ff');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  items.forEach((item, i) => {
    const x = pad.l + (i / (items.length - 1)) * iW;
    const y = pad.t + (1 - item.score) * iH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill
  ctx.fillStyle = isDark ? 'rgba(79,158,255,0.08)' : 'rgba(79,158,255,0.05)';
  ctx.beginPath();
  items.forEach((item, i) => {
    const x = pad.l + (i / (items.length - 1)) * iW;
    const y = pad.t + (1 - item.score) * iH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.l + iW, pad.t + iH);
  ctx.lineTo(pad.l, pad.t + iH);
  ctx.closePath();
  ctx.fill();

  // Dots
  items.forEach((item, i) => {
    const x = pad.l + (i / (items.length - 1)) * iW;
    const y = pad.t + (1 - item.score) * iH;
    ctx.fillStyle = '#4f9eff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  });
}

function drawBudgetChart() {
  const canvas = document.getElementById('budgetChart');
  const empty = document.getElementById('budgetChartEmpty');
  const history = state.sessionHistory;

  if (history.length === 0) {
    canvas.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  canvas.style.display = 'block';
  empty.style.display = 'none';
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 300;
  const H = 200;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  // Pie chart of avg budget usage
  const avgUsed = history.reduce((s, h) => s + (h.budget_total - h.budget_remaining) / h.budget_total, 0) / history.length;
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 20;

  // Spent
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + avgUsed * Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#4f9eff';
  ctx.fill();

  // Remaining
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, -Math.PI / 2 + avgUsed * Math.PI * 2, -Math.PI / 2 + Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(52,211,153,0.4)';
  ctx.fill();

  // Center text
  ctx.fillStyle = '#e8eaf0';
  ctx.font = 'bold 18px DM Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(avgUsed * 100)}%`, cx, cy + 4);
  ctx.font = '11px DM Sans, sans-serif';
  ctx.fillStyle = '#8b92a8';
  ctx.fillText('avg used', cx, cy + 18);
}

// ─── History ──────────────────────────────────────────────────
function updateHistory() {
  const list = document.getElementById('historyList');
  const history = state.sessionHistory;

  if (history.length === 0) {
    list.innerHTML = `<div class="history-empty"><div class="history-empty-icon">🗺</div><p>No completed trips yet. Start planning!</p></div>`;
    return;
  }

  const destEmojis = { Paris: '🗼', Tokyo: '🗾', London: '🎡' };
  list.innerHTML = history.map(h => {
    const grade = getGrade(h.score);
    const emoji = destEmojis[h.destination] || '✈️';
    return `
      <div class="history-item">
        <div class="history-item-icon">${emoji}</div>
        <div class="history-item-body">
          <div class="history-item-title">${h.origin} → ${h.destination}</div>
          <div class="history-item-meta">
            ${h.date} · $${h.budget_total} budget · ${h.activities} activities · ${h.flight} · ${h.hotel}
          </div>
        </div>
        <div>
          <div class="history-item-score">${(h.score * 100).toFixed(0)}</div>
          <div style="font-size:0.75rem;text-align:center;color:var(--text2)">${grade.emoji} ${grade.label}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── Confetti ─────────────────────────────────────────────────
function triggerConfetti() {
  const container = document.getElementById('confetti');
  const colors = ['#4f9eff', '#7b61ff', '#f5c842', '#34d399', '#fb923c'];
  for (let i = 0; i < 30; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `
      position:absolute; width:${4 + Math.random() * 6}px; height:${4 + Math.random() * 6}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:50%; left:${Math.random() * 100}%;
      animation: confettiFall ${1 + Math.random() * 2}s ease-out ${Math.random()}s forwards;
      opacity:0;`;
    container.appendChild(dot);
    setTimeout(() => dot.remove(), 3000);
  }

  if (!document.getElementById('confettiStyle')) {
    const style = document.createElement('style');
    style.id = 'confettiStyle';
    style.textContent = `
      @keyframes confettiFall {
        0% { opacity:1; transform: translateY(-20px) rotate(0deg); }
        100% { opacity:0; transform: translateY(150px) rotate(360deg); }
      }`;
    document.head.appendChild(style);
  }
}

// ─── Theme ────────────────────────────────────────────────────
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
  localStorage.setItem('theme', state.theme);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  document.getElementById('themeToggle').textContent = theme === 'light' ? '🌙' : '☀️';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Loading ──────────────────────────────────────────────────
function showLoading(text = 'Loading...') {
  document.getElementById('loaderText').textContent = text;
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

// ─── API ──────────────────────────────────────────────────────
async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
