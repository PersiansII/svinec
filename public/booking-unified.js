// Unified booking wizard for rooms + common rooms (CZ)
let ui = {
  steps: [],
};

// Data stores
let roomsData = [];
let allBookings = [];
let seasons = [];
let commonRooms = [];
let commonBookings = [];

// Selection state
let bookingType = 'rooms'; // 'rooms' | 'common'
let selectedRooms = []; // rooms ids (numeric or string)
let commonSelectedRooms = []; // for common rooms
let galleryPhotos = [];
let galleryIndex = 0;

// Room booking state
let bookingState = {
  startDate: '',
  endDate: '',
  people: 1,
  rooms: [],
  dog: false,
  breakfast: false,
  name: '',
  email: '',
  phone: '',
  dogs: [],
  extraBeds: [],
  cots: [],
  bikes: [],
  breakfastPeople: 0,
  occupancy: {},
  totalPrice: 0
};

// Common booking state
let commonState = {
  date: '',
  rooms: [],
  peoplePerRoom: {}, // {roomId: people}
  slots: [], // array of slot indices (0 morning, 1 afternoon)
  name: '',
  email: '',
  phone: '',
  totalPrice: 0
};

// Helpers
function showStep(n){
  document.querySelectorAll('.step').forEach((el,i)=>{ el.classList.toggle('active', i===n); });
}
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

// Step 1 helpers
function setNextEnabled(enabled) {
  const btn = document.getElementById('to-step-2');
  if (!btn) return;
  btn.disabled = !enabled;
}
function clearDateWarning(){
  const warn = document.getElementById('date-warning-calendar');
  if (warn) warn.remove();
}
function ensureWarningContainer(){
  let warn = document.getElementById('date-warning-calendar');
  if (!warn) {
    const selEl = document.getElementById('selected-dates');
    if (!selEl || !selEl.parentNode) return null;
    warn = document.createElement('div');
    warn.id = 'date-warning-calendar';
    warn.style.marginTop = '8px';
    warn.style.padding = '8px';
    warn.style.background = '#ffe6e6';
    warn.style.color = '#7a0000';
    warn.style.fontWeight = '600';
    warn.style.border = '1px solid #ff9b9b';
    selEl.parentNode.insertBefore(warn, selEl.nextSibling);
  }
  return warn;
}
function updateNextBasedOnRooms(){
  try {
    const sel = typeof window.getSelectedDates === 'function' ? window.getSelectedDates() : { start:'', end:'' };
    const valid = sel.start && sel.end && new Date(sel.start) < new Date(sel.end);
    let hasFullDayInRange = false;
    if (valid && typeof window.getCalendarOccupancyMap === 'function'){
      const map = window.getCalendarOccupancyMap() || {};
      const start = new Date(sel.start); start.setHours(0,0,0,0);
      const end = new Date(sel.end); end.setHours(0,0,0,0);
      for (let t=start.getTime(); t<end.getTime(); t+=24*60*60*1000){
        const d = new Date(t);
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if ((map[iso]||0) >= 100) { hasFullDayInRange = true; break; }
      }
    }
    const warnEl = ensureWarningContainer();
    if (warnEl){
      if (valid && hasFullDayInRange){
        warnEl.textContent = 'Jejda! V tohle datum je už chata plná. Zkuste prosím jiné datum.';
        warnEl.style.display = 'block';
      } else {
        warnEl.style.display = 'none';
      }
    }
    setNextEnabled(valid && !hasFullDayInRange);
  } catch (e) {
    setNextEnabled(false);
  }
}

function openPhotoModal(photos, idx){
  galleryPhotos = photos || [];
  galleryIndex = idx || 0;
  const modal = document.getElementById('photo-modal');
  const img = document.getElementById('photo-modal-img');
  if (!galleryPhotos.length) return;
  img.src = galleryPhotos[galleryIndex];
  modal.style.display = 'flex';
}
function updateNavButtons(){
  // no-op in unified for now
}
function closeModal(){ document.getElementById('photo-modal').style.display='none'; }

// Unified calendar state for Step 1
let calDate = new Date();
let roomsCalClickHandler = null;

// Render the Step 1 calendar with the same visuals for both flows
async function renderUnifiedCalendar(){
  const container = document.getElementById('calendar-container');
  const selInfo = document.getElementById('selected-dates');
  if (!container) return;
  container.innerHTML = '';
  if (selInfo) selInfo.textContent = '';
  // default: require a selection
  setNextEnabled(false);
  clearDateWarning();
  // Detach any previous rooms click handler to avoid cross-flow interference
  if (roomsCalClickHandler) {
    try { container.removeEventListener('click', roomsCalClickHandler); } catch (e) { /* ignore */ }
    roomsCalClickHandler = null;
  }

  if (bookingType === 'rooms'){
    // Use calendar.js renderer (supports occupancy + range select)
    if (typeof window.renderCalendar === 'function'){
      await window.renderCalendar();
    } else if (typeof window.initCalendar === 'function') {
      // fallback for older calendar.js API
      window.initCalendar('#calendar-container', '#selected-dates');
    }
    // Track clicks to recompute Next enabled state
    roomsCalClickHandler = () => setTimeout(updateNextBasedOnRooms, 0);
    container.addEventListener('click', roomsCalClickHandler, { once:false });
    // initial state check
    setTimeout(updateNextBasedOnRooms, 0);
    return;
  }

  // Common rooms calendar: build a table styled like the rooms calendar
  // Uses booking.css .calendar-table styles
  // Fetch confirmed-only bookings for occupancy parity with rooms
  let confirmedCommon = [];
  try { const res = await fetch('/api/common-bookings/confirmed'); confirmedCommon = await res.json().catch(()=>[]); } catch(e){ confirmedCommon = []; }

  const table = document.createElement('table');
  table.className = 'calendar-table';
  const thead = document.createElement('thead');
  // Header row: prev | month year | next (left/center/right)
  const header = document.createElement('tr');
  const thPrev = document.createElement('th');
  const thLabel = document.createElement('th'); thLabel.colSpan = 5;
  const thNext = document.createElement('th');

  const prevBtn = document.createElement('button'); prevBtn.type='button'; prevBtn.textContent = '‹';
  const nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.textContent = '›';
  const labelSpan = document.createElement('span'); labelSpan.style.margin = '0 8px';

  thPrev.appendChild(prevBtn);
  thLabel.appendChild(labelSpan);
  thNext.appendChild(nextBtn);
  header.appendChild(thPrev);
  header.appendChild(thLabel);
  header.appendChild(thNext);
  thead.appendChild(header);

  const daysHead = document.createElement('tr');
  const dayNames = ['Po','Út','St','Čt','Pá','So','Ne'];
  dayNames.forEach(d => { const th = document.createElement('th'); th.textContent = d; daysHead.appendChild(th); });
  thead.appendChild(daysHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  container.appendChild(table);

  const today = new Date(); today.setHours(0,0,0,0);
  const visibleCommon = (commonRooms||[]).filter(r => typeof r.showInCalendar==='undefined' ? true : !!r.showInCalendar);
  const totalCommon = visibleCommon.length || 1;

  function bookingCoversNight(b, D){
    const S = b.start || b.startDate || b.startDateTime;
    const E = b.end || b.endDate || b.endDateTime;
    if (!S || !E) return false;
    const s = new Date(S); s.setHours(0,0,0,0);
    const e = new Date(E); e.setHours(0,0,0,0);
    return s.getTime() <= D.getTime() && e.getTime() > D.getTime();
  }

  function paint(){
    // header label
    labelSpan.textContent = calDate.toLocaleDateString('cs-CZ', { month:'long', year:'numeric' });
    // clear body
    tbody.innerHTML = '';

    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const first = new Date(year, month, 1);
    const startDay = (first.getDay()+6)%7; // Monday=0
    const daysInMonth = new Date(year, month+1, 0).getDate();

    let row = document.createElement('tr');
    // padding
    for (let i=0;i<startDay;i++){ const td=document.createElement('td'); td.style.opacity='0.4'; td.style.cursor='default'; row.appendChild(td); }
    for (let d=1; d<=daysInMonth; d++){
      if (row.children.length === 7){ tbody.appendChild(row); row=document.createElement('tr'); }
      const dt = new Date(year, month, d); dt.setHours(0,0,0,0);
      const td = document.createElement('td');
      td.textContent = d;
      // occupancy colors (match calendar.js buckets)
      const used = new Set();
  confirmedCommon.forEach(b => { if (bookingCoversNight(b, dt)){ (b.rooms||[]).forEach(r => used.add(String(r))); }});
      const pct = Math.min(100, Math.round((used.size/totalCommon)*100));
      if (pct>=100) { td.style.background = '#e74c3c'; td.style.color = '#ffffff'; }
      else if (pct>60) { td.style.background = '#e67e22'; td.style.color = '#ffffff'; }
      else if (pct>30) { td.style.background = '#f1c40f'; td.style.color = '#111111'; }
      else if (pct>0) { td.style.background = '#fff8c2'; td.style.color = '#111111'; }
      else { td.style.background = '#2ecc71'; td.style.color = '#ffffff'; }
      if (dt.getTime()===today.getTime()) td.classList.add('today');

      td.addEventListener('click', ()=>{
        commonState.date = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if (selInfo) selInfo.textContent = `Vybrané datum: ${commonState.date}`;
        // highlight selection
        tbody.querySelectorAll('td').forEach(cell => cell.classList.remove('selected'));
        td.classList.add('selected');
        // show/hide warning for fully occupied day
        const warn = ensureWarningContainer();
        if (warn) {
          if (pct >= 100) {
            warn.textContent = 'Jejda! V tohle datum je už chata plná. Zkuste prosím jiné datum.';
            warn.style.display = 'block';
          } else {
            warn.style.display = 'none';
          }
        }
        // enable next only if a date is chosen and not fully occupied
        setNextEnabled(pct < 100);
      });

      // disable past dates for parity with rooms flow
      if (dt < today) {
        td.style.opacity = 0.5;
        td.style.pointerEvents = 'none';
      }
      row.appendChild(td);
    }
    // pad end
    while (row.children.length < 7){ const td=document.createElement('td'); td.style.opacity='0.4'; td.style.cursor='default'; row.appendChild(td); }
    tbody.appendChild(row);
  }

  prevBtn.addEventListener('click', ()=>{ calDate.setMonth(calDate.getMonth()-1); paint(); });
  nextBtn.addEventListener('click', ()=>{ calDate.setMonth(calDate.getMonth()+1); paint(); });
  paint();

  // initial enablement state for common: require chosen non-full date
  setNextEnabled(!!commonState.date && (function(){
    try {
      if (!commonState.date) return false;
      const [yy,mm,dd] = commonState.date.split('-').map(Number);
      const dt = new Date(yy, (mm||1)-1, dd||1); dt.setHours(0,0,0,0);
      const used = new Set();
      confirmedCommon.forEach(b => { if (bookingCoversNight(b, dt)){ (b.rooms||[]).forEach(r => used.add(String(r))); }});
      const pct = Math.min(100, Math.round((used.size/totalCommon)*100));
      return pct < 100;
    } catch (e) { return false; }
  })());
}

// Loaders
async function loadRooms(){
  try{
    const res = await fetch('/api/rooms');
    roomsData = await res.json();
    return true;
  }catch(e){ console.error('Rooms load failed', e); return false; }
}
async function loadRoomBookings(){
  try{
    const res = await fetch('/api/bookings/confirmed');
    const confirmed = await res.json();
    const p = await fetch('/api/bookings/pending');
    const pending = await p.json();
    allBookings = [...(confirmed||[]), ...(pending||[])];
    return true;
  }catch(e){ console.error('Bookings load failed', e); return false; }
}
async function loadSeasons(){
  try{ const res = await fetch('/api/seasons'); seasons = await res.json(); }catch(e){ seasons = []; }
}
async function loadCommonRooms(){
  try{ const res = await fetch('/api/common-rooms'); commonRooms = await res.json(); return true; }catch(e){ return false; }
}
async function loadCommonBookings(){
  try{
    const [cRes, pRes] = await Promise.all([
      fetch('/api/common-bookings/confirmed'),
      fetch('/api/common-bookings/pending')
    ]);
    const c = await cRes.json().catch(()=>[]);
    const p = await pRes.json().catch(()=>[]);
    commonBookings = [...(c||[]), ...(p||[])];
    return true;
  }catch(e){ commonBookings=[]; return false; }
}

// Availability and price
function overlaps(aStart, aEnd, bStart, bEnd){
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}
function getAvailableRooms(startDate, endDate){
  const start = new Date(startDate), end = new Date(endDate);
  return roomsData.filter(room => {
    const conflicts = allBookings.some(b =>
      (b.rooms||[]).includes(room.id) && new Date(b.startDate) < end && new Date(b.endDate) > start
    );
    return !conflicts && (room.isActive !== false);
  });
}
function getNightlyPrice(room, startDate, endDate){
  let nights = (new Date(endDate) - new Date(startDate)) / (1000*60*60*24);
  let total = 0;
  for (let i=0;i<nights;i++){
    const d = new Date(new Date(startDate).getTime() + i*24*60*60*1000);
    // season pricing
    const season = (seasons||[]).find(s => new Date(s.startDate) <= d && d < new Date(s.endDate));
    const price = season && season.prices && season.prices[room.group] != null
      ? season.prices[room.group]
      : room.price || 0;
    total += price;
  }
  return Math.round(total);
}

// UI renderers
function renderRoomsStep(){
  const container = document.getElementById('rooms-list');
  container.innerHTML = '';
  selectedRooms = [];
  const start = bookingState.startDate, end = bookingState.endDate;
  if (!start || !end){ container.innerHTML = '<div style="color:#b71c1c">Nejprve zvolte termín.</div>'; return; }
  const available = getAvailableRooms(start, end);
  available.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    const photos = (room.photos||[]).map(p => `/images/rooms/${p}`);
    const price = getNightlyPrice(room, start, end);
    card.innerHTML = `
      <img src="${photos[0]||''}" alt="${room.name}" style="cursor:pointer">
      <div style="flex:1">
        <div><strong>${room.name}</strong></div>
        <div>${room.description||''}</div>
        <div>Cena: ${price} Kč</div>
        <div>Lůžek: ${room.beds||0}</div>
        <label style="margin-top:6px;display:inline-flex;gap:6px;align-items:center">
          <input type="checkbox" class="room-select" data-id="${room.id}"> Vybrat pokoj
        </label>
        <div class="people-wrap" data-id="${room.id}" style="display:none;margin-top:6px">
          <label>Počet osob: <input type="number" min="1" max="${(room.beds||1)}" value="1" class="people-input" data-id="${room.id}"></label>
        </div>
      </div>`;
    const img = card.querySelector('img');
    img.addEventListener('click', ()=> openPhotoModal(photos, 0));
    container.appendChild(card);
  });

  container.querySelectorAll('.room-select').forEach(cb => {
    cb.addEventListener('change', (e)=>{
      const id = parseInt(e.target.dataset.id,10);
      if (e.target.checked){
        if (!selectedRooms.includes(id)) selectedRooms.push(id);
        container.querySelector(`.people-wrap[data-id="${id}"]`).style.display = 'block';
        // default occupancy
        bookingState.occupancy[id] = bookingState.occupancy[id] || 1;
      } else {
        selectedRooms = selectedRooms.filter(x=>x!==id);
        container.querySelector(`.people-wrap[data-id="${id}"]`).style.display = 'none';
        delete bookingState.occupancy[id];
      }
      updateOrderSummaryRooms(2);
    });
  });
  container.querySelectorAll('.people-input').forEach(inp => {
    inp.addEventListener('input', e=>{
      const id = parseInt(e.target.dataset.id,10);
      const room = roomsData.find(r=>r.id===id);
      const max = (room && room.beds)||1;
      const val = clamp(parseInt(e.target.value||'1',10),1,max);
      e.target.value = val;
      bookingState.occupancy[id] = val;
      updateOrderSummaryRooms(2);
    });
  });

  // summary container exists in HTML; update now
  updateOrderSummaryRooms(2);
}

function updateOrderSummaryRooms(step){
  const start = bookingState.startDate ? new Date(bookingState.startDate) : null;
  const end = bookingState.endDate ? new Date(bookingState.endDate) : null;
  let nights = 0; if (start && end) nights = (end - start)/(1000*60*60*24);
  const ids = step===2 ? selectedRooms : (bookingState.rooms||[]);
  let peopleSum = ids.reduce((acc,id)=> acc + (bookingState.occupancy[id]||0), 0);
  let price = 0;
  ids.forEach(id=>{
    const room = roomsData.find(r=>r.id===id); if (!room) return;
    price += getNightlyPrice(room, bookingState.startDate, bookingState.endDate);
  });
  // breakfast/services added in full calc later
  const el = document.getElementById(step===2 ? 'order-summary-2' : 'order-summary-3');
  if (el){
    el.innerHTML = `
      <div style="margin-top:12px; padding:10px; background:#fff; border:1px solid #e6e6e6;">
        <div><strong>Datum:</strong> ${bookingState.startDate || '-'} – ${bookingState.endDate || '-'}</div>
        <div><strong>Počet nocí:</strong> ${nights}</div>
        <div><strong>Počet osob (součet po pokojích):</strong> ${peopleSum}</div>
        <div><strong>Základní cena:</strong> ${price} Kč</div>
      </div>`;
  }
}

function renderCommonRoomsStep(){
  const container = document.getElementById('common-rooms-list');
  container.innerHTML = '';
  commonSelectedRooms = [];
  commonRooms.filter(r => (typeof r.showInCalendar==='undefined') ? true : !!r.showInCalendar)
    .forEach(room => {
      const photos = (room.photos||[]).map(p => `/images/common/${p}`);
      const card = document.createElement('div');
      card.className = 'room-card';
      card.innerHTML = `
        <img src="${photos[0]||''}" alt="${room.name}" style="cursor:pointer">
        <div style="flex:1">
          <div><strong>${room.name}</strong></div>
          <div>${room.description||''}</div>
          <div>Cena za blok: ${room.price||0} Kč</div>
          <div>Kapacita: ${room.capacity||0}</div>
          <label style="margin-top:6px;display:inline-flex;gap:6px;align-items:center">
            <input type="checkbox" class="common-room-select" data-id="${room.id}"> Vybrat místnost
          </label>
          <div class="people-wrap" data-id="${room.id}" style="display:none;margin-top:6px">
            <label>Počet osob: <input type="number" min="1" max="${room.capacity||1}" value="1" class="common-people-input" data-id="${room.id}"></label>
          </div>
        </div>`;
      card.querySelector('img').addEventListener('click', ()=> openPhotoModal(photos,0));
      container.appendChild(card);
    });

  container.querySelectorAll('.common-room-select').forEach(cb => {
    cb.addEventListener('change', (e)=>{
      const idRaw = e.target.dataset.id; // can be string id
      const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
      if (e.target.checked){
        if (!commonSelectedRooms.includes(id)) commonSelectedRooms.push(id);
        container.querySelector(`.people-wrap[data-id="${idRaw}"]`).style.display = 'block';
        commonState.peoplePerRoom[id] = commonState.peoplePerRoom[id] || 1;
      } else {
        commonSelectedRooms = commonSelectedRooms.filter(x=>x!==id);
        container.querySelector(`.people-wrap[data-id="${idRaw}"]`).style.display = 'none';
        delete commonState.peoplePerRoom[id];
      }
      updateOrderSummaryCommon(2);
    });
  });

  container.querySelectorAll('.common-people-input').forEach(inp => {
    inp.addEventListener('input', e=>{
      const idRaw = e.target.dataset.id;
      const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
      const room = commonRooms.find(r=>String(r.id)===String(idRaw));
      const max = (room && room.capacity)||1;
      const val = clamp(parseInt(e.target.value||'1',10),1,max);
      e.target.value = val;
      commonState.peoplePerRoom[id] = val;
      updateOrderSummaryCommon(2);
    });
  });
  updateOrderSummaryCommon(2);
}

function updateOrderSummaryCommon(step){
  const date = commonState.date || '-';
  const ids = step===2 ? commonSelectedRooms : (commonState.rooms||[]);
  let peopleSum = ids.reduce((acc,id)=> acc + (commonState.peoplePerRoom[id]||0), 0);
  let price = 0;
  ids.forEach(id => {
    const room = commonRooms.find(r=>String(r.id)===String(id));
    if (room) price += room.price||0; // per slot—but we’ll multiply by slots at submission
  });
  const elId = step===2 ? 'order-summary-2-common' : 'order-summary-3-common';
  const el = document.getElementById(elId);
  if (el){
    el.innerHTML = `
      <div style="margin-top:12px; padding:10px; background:#fff; border:1px solid #e6e6e6;">
        <div><strong>Datum:</strong> ${date}</div>
        <div><strong>Počet osob (součet po místnostech):</strong> ${peopleSum}</div>
        <div><strong>Cena (za 1 blok):</strong> ${price} Kč</div>
      </div>`;
  }
}

// Common slots
const SLOTS = [
  { label: 'Dopoledne', start: 6, end: 12 },
  { label: 'Odpoledne', start: 12, end: 24 }
];
function toISODateTime(dateStr, hour){
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d, 0,0,0,0);
  const hh = hour>=24 ? 23 : hour;
  const mm = hour>=24 ? 59 : 0;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), hh, mm, 0).toISOString();
}
function slotsOverlap(aS, aE, bS, bE){
  return new Date(aS) < new Date(bE) && new Date(aE) > new Date(bS);
}

function renderCommonSlots(){
  const container = document.getElementById('slots');
  container.innerHTML = '';
  if (!commonState.date || !commonSelectedRooms.length){
    container.innerHTML = '<div style="color:#555">Nejprve vyberte místnost(i) a datum.</div>';
    return;
  }
  // disable a slot if ANY selected room is occupied in that slot
  SLOTS.forEach((slot, idx) => {
    const slotStart = toISODateTime(commonState.date, slot.start);
    const slotEnd   = toISODateTime(commonState.date, slot.end);
    const disabled = commonBookings.some(b => {
      // booking may have rooms array and ISO start/end
      const bRooms = b.rooms||[];
      if (!bRooms.some(r => commonSelectedRooms.map(String).includes(String(r)))) return false;
      const bS = b.start || b.startDate || b.startDateTime;
      const bE = b.end || b.endDate || b.endDateTime;
      if (!bS || !bE) return false;
      return slotsOverlap(slotStart, slotEnd, bS, bE);
    });
    const wrap = document.createElement('label');
    wrap.className = 'slot' + (disabled ? ' disabled' : '');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    wrap.style.border = '1px solid #ddd';
    wrap.style.padding = '8px';
    wrap.innerHTML = `<input type="checkbox" class="slot-cb" data-idx="${idx}" ${disabled?'disabled':''}/> ${slot.label}`;
    container.appendChild(wrap);
  });
}

// removed old renderCommonCalendar in favor of renderUnifiedCalendar

// Price calculations
function calculateTotalPriceRooms(){
  let total = 0;
  bookingState.rooms.forEach(id => {
    const room = roomsData.find(r=>r.id===id); if (!room) return;
    total += getNightlyPrice(room, bookingState.startDate, bookingState.endDate);
  });
  // extra services
  bookingState.dogs.forEach(() => { total += 100; });
  bookingState.extraBeds.forEach(() => { total += 150; });
  bookingState.cots.forEach(() => { total += 50; });
  bookingState.bikes.forEach(() => { total += 20; });
  if (bookingState.breakfast) {
    let nights = (new Date(bookingState.endDate) - new Date(bookingState.startDate))/(1000*60*60*24);
    total += (bookingState.breakfastPeople||0) * 150 * (nights||0);
  }
  bookingState.totalPrice = Math.round(total);
  return bookingState.totalPrice;
}
function calculateTotalPriceCommon(){
  let total = 0;
  (commonState.rooms||[]).forEach(id => {
    const room = commonRooms.find(r=>String(r.id)===String(id)); if (!room) return;
    total += (room.price||0) * (commonState.slots.length||0);
  });
  commonState.totalPrice = Math.round(total);
  return commonState.totalPrice;
}

// Services (rooms) — simplified reuse from existing flow
function renderServicesStep(){
  const container = document.getElementById('services-list');
  container.innerHTML = '';
  bookingState.rooms.forEach(id => {
    const room = roomsData.find(r=>r.id===id); if (!room) return;
    const wrap = document.createElement('div');
    wrap.style.border = '1px solid #ddd'; wrap.style.padding = '8px'; wrap.style.marginBottom = '8px';
    wrap.innerHTML = `
      <div><strong>${room.name}</strong></div>
      <label><input type="checkbox" class="svc-dog" data-id="${id}"> Pes</label>
      <label><input type="checkbox" class="svc-extrabed" data-id="${id}"> Přistýlka</label>
      <label><input type="checkbox" class="svc-cot" data-id="${id}"> Dětská postýlka</label>
      <label><input type="checkbox" class="svc-bike" data-id="${id}"> Úschova kol</label>
    `;
    container.appendChild(wrap);
  });
  // breakfast as global
  const bf = document.createElement('div');
  bf.style.border = '1px solid #ddd'; bf.style.padding = '8px';
  bf.innerHTML = `
    <label><input type="checkbox" id="breakfast-checkbox"> Snídaně</label>
    <div id="breakfast-people-wrap" style="display:none;margin-top:6px">
      Počet osob na snídani: <input type="number" id="breakfast-people" min="1" value="1">
    </div>`;
  container.appendChild(bf);

  container.querySelectorAll('.svc-dog').forEach(cb => cb.addEventListener('change', e=>{
    const id = parseInt(e.target.dataset.id,10);
    if (e.target.checked) bookingState.dogs.push(id); else bookingState.dogs = bookingState.dogs.filter(x=>x!==id);
    updateOrderSummaryRooms(3);
  }));
  container.querySelectorAll('.svc-extrabed').forEach(cb => cb.addEventListener('change', e=>{
    const id = parseInt(e.target.dataset.id,10);
    if (e.target.checked) bookingState.extraBeds.push(id); else bookingState.extraBeds = bookingState.extraBeds.filter(x=>x!==id);
    updateOrderSummaryRooms(3);
  }));
  container.querySelectorAll('.svc-cot').forEach(cb => cb.addEventListener('change', e=>{
    const id = parseInt(e.target.dataset.id,10);
    if (e.target.checked) bookingState.cots.push(id); else bookingState.cots = bookingState.cots.filter(x=>x!==id);
    updateOrderSummaryRooms(3);
  }));
  container.querySelectorAll('.svc-bike').forEach(cb => cb.addEventListener('change', e=>{
    const id = parseInt(e.target.dataset.id,10);
    if (e.target.checked) bookingState.bikes.push(id); else bookingState.bikes = bookingState.bikes.filter(x=>x!==id);
    updateOrderSummaryRooms(3);
  }));
  document.getElementById('breakfast-checkbox').addEventListener('change', e=>{
    const wrap = document.getElementById('breakfast-people-wrap');
    if (e.target.checked){ wrap.style.display='block'; bookingState.breakfast = true; bookingState.breakfastPeople = parseInt(document.getElementById('breakfast-people').value||'1',10); }
    else { wrap.style.display='none'; bookingState.breakfast=false; bookingState.breakfastPeople=0; }
    updateOrderSummaryRooms(3);
  });
  document.getElementById('breakfast-people').addEventListener('input', e=>{
    bookingState.breakfastPeople = clamp(parseInt(e.target.value||'1',10),1,999);
    e.target.value = bookingState.breakfastPeople;
    updateOrderSummaryRooms(3);
  });

  updateOrderSummaryRooms(3);
}

// Summary (step 4)
function renderSummary(){
  const ul = document.getElementById('summary-list');
  if (bookingType === 'rooms'){
    const start = bookingState.startDate, end = bookingState.endDate;
    let nights = 0; if (start && end) nights = (new Date(end)-new Date(start))/(1000*60*60*24);
    ul.innerHTML = `
      <li><strong>Typ:</strong> Ubytování</li>
      <li><strong>Datum:</strong> ${start} – ${end}</li>
      <li><strong>Počet nocí:</strong> ${nights}</li>
      <li><strong>Pokoje:</strong> ${bookingState.rooms.map(id=>{ const r=roomsData.find(x=>x.id===id); return r?r.name:id; }).join(', ')}</li>
      <li><strong>Obsazení:</strong>
        <ul>
          ${bookingState.rooms.map(id=>{ const r=roomsData.find(x=>x.id===id); const nm=r?r.name:id; const c=bookingState.occupancy[id]||0; return `<li>${nm}: ${c} os.</li>`; }).join('')}
        </ul>
      </li>
    `;
    document.getElementById('total-price').textContent = calculateTotalPriceRooms();
  } else {
    ul.innerHTML = `
      <li><strong>Typ:</strong> Společné prostory</li>
      <li><strong>Datum:</strong> ${commonState.date}</li>
      <li><strong>Místnosti:</strong> ${commonState.rooms.map(id=>{ const r=commonRooms.find(x=>String(x.id)===String(id)); return r?r.name:id; }).join(', ')}</li>
      <li><strong>Obsazení:</strong>
        <ul>
          ${commonState.rooms.map(id=>{ const r=commonRooms.find(x=>String(x.id)===String(id)); const nm=r?r.name:id; const c=commonState.peoplePerRoom[id]||0; return `<li>${nm}: ${c} os.</li>`; }).join('')}
        </ul>
      </li>
      <li><strong>Časové bloky:</strong> ${commonState.slots.map(i=>SLOTS[i].label).join(', ')}</li>
    `;
    document.getElementById('total-price').textContent = calculateTotalPriceCommon();
  }
}

// Form navigation
function wireNav(){
  // step 0: instant choice buttons
  const chooseRooms = document.getElementById('choose-rooms');
  const chooseCommon = document.getElementById('choose-common');
  if (chooseRooms) chooseRooms.onclick = async function(){
    bookingType = 'rooms';
    // hard reset both flows' date selections
    if (typeof window.resetCalendarSelection === 'function') window.resetCalendarSelection();
    commonState.date = '';
    clearDateWarning();
    // wipe selections/state
    selectedRooms = [];
    bookingState.rooms = [];
    bookingState.occupancy = {};
    bookingState.people = 0;
    commonSelectedRooms = [];
    commonState.rooms = [];
    commonState.peoplePerRoom = {};
    commonState.slots = [];
    await loadRooms();
    await loadRoomBookings();
    await loadSeasons();
    await renderUnifiedCalendar();
    showStep(1);
  };
  if (chooseCommon) chooseCommon.onclick = async function(){
    bookingType = 'common';
    // hard reset both flows' date selections
    if (typeof window.resetCalendarSelection === 'function') window.resetCalendarSelection();
    commonState.date = '';
    clearDateWarning();
    // wipe selections/state
    selectedRooms = [];
    bookingState.rooms = [];
    bookingState.occupancy = {};
    bookingState.people = 0;
    commonSelectedRooms = [];
    commonState.rooms = [];
    commonState.peoplePerRoom = {};
    commonState.slots = [];
    await loadCommonRooms();
    await loadCommonBookings();
    await renderUnifiedCalendar();
    showStep(1);
  };
  document.getElementById('back-to-0-1').onclick = function(){
    // reset selections when going back from Step 1 to type choice
    if (typeof window.resetCalendarSelection === 'function') window.resetCalendarSelection();
    commonState.date = '';
    clearDateWarning();
    // wipe selections/state
    selectedRooms = [];
    bookingState.rooms = [];
    bookingState.occupancy = {};
    bookingState.people = 0;
    commonSelectedRooms = [];
    commonState.rooms = [];
    commonState.peoplePerRoom = {};
    commonState.slots = [];
    // detach rooms handler if any
    const container = document.getElementById('calendar-container');
    if (roomsCalClickHandler && container) {
      try { container.removeEventListener('click', roomsCalClickHandler); } catch (e) {}
      roomsCalClickHandler = null;
    }
    showStep(0);
  };

  // step 1 -> 2
  document.getElementById('to-step-2').onclick = function(){
    if (bookingType === 'rooms'){
      const sel = typeof window.getSelectedDates === 'function' ? window.getSelectedDates() : {start:null,end:null};
      const { start, end } = sel || {};
      if (!start || !end || new Date(start) >= new Date(end)){
        alert('Vyberte platný termín pobytu.');
        return;
      }
      bookingState.startDate = start; bookingState.endDate = end;
      renderRoomsStep();
    } else {
      const date = commonState.date;
      if (!date){ alert('Vyberte datum.'); return; }
      commonState.date = date;
      renderCommonRoomsStep();
    }
    showStep(2);
  };
  document.getElementById('back-to-1').onclick = async function(){
    // reset per-flow selections when navigating back to Step 1
    if (bookingType === 'rooms'){
      if (typeof window.resetCalendarSelection === 'function') window.resetCalendarSelection();
      selectedRooms = [];
      bookingState.rooms = [];
      bookingState.occupancy = {};
      bookingState.people = 0;
    } else {
      commonState.date = '';
      commonSelectedRooms = [];
      commonState.rooms = [];
      commonState.peoplePerRoom = {};
      commonState.slots = [];
    }
    clearDateWarning();
    // detach rooms handler if any
    const container = document.getElementById('calendar-container');
    if (roomsCalClickHandler && container) {
      try { container.removeEventListener('click', roomsCalClickHandler); } catch (e) {}
      roomsCalClickHandler = null;
    }
    await renderUnifiedCalendar();
    showStep(1);
  };

  // step 2 -> 3
  document.getElementById('to-step-3').onclick = function(){
    if (bookingType === 'rooms'){
      // validate
      if (selectedRooms.length < 1){ document.getElementById('rooms-error').style.display='block'; return; }
      let sum = 0; let missing = false;
      selectedRooms.forEach(id => { const v = bookingState.occupancy[id]; if (!v || v<1) missing = true; sum += (v||0); });
      if (missing || sum<1){ document.getElementById('rooms-error').style.display='block'; return; }
      document.getElementById('rooms-error').style.display='none';
      bookingState.rooms = [...selectedRooms];
      bookingState.people = sum;
      renderServicesStep();
      updateOrderSummaryRooms(3);
    } else {
      if (!commonSelectedRooms.length){ document.getElementById('common-rooms-error').style.display='block'; return; }
      let sum = 0; let over = false;
      commonSelectedRooms.forEach(id => {
        const room = commonRooms.find(r=>String(r.id)===String(id));
        const c = clamp(commonState.peoplePerRoom[id]||0, 1, (room&&room.capacity)||1);
        commonState.peoplePerRoom[id] = c; sum += c;
        if (room && c > room.capacity) over = true;
      });
      if (sum<1 || over){ document.getElementById('common-rooms-error').style.display='block'; return; }
      document.getElementById('common-rooms-error').style.display='none';
      commonState.rooms = [...commonSelectedRooms];
      renderCommonSlots();
      updateOrderSummaryCommon(3);
    }
    showStep(3);
  };
  document.getElementById('back-to-2').onclick = function(){ showStep(2); };

  // step 3 -> 4
  document.getElementById('to-step-4').onclick = function(){
    if (bookingType === 'rooms'){
      // collect breakfast and services are already tracked in state via change handlers
      renderSummary();
    } else {
      // collect slots
      const selected = Array.from(document.querySelectorAll('#slots input.slot-cb'))
        .filter(i=>i.checked && !i.disabled)
        .map(i=>parseInt(i.dataset.idx,10));
      if (!selected.length){ document.getElementById('slots-error').style.display='block'; return; }
      document.getElementById('slots-error').style.display='none';
      commonState.slots = selected.sort((a,b)=>a-b);
      renderSummary();
    }
    showStep(4);
  };
  document.getElementById('back-to-3').onclick = function(){ showStep(3); };

  // submit
  document.getElementById('booking-unified-form').addEventListener('submit', async function(e){
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    if (bookingType==='rooms'){
      bookingState.name=name; bookingState.email=email; bookingState.phone=phone;
      // sanity occupancy
      let s=0; bookingState.rooms.forEach(id => { s += bookingState.occupancy[id]||0; });
      if (s !== bookingState.people){ alert('Součet osob neodpovídá.'); return; }
      calculateTotalPriceRooms();
      const payload = {
        startDate: bookingState.startDate,
        endDate: bookingState.endDate,
        rooms: bookingState.rooms,
        occupancy: bookingState.occupancy,
        people: bookingState.people,
        dogs: bookingState.dogs,
        extraBeds: bookingState.extraBeds,
        cots: bookingState.cots,
        bikes: bookingState.bikes,
        breakfast: bookingState.breakfast,
        breakfastPeople: bookingState.breakfastPeople,
        name, email, phone
      };
      try{
        const res = await fetch('/api/bookings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        if (!res.ok){ throw new Error('Chyba při odesílání.'); }
        alert('Žádost byla odeslána ke schválení.');
        location.href = '/';
      }catch(err){ alert('Odeslání selhalo.'); }
    } else {
      commonState.name=name; commonState.email=email; commonState.phone=phone;
      calculateTotalPriceCommon();
      // submit one payload that server will accept and store pending
      const payload = {
        date: commonState.date,
        rooms: commonState.rooms,
        peoplePerRoom: commonState.peoplePerRoom,
        slots: commonState.slots.map(i => {
          const s = SLOTS[i];
          return { start: toISODateTime(commonState.date, s.start), end: toISODateTime(commonState.date, s.end) };
        }),
        // for compatibility also provide flat start/end if single slot
        start: commonState.slots.length===1 ? toISODateTime(commonState.date, SLOTS[commonState.slots[0]].start) : undefined,
        end: commonState.slots.length===1 ? toISODateTime(commonState.date, SLOTS[commonState.slots[0]].end) : undefined,
        name, email, phone
      };
      try{
        const res = await fetch('/api/common-bookings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        if (!res.ok){
          const t = await res.text(); throw new Error(t||'Chyba při odesílání.');
        }
        alert('Žádost byla odeslána ke schválení.');
        location.href = '/';
      }catch(err){ alert('Odeslání selhalo.'); }
    }
  });

  // photo modal nav
  document.getElementById('photo-modal-close').onclick = closeModal;
  document.getElementById('photo-prev').onclick = function(){ if (galleryPhotos.length){ galleryIndex = (galleryIndex - 1 + galleryPhotos.length) % galleryPhotos.length; document.getElementById('photo-modal-img').src = galleryPhotos[galleryIndex]; } };
  document.getElementById('photo-next').onclick = function(){ if (galleryPhotos.length){ galleryIndex = (galleryIndex + 1) % galleryPhotos.length; document.getElementById('photo-modal-img').src = galleryPhotos[galleryIndex]; } };
  document.getElementById('photo-modal').onclick = function(e){ if (e.target && e.target.id==='photo-modal'){ closeModal(); } };

  // calendar nav is handled inside renderUnifiedCalendar for common flow
}

// Init
showStep(0);
wireNav();
