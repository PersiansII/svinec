/*
  Adjusted to support:
  - multiple room checkboxes in step 1
  - inline calendar widget in step 1 (click day -> fills date input)
  - slot disabling requires EVERY selected room to be free (we disable if ANY selected room is booked)
*/
let commonRooms = [];
let commonBookings = []; // combined confirmed + pending for disabling
let selectedRoomIds = []; // array of selected room ids
let selectedDate = null;
const SLOT_STARTS = [6,9,12,15,18,21]; // hours

// small calendar state
let calDate = new Date(); // current month shown

showStep(0);

// load rooms & bookings
async function loadCommonRooms() {
  const res = await fetch('/api/common-rooms');
  commonRooms = await res.json();
  renderRoomCheckboxes();
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

function renderRoomCheckboxes() {
  const container = document.getElementById('rooms-checkboxes');
  container.innerHTML = '';
  commonRooms.forEach(r => {
    const div = document.createElement('label');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '8px';
    div.innerHTML = `<input type="checkbox" class="room-cb" data-id="${r.id}" /> <div><strong>${r.name}</strong><div class="meta">Kapacita ${r.capacity}</div></div>`;
    container.appendChild(div);
  });

  // click handlers to update selectedRoomIds
  container.querySelectorAll('.room-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      selectedRoomIds = Array.from(document.querySelectorAll('.room-cb:checked')).map(i => {
        const v = i.dataset.id;
        return isNaN(Number(v)) ? v : Number(v);
      });
    });
  });

  // preselect from URL if present
  const url = new URL(window.location.href);
  const roomQ = url.searchParams.get('room');
  const dateQ = url.searchParams.get('date');
  if (roomQ) {
    // allow comma-separated or single id
    const ids = roomQ.split(',').map(s => s.trim());
    ids.forEach(id => {
      const cb = container.querySelector(`.room-cb[data-id="${id}"], .room-cb[data-id="${Number(id)}"]`);
      if (cb) cb.checked = true;
    });
    // update selectedRoomIds
    selectedRoomIds = Array.from(container.querySelectorAll('.room-cb:checked')).map(i => {
      const v = i.dataset.id; return isNaN(Number(v)) ? v : Number(v);
    });
  }
  if (dateQ) {
    document.getElementById('date').value = dateQ;
    selectedDate = dateQ;
  }
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

// calendar rendering (simple)
async function renderCalendar() {
  const monthEl = document.getElementById('cal-month');
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  // fetch confirmed common bookings to compute occupancy
  let confirmedCommon = [];
  try {
    const res = await fetch('/api/common-bookings/confirmed');
    confirmedCommon = await res.json().catch(()=>[]);
  } catch (e) {
    confirmedCommon = [];
  }

  const monthName = calDate.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
  monthEl.textContent = monthName;

  // helper to show/hide warning near the date input
  function showDateWarning(msg) {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;
    let w = document.getElementById('date-warning-common');
    if (!w) {
      w = document.createElement('div');
      w.id = 'date-warning-common';
      w.style.marginTop = '8px';
      w.style.padding = '8px';
      w.style.borderRadius = '6px';
      w.style.background = '#ffe6e6';
      w.style.color = '#7a0000';
      w.style.fontWeight = '600';
      w.style.border = '1px solid #ff9b9b';
      dateEl.parentNode.insertBefore(w, dateEl.nextSibling);
    }
    w.textContent = msg;
    w.style.display = 'block';
  }
  function hideDateWarning() {
    const w = document.getElementById('date-warning-common');
    if (w) w.style.display = 'none';
  }

  const dayNames = ['Po','Út','St','Čt','Pá','So','Ne'];
  dayNames.forEach(d => {
    const hd = document.createElement('div');
    hd.className = 'cal-day header';
    hd.textContent = d;
    grid.appendChild(hd);
  });

  // first day index (Monday=0)
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // shift Sun->6
  const daysInMonth = new Date(year, month+1, 0).getDate();

  // fill blanks
  for (let i=0;i<startDay;i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day disabled';
    grid.appendChild(blank);
  }

  const today = new Date(); today.setHours(0,0,0,0);

  // visible common rooms respecting showInCalendar
  const visibleCommon = (commonRooms || []).filter(r => typeof r.showInCalendar === 'undefined' ? true : Boolean(r.showInCalendar));
  const totalCommonCount = visibleCommon.length;

  for (let d=1; d<=daysInMonth; d++) {
    const dt = new Date(year, month, d);
    dt.setHours(0,0,0,0);
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;
    // build local YYYY-MM-DD to avoid timezone shifts from toISOString()
    const y2 = dt.getFullYear();
    const m2 = String(dt.getMonth() + 1).padStart(2, '0');
    const day2 = String(dt.getDate()).padStart(2, '0');
    const iso = `${y2}-${m2}-${day2}`;
    cell.dataset.date = iso;
    if (dt.getTime() === today.getTime()) cell.classList.add('today');
    const selected = document.getElementById('date').value;
    if (selected === iso) cell.classList.add('selected');

    // compute occupancy percent for common rooms on this date (confirmed only)
    let bookedCommonCount = 0;
    if (totalCommonCount > 0) {
      visibleCommon.forEach(c => {
        const isBooked = (confirmedCommon || []).some(b => {
          if (!(b.rooms || []).includes(c.id) && !(b.rooms || []).includes(String(c.id))) return false;
          return bookingCoversNight(b, dt);
        });
        if (isBooked) bookedCommonCount++;
      });
    }
    const percent = totalCommonCount ? Math.min(100, Math.round((bookedCommonCount / totalCommonCount) * 100)) : 0;

    // attach percent to DOM for later checks and apply class/colors
    cell.dataset.percent = String(percent);
    cell.classList.remove('occ-0','occ-1-30','occ-31-60','occ-61-99','occ-100');
    cell.classList.add(occupancyClass(percent));
    const col = (function(p){
      if (p === 0) return { bg:'#2ecc71', color:'#fff' };
      if (p > 0 && p <= 30) return { bg:'#fff8c2', color:'#111' };
      if (p > 30 && p <= 60) return { bg:'#f1c40f', color:'#111' };
      if (p > 60 && p < 100) return { bg:'#e67e22', color:'#fff' };
      return { bg:'#e74c3c', color:'#fff' };
    })(percent);
    cell.style.background = col.bg;
    cell.style.color = col.color;

    cell.addEventListener('click', () => {
      document.getElementById('date').value = iso;
      selectedDate = iso;
      // refresh selected visuals
      grid.querySelectorAll('.cal-day.selected').forEach(x => x.classList.remove('selected'));
      cell.classList.add('selected');

      // Show warning immediately if this date is fully booked
      if (Number(cell.dataset.percent) === 100) {
        showDateWarning('Jejda! V tohle datum je už chata plná. Zkuste prosím jiné datum.');
      } else {
        hideDateWarning();
      }
    });

    grid.appendChild(cell);
  }

  // After building the calendar, if a date is already selected (e.g. from input), show/hide warning accordingly
  const sel = document.getElementById('date').value;
  if (sel) {
    const selectedCell = grid.querySelector(`.cal-day[data-date="${sel}"]`);
    if (selectedCell) {
      if (Number(selectedCell.dataset.percent) === 100) {
        showDateWarning('Jejda! V tohle datum je už chata plná. Zkuste prosím jiné datum.');
      } else {
        hideDateWarning();
      }
    } else {
      hideDateWarning();
    }
  } else {
    hideDateWarning();
  }
}

document.getElementById('cal-prev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth()-1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calDate.setMonth(calDate.getMonth()+1); renderCalendar(); });
document.getElementById('date').addEventListener('change', (e) => {
  selectedDate = e.target.value;
  // if changed externally, update calendar selection month
  if (selectedDate) {
    const [y,m,day] = selectedDate.split('-').map(Number);
    calDate = new Date(y, m-1, 1);
    renderCalendar();
  }
});

// helpers from previous file
function showStep(n) {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });
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
}

// navigation and form handlers
document.getElementById('to-step-2').onclick = async function() {
  // ensure at least one room + date chosen
  selectedRoomIds = Array.from(document.querySelectorAll('.room-cb:checked')).map(i => {
    const v = i.dataset.id; return isNaN(Number(v)) ? v : Number(v);
  });
  const date = document.getElementById('date').value;
  if (!selectedRoomIds.length) { alert('Vyberte prosím alespoň jednu místnost.'); return; }
  if (!date) { alert('Vyberte prosím datum.'); return; }

  await loadCommonBookings();
  renderSlots();
  showStep(1);
};

document.getElementById('back-to-1').onclick = function() { showStep(0); };

document.getElementById('to-step-3').onclick = function() {
  const checked = Array.from(document.querySelectorAll('#slots input[type="checkbox"]:not(:disabled)'))
    .filter(i => i.checked)
    .map(i => parseInt(i.dataset.idx,10));
  if (!checked.length) {
    document.getElementById('slots-error').style.display = 'block';
    return;
  }
  document.getElementById('slots-error').style.display = 'none';
  showStep(2);
};

document.getElementById('back-to-2').onclick = function() { showStep(1); };

document.getElementById('submit-booking').onclick = async function() {
  const people = parseInt(document.getElementById('people').value, 10) || 0;
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const date = document.getElementById('date').value;

  if (!people || !name || !email) {
    alert('Vyplňte počet osob, jméno a email.');
    return;
  }

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
  // payload rooms: selectedRoomIds
  const roomsPayload = selectedRoomIds.map(r => (isNaN(Number(r)) ? r : Number(r)));

  for (const [sIdx, eIdx] of groups) {
    const startHour = SLOTS[sIdx].start;
    const endHour = SLOTS[eIdx].end;
    const startISO = toISODateTime(date, startHour);
    const endISO = toISODateTime(date, endHour);
    const payload = {
      start: startISO,
      end: endISO,
      rooms: roomsPayload,
      people,
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
renderCalendar();