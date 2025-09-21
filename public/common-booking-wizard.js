/*
  Step 1 redesigned to match unified calendar visuals
  - Multiple room checkboxes
  - Unified calendar (green/yellow/orange/red) with left/right nav
  - Red date warning + disable Next until valid date is chosen
*/
let commonRooms = [];
let commonBookings = []; // combined confirmed + pending for disabling
let selectedRoomIds = []; // array of selected room ids
let peoplePerRoom = {}; // id -> count
let selectedDate = null;
const SLOT_STARTS = [6,9,12,15,18,21]; // hours

// calendar state (unified)
let calDate = new Date();

showStep(0);

// --- Sticky footer helpers (summary + gating) ---
function formatCzDate(iso){
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function currentSelectedSlots(){
  return Array.from(document.querySelectorAll('#slots input[type="checkbox"]:not(:disabled)'))
    .filter(i => i.checked)
    .map(i => parseInt(i.dataset.idx,10))
    .sort((a,b)=>a-b);
}

function priceForCommonSelection(){
  // price = sum of selected rooms' price per selected slot
  if (!selectedRoomIds.length) return 0;
  const selectedSlots = currentSelectedSlots();
  const slotsCount = selectedSlots.length || 0;
  const sumRoomPrices = selectedRoomIds.reduce((sum,id)=>{
    const r = commonRooms.find(x => String(x.id)===String(id));
    return sum + Number(r && r.price ? r.price : 0);
  }, 0);
  return Math.max(0, sumRoomPrices * slotsCount);
}

function renderFooterSummaryCommon(stepIndex){
  const cont = document.getElementById('footer-summary');
  if (!cont) return;
  // Items: Date, Rooms chosen, Timeslot(s), Price
  const dateStr = formatCzDate(selectedDate);
  const roomsStr = selectedRoomIds.map(id => {
    const r = commonRooms.find(x => String(x.id)===String(id));
    return r ? r.name : id;
  }).join(', ') || '-';

  // Prepare timeslot labels from SLOTS and currently checked inputs
  const slotIdxs = currentSelectedSlots();
  const slotLabels = slotIdxs.map(i => (SLOTS[i] ? SLOTS[i].label : i)).join(', ') || '-';
  const price = priceForCommonSelection();

  cont.innerHTML = `
    <div class="footer-chip"><strong>Datum:</strong> ${dateStr}</div>
    <div class="footer-chip"><strong>Místnosti:</strong> ${roomsStr}</div>
    <div class="footer-chip"><strong>Čas:</strong> ${slotLabels}</div>
    <div class="footer-chip"><strong>Cena:</strong> ${price} Kč</div>
  `;
}

function updateFooterForStepCommon(stepIdx){
  const backBtn = document.getElementById('footer-back');
  const nextBtn = document.getElementById('footer-next');
  const submitBtn = document.getElementById('footer-submit');
  if (!backBtn || !nextBtn || !submitBtn) return;
  backBtn.style.display = stepIdx === 0 ? 'none' : '';
  nextBtn.style.display = (stepIdx === 3) ? 'none' : '';
  submitBtn.style.display = (stepIdx === 3) ? '' : 'none';

  if (stepIdx === 0) {
    // valid single date selected
    nextBtn.disabled = !selectedDate;
  } else if (stepIdx === 1) {
    const ok = selectedRoomIds.length>0 && selectedRoomIds.every(id => (peoplePerRoom[id]||0) >= 1);
    nextBtn.disabled = !ok;
  } else if (stepIdx === 2) {
    // require at least one slot
    nextBtn.disabled = currentSelectedSlots().length === 0;
  } else if (stepIdx === 3) {
    const name = document.getElementById('name')?.value?.trim();
    const email = document.getElementById('email')?.value?.trim();
    submitBtn.disabled = !(name && email);
  }

  renderFooterSummaryCommon(stepIdx);
}

// Footer nav (bind now and on DOM ready just in case)
function bindFooterNav(){
  const back = document.getElementById('footer-back');
  const next = document.getElementById('footer-next');
  const submit = document.getElementById('footer-submit');
  if (back && !back._bound){
    back.addEventListener('click', () => {
      if (document.getElementById('step-4')?.classList.contains('active')) return document.getElementById('back-to-3').click();
      if (document.getElementById('step-3')?.classList.contains('active')) return document.getElementById('back-to-2').click();
      if (document.getElementById('step-2')?.classList.contains('active')) return document.getElementById('back-to-1').click();
    });
    back._bound = true;
  }
  if (next && !next._bound){
    next.addEventListener('click', () => {
      if (document.getElementById('step-1')?.classList.contains('active')) return document.getElementById('to-step-2').click();
      if (document.getElementById('step-2')?.classList.contains('active')) return document.getElementById('to-step-3').click();
      if (document.getElementById('step-3')?.classList.contains('active')) return document.getElementById('to-step-4').click();
    });
    next._bound = true;
  }
  if (submit && !submit._bound){
    submit.addEventListener('click', () => {
      document.getElementById('submit-booking')?.click();
    });
    submit._bound = true;
  }
}
bindFooterNav();
document.addEventListener('DOMContentLoaded', bindFooterNav);

// Keep footer submit enablement live on Step 4 inputs
['name','email','phone'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => updateFooterForStepCommon(3));
});

// load rooms & bookings
async function loadCommonRooms() {
  const res = await fetch('/api/common-rooms');
  commonRooms = await res.json();
  // Step 2 will render cards instead of checkboxes
}

async function loadCommonBookings() {
  // fetch confirmed + pending and combine
  const [confirmedRes, pendingRes] = await Promise.all([
    fetch('/api/common-bookings/confirmed'),
    fetch('/api/common-bookings/pending')
  ]);
  const confirmed = await confirmedRes.json().catch(() => []);
  const pending = await pendingRes.json().catch(() => []);
  commonBookings = [...(confirmed || []), ...(pending || [])];
}

function openPhotoModal(photos, idx){
  const modal = document.getElementById('photo-modal');
  const img = document.getElementById('photo-modal-img');
  let current = idx || 0;
  if (!Array.isArray(photos) || !photos.length) return;
  function show(i){ current = (i+photos.length)%photos.length; img.src = photos[current]; }
  show(current);
  modal.style.display = 'flex';
  document.getElementById('photo-prev').onclick = () => show(current-1);
  document.getElementById('photo-next').onclick = () => show(current+1);
  document.getElementById('photo-modal-close').onclick = () => modal.style.display='none';
  modal.onclick = (e) => { if (e.target && e.target.id==='photo-modal') modal.style.display='none'; };
}

function renderCommonRoomsStep(){
  const container = document.getElementById('common-rooms-list');
  if (!container) return;
  container.innerHTML = '';
  selectedRoomIds = [];
  peoplePerRoom = {};
  commonRooms.filter(r => {
      const shown = (typeof r.showInCalendar==='undefined') ? true : !!r.showInCalendar;
      const bookable = (typeof r.bookable==='undefined') ? true : !!r.bookable;
      return shown && bookable;
    })
    .forEach(room => {
      const photos = (room.photos||[]).map(p => `/images/common/${p}`);
      const card = document.createElement('div');
      card.className = 'common-room-card';
      card.innerHTML = `
        <div class="crc-main">
          <img class="crc-image" src="${photos[0]||''}" alt="${room.name}">
          <div class="crc-content">
            <div class="crc-title">${room.name}</div>
            <div class="crc-desc">${room.description||''}</div>
            <div class="crc-stats">
              <div class="crc-stat">Cena za blok: <strong>${room.price||0} Kč</strong></div>
              <div class="crc-stat">Kapacita: <strong>${room.capacity||0}</strong></div>
            </div>
            <div class="crc-actions">
              <label style="display:inline-flex;gap:8px;align-items:center">
                <input type="checkbox" class="room-cb" data-id="${room.id}"> Vybrat
              </label>
              <div class="crc-people" data-id="${room.id}">
                <label>Počet osob: <input type="number" min="1" max="${room.capacity||1}" value="1" class="people-input" data-id="${room.id}"></label>
              </div>
            </div>
          </div>
        </div>`;
      const imgEl = card.querySelector('.crc-image');
      imgEl.addEventListener('click', () => openPhotoModal(photos, 0));
      container.appendChild(card);
    });

  function updateNextEnabled(){
    const btn = document.getElementById('to-step-3');
    if (!btn) return;
    const ok = selectedRoomIds.length>0 && selectedRoomIds.every(id => (peoplePerRoom[id]||0) >= 1);
    btn.disabled = !ok;
    updateFooterForStepCommon(1);
  }

  container.querySelectorAll('.room-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idRaw = e.target.dataset.id;
      const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
      if (e.target.checked){
        if (!selectedRoomIds.includes(id)) selectedRoomIds.push(id);
  const ppl = container.querySelector(`.crc-people[data-id="${idRaw}"]`);
  if (ppl) ppl.classList.add('show');
        peoplePerRoom[id] = peoplePerRoom[id] || 1;
      } else {
        selectedRoomIds = selectedRoomIds.filter(x => x!==id);
  const ppl = container.querySelector(`.crc-people[data-id="${idRaw}"]`);
  if (ppl) ppl.classList.remove('show');
        delete peoplePerRoom[id];
      }
      updateNextEnabled();
      renderFooterSummaryCommon(1);
    });
  });

  container.querySelectorAll('.people-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idRaw = e.target.dataset.id;
      const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
      const room = commonRooms.find(r => String(r.id)===String(idRaw));
      const max = (room && room.capacity) || 1;
      const val = Math.max(1, Math.min(max, parseInt(e.target.value||'1',10)));
      e.target.value = val;
      peoplePerRoom[id] = val;
      updateNextEnabled();
      renderFooterSummaryCommon(1);
    });
  });

  updateNextEnabled();
}

// helper: map percent -> occupancy class (reuse same buckets)
function occupancyClass(p) {
  if (p === 0) return 'occ-0';
  if (p > 0 && p <= 30) return 'occ-1-30';
  if (p > 30 && p <= 60) return 'occ-31-60';
  if (p > 60 && p < 100) return 'occ-61-99';
  return 'occ-100';
}

// NEW helper: inline colors fallback
function occupancyColors(p){
  if (p === 0) return { bg:'#2ecc71', color:'#ffffff' };
  if (p > 0 && p <= 30) return { bg:'#fff8c2', color:'#111111' };
  if (p > 30 && p <= 60) return { bg:'#f1c40f', color:'#111111' };
  if (p > 60 && p < 100) return { bg:'#e67e22', color:'#ffffff' };
  return { bg:'#e74c3c', color:'#ffffff' };
}

// helper: does booking cover the night D (S <= D < E)
function bookingCoversNight(booking, D) {
  const rawS = booking.start || booking.startDate || booking.startDateTime;
  const rawE = booking.end || booking.endDate || booking.endDateTime;
  if (!rawS || !rawE) return false;
  const S = new Date(rawS); S.setHours(0,0,0,0);
  const E = new Date(rawE); E.setHours(0,0,0,0);
  return S.getTime() <= D.getTime() && E.getTime() > D.getTime();
}

// Unified calendar rendering for common rooms
async function renderUnifiedCommonCalendar(){
  const container = document.getElementById('calendar-container');
  const selInfo = document.getElementById('selected-dates');
  if (!container) return;
  container.innerHTML = '';
  if (selInfo) selInfo.textContent = '';

  // header table like unified
  const table = document.createElement('table'); table.className = 'calendar-table';
  const thead = document.createElement('thead'); const header = document.createElement('tr');
  const thPrev = document.createElement('th'); const thLabel = document.createElement('th'); thLabel.colSpan = 5; const thNext = document.createElement('th');
  const prevBtn = document.createElement('button'); prevBtn.type='button'; prevBtn.textContent = '‹';
  const nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.textContent = '›';
  const labelSpan = document.createElement('span'); labelSpan.style.margin='0 8px';
  thPrev.appendChild(prevBtn); thLabel.appendChild(labelSpan); thNext.appendChild(nextBtn);
  header.appendChild(thPrev); header.appendChild(thLabel); header.appendChild(thNext);
  thead.appendChild(header);
  const days = document.createElement('tr'); ['Po','Út','St','Čt','Pá','So','Ne'].forEach(d => { const th=document.createElement('th'); th.textContent=d; days.appendChild(th); });
  thead.appendChild(days); table.appendChild(thead);
  const tbody = document.createElement('tbody'); table.appendChild(tbody); container.appendChild(table);

  // warning helper (matching unified)
  function ensureWarning(){
    let w = document.getElementById('date-warning-calendar');
    if (!w){
      const sel = document.getElementById('selected-dates');
      if (!sel || !sel.parentNode) return null;
      w = document.createElement('div'); w.id='date-warning-calendar'; w.style.marginTop='8px'; w.style.padding='8px'; w.style.background='#ffe6e6'; w.style.color='#7a0000'; w.style.fontWeight='600'; w.style.border='1px solid #ff9b9b';
      sel.parentNode.insertBefore(w, sel.nextSibling);
    }
    return w;
  }
  function setNextEnabled(enabled){ const btn=document.getElementById('to-step-2'); if (btn) btn.disabled=!enabled; }
  function showHideWarning(pct){ const w=ensureWarning(); if (!w) return; if (pct>=100){ w.textContent='Jejda! V tohle datum je už chata plná. Zkuste prosím jiné datum.'; w.style.display='block'; } else { w.style.display='none'; } }

  // fetch confirmed for occupancy
  let confirmedCommon = [];
  try { const res = await fetch('/api/common-bookings/confirmed'); confirmedCommon = await res.json().catch(()=>[]); } catch(e){ confirmedCommon = []; }

  const today = new Date(); today.setHours(0,0,0,0);
  const visibleCommon = (commonRooms||[]).filter(r => typeof r.showInCalendar==='undefined' ? true : !!r.showInCalendar);
  const totalCommon = visibleCommon.length || 1;

  function bookingCoversNight(b, D){ const S=b.start||b.startDate||b.startDateTime; const E=b.end||b.endDate||b.endDateTime; if(!S||!E) return false; const s=new Date(S); s.setHours(0,0,0,0); const e=new Date(E); e.setHours(0,0,0,0); return s.getTime()<=D.getTime() && e.getTime()>D.getTime(); }

  function paint(){
    labelSpan.textContent = calDate.toLocaleDateString('cs-CZ',{month:'long',year:'numeric'});
    tbody.innerHTML='';
    const year = calDate.getFullYear(); const month = calDate.getMonth();
    const first = new Date(year, month, 1); const startDay = (first.getDay()+6)%7; const daysInMonth = new Date(year, month+1, 0).getDate();
    let row = document.createElement('tr'); for(let i=0;i<startDay;i++){ const td=document.createElement('td'); td.style.opacity='0.4'; td.style.cursor='default'; row.appendChild(td); }
    for(let d=1; d<=daysInMonth; d++){
      if (row.children.length===7){ tbody.appendChild(row); row=document.createElement('tr'); }
      const dt = new Date(year, month, d); dt.setHours(0,0,0,0);
      const td = document.createElement('td'); td.textContent = d;
      // occupancy coloring
      const used = new Set(); confirmedCommon.forEach(b => { if (bookingCoversNight(b, dt)){ (b.rooms||[]).forEach(r => used.add(String(r))); }});
      const pct = Math.min(100, Math.round((used.size/totalCommon)*100));
      if (pct>=100) { td.style.background='#e74c3c'; td.style.color='#ffffff'; }
      else if (pct>60) { td.style.background='#e67e22'; td.style.color='#ffffff'; }
      else if (pct>30) { td.style.background='#f1c40f'; td.style.color='#111111'; }
      else if (pct>0) { td.style.background='#fff8c2'; td.style.color='#111111'; }
      else { td.style.background='#2ecc71'; td.style.color='#ffffff'; }
      if (dt.getTime()===today.getTime()) td.classList.add('today');
      if (dt < today) { td.style.opacity=0.5; td.style.pointerEvents='none'; }

      td.addEventListener('click', () => {
        const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        document.getElementById('date').value = iso;
        selectedDate = iso;
        const disp = `${String(d).padStart(2,'0')}-${String(month+1).padStart(2,'0')}-${year}`;
        if (selInfo) selInfo.textContent = `Vybrané datum: ${disp}`;
        tbody.querySelectorAll('td').forEach(c => c.classList.remove('selected'));
        td.classList.add('selected');
        showHideWarning(pct);
        setNextEnabled(pct < 100);
        renderFooterSummaryCommon(0);
        updateFooterForStepCommon(0);
      });

      row.appendChild(td);
    }
    while (row.children.length < 7){ const td=document.createElement('td'); td.style.opacity='0.4'; td.style.cursor='default'; row.appendChild(td); }
    tbody.appendChild(row);
  }

  prevBtn.addEventListener('click', () => { calDate.setMonth(calDate.getMonth()-1); paint(); });
  nextBtn.addEventListener('click', () => { calDate.setMonth(calDate.getMonth()+1); paint(); });
  paint();
  // initial gating
  setNextEnabled(!!selectedDate);
  updateFooterForStepCommon(0);
}

// helpers from previous file
function showStep(n) {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });
  updateFooterForStepCommon(n);
}

function toISODateTime(dateStr, hour) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d, 0, 0, 0, 0);
  if (hour >= 24) {
    const next = new Date(dt);
    next.setDate(next.getDate() + 1);
    return new Date(next.getFullYear(), next.getMonth(), next.getDate(), 0, 0, 0).toISOString();
  }
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), hour, 0, 0).toISOString();
}

function overlaps(aStartISO, aEndISO, bStartISO, bEndISO) {
  const aS = new Date(aStartISO), aE = new Date(aEndISO);
  const bS = new Date(bStartISO), bE = new Date(bEndISO);
  return aS < bE && aE > bS;
}

// replace multiple small-slot starts with two slots: dopoledne / odpoledne
const SLOTS = [
  { label: 'Dopoledne', start: 6, end: 12 },   // 06:00 – 12:00
  { label: 'Odpoledne', start: 12, end: 24 }   // 12:00 – 24:00 (midnight)
];

function renderSlots() {
  const container = document.getElementById('slots');
  container.innerHTML = '';
  // read selected rooms (from checkboxes)
  selectedRoomIds = Array.from(document.querySelectorAll('.room-cb:checked')).map(i => {
    const v = i.dataset.id; return isNaN(Number(v)) ? v : Number(v);
  });
  const date = document.getElementById('date').value;
  selectedDate = date;
  if (!selectedRoomIds.length || !date) {
    container.innerHTML = '<div class="meta">Vyberte prosím nejprve místnosti a datum.</div>';
    return;
  }

  SLOTS.forEach((slotObj, idx) => {
    const slotStartISO = toISODateTime(date, slotObj.start);
    const slotEndISO = toISODateTime(date, slotObj.end);

    // disabled if ANY selected room has a booking overlapping this slot
    const disabled = commonBookings.some(b => {
      const bRooms = b.rooms || [];
      // check if booking touches any of the selected rooms
      const intersectsRoom = selectedRoomIds.some(rid => bRooms.includes(rid) || bRooms.includes(String(rid)));
      if (!intersectsRoom) return false;
      const bStart = b.start || b.startDate || b.start;
      const bEnd = b.end || b.endDate || b.end;
      return overlaps(slotStartISO, slotEndISO, bStart, bEnd);
    });

    const displayEndHour = slotObj.end % 24;
    const slot = document.createElement('label');
    slot.className = 'slot' + (disabled ? ' disabled' : '');
    slot.innerHTML = `
      <input type="checkbox" data-idx="${idx}" ${disabled ? 'disabled' : ''} />
      <div>
        <div><strong>${slotObj.label} (${String(slotObj.start).padStart(2,'0')}:00 – ${String(displayEndHour).padStart(2,'0')}:00)</strong></div>
        <div class="meta">${disabled ? 'Obsazeno (alespoň jedna vybraná místnost)' : 'Volné'}</div>
      </div>
    `;
    container.appendChild(slot);
  });
  // bind change listeners to update footer summary and gating
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      updateFooterForStepCommon(2);
      renderFooterSummaryCommon(2);
    });
  });
}

// navigation and form handlers
document.getElementById('to-step-2').onclick = async function(){
  // require date selection only
  const date = document.getElementById('date').value;
  if (!date) { alert('Vyberte prosím datum.'); return; }
  if (!commonRooms || !commonRooms.length) { try { await loadCommonRooms(); } catch(e){} }
  renderCommonRoomsStep();
  showStep(1);
  renderFooterSummaryCommon(1);
};

document.getElementById('back-to-1').onclick = function() { showStep(0); };

document.getElementById('to-step-3').onclick = async function() {
  if (!selectedRoomIds.length) { document.getElementById('common-rooms-error').style.display='block'; return; }
  document.getElementById('common-rooms-error').style.display='none';
  await loadCommonBookings();
  const checked = Array.from(document.querySelectorAll('#slots input[type="checkbox"]:not(:disabled)'))
    .filter(i => i.checked)
    .map(i => parseInt(i.dataset.idx,10));
  renderSlots();
  showStep(2);
  renderFooterSummaryCommon(2);
};

document.getElementById('back-to-2').onclick = function() { showStep(1); };

document.getElementById('to-step-4').onclick = function(){
  const checked = Array.from(document.querySelectorAll('#slots input[type="checkbox"]:not(:disabled)')).filter(i=>i.checked);
  if (!checked.length){ document.getElementById('slots-error').style.display='block'; return; }
  document.getElementById('slots-error').style.display='none';
  showStep(3);
  renderFooterSummaryCommon(3);
};

document.getElementById('back-to-3').onclick = function(){ showStep(2); };

document.getElementById('submit-booking').onclick = async function() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const date = document.getElementById('date').value;
  if (!name || !email) { alert('Vyplňte jméno a email.'); return; }
  updateFooterForStepCommon(3);

  // collect selected slot indices
  const selected = Array.from(document.querySelectorAll('#slots input[type="checkbox"]'))
    .filter(i => i.checked && !i.disabled)
    .map(i => parseInt(i.dataset.idx,10))
    .sort((a,b)=>a-b);

  if (!selected.length) { alert('Vyberte alespoň jeden časový blok.'); return; }

  // group contiguous indices into ranges
  function group(indices) {
    const groups = [];
    let s = indices[0], e = indices[0];
    for (let i=1;i<indices.length;i++) {
      if (indices[i] === e + 1) e = indices[i];
      else { groups.push([s,e]); s = e = indices[i]; }
    }
    groups.push([s,e]);
    return groups;
  }
  const groups = group(selected);

  const results = [];
  const roomsPayload = selectedRoomIds.map(r => (isNaN(Number(r)) ? r : Number(r)));
  const totalPeople = selectedRoomIds.reduce((sum,id)=> sum + (peoplePerRoom[id]||0), 0);

  for (const [sIdx, eIdx] of groups) {
    const startHour = SLOTS[sIdx].start;
    const endHour = SLOTS[eIdx].end;
    const startISO = toISODateTime(date, startHour);
    const endISO = toISODateTime(date, endHour);
    const payload = {
      start: startISO,
      end: endISO,
      rooms: roomsPayload,
      people: totalPeople,
      name,
      email,
      phone
    };
    try {
      const res = await fetch('/api/common-bookings', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(()=>({}));
      results.push({ ok: res.ok, json });
    } catch (err) {
      results.push({ ok: false, json: { message: 'Network error' } });
    }
  }

  const failed = results.filter(r => !r.ok);
  const submitMsg = document.getElementById('submit-msg');
  if (failed.length === 0) {
    submitMsg.textContent = 'Žádost byla odeslána. Čeká na schválení.';
    // redirect to main calendar page instead of common.html
    setTimeout(() => window.location.href = '/index.html', 1200);
  } else {
    submitMsg.textContent = 'Část rezervací selhala: ' + (failed[0].json && failed[0].json.message ? failed[0].json.message : 'Chyba');
  }
};

// Init: populate room checkboxes and calendar
loadCommonRooms();
renderUnifiedCommonCalendar();
renderFooterSummaryCommon(0);