let currentDate = new Date();

// decide display mode based on viewport width
function getDisplayMode() {
  // threshold (px) below which we switch to week view
  const WEEK_THRESHOLD = 1000;
  return window.innerWidth < WEEK_THRESHOLD ? 'week' : 'month';
}

function renderCalendar() {
  const monthYear = document.getElementById('current-month');

  // determine mode and compute visible range
  const mode = getDisplayMode();
  let visibleStart; // Date at 00:00
  let visibleDays;

  if (mode === 'week') {
    // week view: start on Monday
    const cur = new Date(currentDate);
    const day = (cur.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday
    visibleStart = new Date(cur);
    visibleStart.setDate(cur.getDate() - day);
    visibleStart.setHours(0,0,0,0);
    visibleDays = 7;
    const weekLabelStart = visibleStart.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
    const weekLabelEnd = new Date(visibleStart.getFullYear(), visibleStart.getMonth(), visibleStart.getDate() + 6)
      .toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
    monthYear.textContent = `${weekLabelStart} – ${weekLabelEnd}`;
  } else {
    // month view (default)
    visibleStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    visibleStart.setHours(0,0,0,0);
    visibleDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    monthYear.textContent = currentDate.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
  }

  // fetch data and render half-day calendar for the visible range
  fetch('/api/rooms')
    .then(res => res.json())
    .then(rooms => {
      fetch('/api/common-rooms')
        .then(res => res.json())
        .then(commonRooms => {
          fetch('/api/bookings/all')
            .then(res => res.json())
            .then(allBookings => {
              renderHalfDayCalendar(rooms, commonRooms, allBookings, visibleStart, visibleDays);
            });
        });
    });
}

// prev/next navigation: respect week/month mode
document.getElementById('prev-month').addEventListener('click', () => {
  const mode = getDisplayMode();
  if (mode === 'week') {
    currentDate.setDate(currentDate.getDate() - 7);
  } else {
    currentDate.setMonth(currentDate.getMonth() - 1);
  }
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  const mode = getDisplayMode();
  if (mode === 'week') {
    currentDate.setDate(currentDate.getDate() + 7);
  } else {
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  renderCalendar();
});

// re-render when window resized and mode might change
let lastMode = getDisplayMode();
window.addEventListener('resize', () => {
  const mode = getDisplayMode();
  if (mode !== lastMode) {
    lastMode = mode;
    renderCalendar();
  }
});

renderCalendar();

/* ------------------ modified function below ------------------ */
function renderHalfDayCalendar(rooms, commonRooms, allBookings, visibleStart, visibleDays) {
  const container = document.getElementById('half-calendar-container');
  if (!container) return;
  container.innerHTML = '';

  const year = visibleStart.getFullYear();
  const month = visibleStart.getMonth();

  const table = document.createElement('table');
  table.className = 'half-table';

  // header: weekday names row + date numbers row
  const thead = document.createElement('thead');

  // Czech weekday abbreviations (0=Sun..6=Sat)
  const weekdayNames = ['Ne','Po','Út','St','Čt','Pá','So'];

  // first row: weekday names for visible range
  const weekRow = document.createElement('tr');
  weekRow.innerHTML = '<th></th>'; // empty corner for room name column
  for (let i = 0; i < visibleDays; i++) {
    const date = new Date(visibleStart);
    date.setDate(visibleStart.getDate() + i);
    date.setHours(0,0,0,0);
    const th = document.createElement('th');
    th.textContent = weekdayNames[date.getDay()];
    weekRow.appendChild(th);
  }
  thead.appendChild(weekRow);

  // second row: date numbers for visible range
  const dateRow = document.createElement('tr');
  dateRow.innerHTML = '<th>Pokoj</th>';
  for (let i = 0; i < visibleDays; i++) {
    const date = new Date(visibleStart);
    date.setDate(visibleStart.getDate() + i);
    date.setHours(0,0,0,0);
    const th = document.createElement('th');
    th.textContent = date.getDate();
    if (date.toDateString() === new Date().toDateString()) th.setAttribute('data-today','true');
    dateRow.appendChild(th);
  }
  thead.appendChild(dateRow);

  table.appendChild(thead);

  const tbody2 = document.createElement('tbody');

  function dayDateFromStart(i){ const dt = new Date(visibleStart); dt.setDate(visibleStart.getDate() + i); dt.setHours(0,0,0,0); return dt; }

  // booking occupies morning/afternoon halves (existing)
  function bookingOccupiesHalf(booking, roomId, D) {
    if (!booking.rooms || !booking.rooms.includes(roomId)) return { morning:false, afternoon:false };
    const S = new Date(booking.startDate || booking.start);
    const E = new Date(booking.endDate || booking.end);
    const morningStart = new Date(D); morningStart.setHours(0,0,0,0);
    const morningEnd = new Date(D); morningEnd.setHours(12,0,0,0);
    const afternoonStart = new Date(D); afternoonStart.setHours(12,0,0,0);
    const afternoonEnd = new Date(D); afternoonEnd.setHours(24,0,0,0);
    const morning = (S < morningEnd) && (E > morningStart);
    const afternoon = (S < afternoonEnd) && (E > afternoonStart);
    return { morning, afternoon };
  }

  // ----- NEW helper: does booking cover the night D (S <= D < E) -----
  function bookingCoversNight(booking, D) {
    if (!booking.startDate && !booking.start) return false;
    const S = new Date(booking.startDate || booking.start); S.setHours(0,0,0,0);
    const E = new Date(booking.endDate || booking.end); E.setHours(0,0,0,0);
    return S.getTime() <= D.getTime() && E.getTime() > D.getTime();
  }

  // combine regular rooms and commonRooms but keep type marker
  // filter out rooms that should not be shown in calendar
  const visibleRooms = rooms.filter(r => typeof r.showInCalendar === 'undefined' ? true : Boolean(r.showInCalendar));
  const visibleCommon = (commonRooms || []).filter(r => typeof r.showInCalendar === 'undefined' ? true : Boolean(r.showInCalendar));
  const combined = [
    ...visibleRooms.map(r => ({ ...r, __type: 'room' })),
    ...visibleCommon.map(r => ({ ...r, __type: 'common' }))
  ];

  // ----- UPDATED: compute counts for rooms and common rooms (equal weights per room) -----
  const totalRoomsCount = visibleRooms.length;
  const totalCommonCount = visibleCommon.length;

  // helper: map percent -> occupancy class (unchanged)
  function occupancyClass(p) {
    if (p === 0) return 'occ-0';
    if (p > 0 && p <= 30) return 'occ-1-30';
    if (p > 30 && p <= 60) return 'occ-31-60';
    if (p > 60 && p < 100) return 'occ-61-99';
    return 'occ-100';
  }

  // NEW helper: return inline colors for percent (used as fallback)
  function occupancyColors(p){
    if (p === 0) return { bg:'#2ecc71', color:'#ffffff' };
    if (p > 0 && p <= 30) return { bg:'#fff8c2', color:'#111111' };
    if (p > 30 && p <= 60) return { bg:'#f1c40f', color:'#111111' };
    if (p > 60 && p < 100) return { bg:'#e67e22', color:'#ffffff' };
    return { bg:'#e74c3c', color:'#ffffff' };
  }

  // ----- NEW: create two occupancy rows: rooms and common rooms -----
  const roomOccRow = document.createElement('tr');
  roomOccRow.className = 'occ-row';
  const roomLabel = document.createElement('td');
  roomLabel.textContent = 'Obsazenost pokojů';
  roomLabel.style.fontWeight = '600';
  roomLabel.style.padding = '6px';
  roomOccRow.appendChild(roomLabel);

  const commonOccRow = document.createElement('tr');
  commonOccRow.className = 'occ-row';
  const commonLabel = document.createElement('td');
  commonLabel.textContent = 'Obsazenost spol.';
  commonLabel.style.fontWeight = '600';
  commonLabel.style.padding = '6px';
  commonOccRow.appendChild(commonLabel);

  for (let i = 0; i < visibleDays; i++) {
    const D = dayDateFromStart(i);

    // count booked regular rooms: room is booked if there's any confirmed room booking covering night D that includes the room
    let bookedRoomsCount = 0;
    if (totalRoomsCount > 0) {
      visibleRooms.forEach(r => {
        const isBooked = (allBookings || []).some(b =>
          b.type === 'room' &&
          b.status === 'confirmed' &&
          (b.rooms || []).includes(r.id) &&
          bookingCoversNight(b, D)
        );
        if (isBooked) bookedRoomsCount++;
      });
    }

    const roomsPercent = totalRoomsCount ? Math.min(100, Math.round((bookedRoomsCount / totalRoomsCount) * 100)) : 0;
    const tdRooms = document.createElement('td');
    tdRooms.textContent = `${roomsPercent}%`;
    const rc = occupancyColors(roomsPercent);                     // <-- apply colors inline
    tdRooms.classList.add(occupancyClass(roomsPercent));
    tdRooms.style.background = rc.bg;
    tdRooms.style.color = rc.color;
    tdRooms.setAttribute('title', `Obsazeno pokojů: ${bookedRoomsCount} / ${totalRoomsCount}`);
    tdRooms.style.textAlign = 'center';
    tdRooms.style.padding = '4px';
    roomOccRow.appendChild(tdRooms);

    // count booked common rooms: common room is booked if any confirmed common booking overlaps date D and includes that common room id
    let bookedCommonCount = 0;
    if (totalCommonCount > 0) {
      visibleCommon.forEach(c => {
        const isBooked = (allBookings || []).some(b =>
          b.type === 'common' &&
          b.status === 'confirmed' &&
          (b.rooms || []).includes(c.id) &&
          bookingCoversNight(b, D)
        );
        if (isBooked) bookedCommonCount++;
      });
    }

    const commonPercent = totalCommonCount ? Math.min(100, Math.round((bookedCommonCount / totalCommonCount) * 100)) : 0;
    const tdCommon = document.createElement('td');
    tdCommon.textContent = `${commonPercent}%`;
    const cc = occupancyColors(commonPercent);                    // <-- apply colors inline
    tdCommon.classList.add(occupancyClass(commonPercent));
    tdCommon.style.background = cc.bg;
    tdCommon.style.color = cc.color;
    tdCommon.setAttribute('title', `Obsazeno společných: ${bookedCommonCount} / ${totalCommonCount}`);
    tdCommon.style.textAlign = 'center';
    tdCommon.style.padding = '4px';
    commonOccRow.appendChild(tdCommon);
  }

  // insert occupancy rows BEFORE listing rooms/common rooms
  tbody2.appendChild(roomOccRow);
  tbody2.appendChild(commonOccRow);

  // ...existing code: combined.forEach(...) to render each room row...
  combined.forEach(room => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = room.name + (room.__type === 'common' ? ' (spol.)' : '');
    tr.appendChild(tdName);

    for (let i = 0; i < visibleDays; i++) {
      const D = dayDateFromStart(i);
      const td = document.createElement('td');

      const cell = document.createElement('div');
      cell.className = 'half-cell';

      const morningSpan = document.createElement('div');
      morningSpan.className = 'half morning available';
      const afternoonSpan = document.createElement('div');
      afternoonSpan.className = 'half afternoon available';

      // states: available, booked, pending, partial, checkout
      let morningState = 'available';
      let afternoonState = 'available';

      if (room.__type === 'room') {
        // iterate bookings and allow checkout mornings to coexist with other bookings
        let checkoutFound = false;
        for (let j = 0; j < allBookings.length; j++) {
          const b = allBookings[j];
          if (b.type !== 'room') continue;
          if (!b.rooms || !b.rooms.includes(room.id)) continue;

          const occ = bookingOccupiesHalf(b, room.id, D);

          // normalize start/end to date-only for checkout detection
          const rawS = b.startDate || b.start;
          const rawE = b.endDate || b.end;
          const Sdate = rawS ? new Date(rawS) : null;
          const Edate = rawE ? new Date(rawE) : null;
          if (Sdate) Sdate.setHours(0,0,0,0);
          if (Edate) Edate.setHours(0,0,0,0);

          // Checkout morning: confirmed booking that ends on this day and actually covered previous nights
          if (Edate && Sdate && Edate.getTime() === D.getTime() && Sdate.getTime() < Edate.getTime() && b.status === 'confirmed' && occ.morning) {
            morningState = 'checkout';
            checkoutFound = true;
            // continue checking so we can still set afternoonState for other bookings
            continue;
          }

          if (occ.morning) {
            if (!checkoutFound) {
              if (b.status === 'confirmed') morningState = 'booked';
              else if (b.status === 'pending' && morningState !== 'booked') morningState = 'pending';
            }
          }

          if (occ.afternoon) {
            if (b.status === 'confirmed') afternoonState = 'booked';
            else if (b.status === 'pending' && afternoonState !== 'booked') afternoonState = 'pending';
          }
        }
      } else {
        // common room: aggregate people counts per half and compare with capacity
        let confirmedMorning = 0, confirmedAfternoon = 0;
        let pendingMorning = 0, pendingAfternoon = 0;

        allBookings.forEach(b => {
          if (b.type !== 'common') return;
          if (!b.rooms || !b.rooms.includes(room.id)) return;

          const occ = bookingOccupiesHalf(b, room.id, D);
          const people = Number(b.people || 0);

          if (occ.morning) {
            if (b.status === 'confirmed') confirmedMorning += people;
            else pendingMorning += people;
          }
          if (occ.afternoon) {
            if (b.status === 'confirmed') confirmedAfternoon += people;
            else pendingAfternoon += people;
          }
        });

        if (confirmedMorning >= (room.capacity || Infinity)) morningState = 'booked';
        else if (confirmedMorning > 0) morningState = 'partial';
        else if (pendingMorning > 0) morningState = 'pending';
        else morningState = 'available';

        if (confirmedAfternoon >= (room.capacity || Infinity)) afternoonState = 'booked';
        else if (confirmedAfternoon > 0) afternoonState = 'partial';
        else if (pendingAfternoon > 0) afternoonState = 'pending';
        else afternoonState = 'available';
      }

      // apply classes (include new 'checkout' class)
      morningSpan.classList.remove('available','booked','pending','partial','checkout');
      afternoonSpan.classList.remove('available','booked','pending','partial');

      if (morningState === 'checkout') {
        morningSpan.classList.add('checkout');
      } else {
        morningSpan.classList.add(morningState === 'booked' ? 'booked' : (morningState === 'pending' ? 'pending' : (morningState === 'partial' ? 'partial' : 'available')));
      }

      afternoonSpan.classList.add(afternoonState === 'booked' ? 'booked' : (afternoonState === 'pending' ? 'pending' : (afternoonState === 'partial' ? 'partial' : 'available')));

      cell.appendChild(morningSpan);
      cell.appendChild(afternoonSpan);

      // Mark weekend
      const isWeekend = D.getDay() === 0 || D.getDay() === 6;
      if (isWeekend) td.classList.add("weekend");

      // Mark today column
      const today = new Date(); today.setHours(0,0,0,0);
      if (D.getTime() === today.getTime()) {
        td.classList.add('today-column');
      }

      td.appendChild(cell);
      tr.appendChild(td);
    }

    tbody2.appendChild(tr);
  });

  table.appendChild(tbody2);
  container.appendChild(table);

  const legend = document.createElement('div');
  legend.className = 'half-legend';
  legend.innerHTML = `<div class="item"><span class="sw booked"></span> Plně obsazeno</div>
                      <div class="item"><span class="sw partial"></span> Částečně obsazeno</div>
                      <div class="item"><span class="sw pending"></span> Čekající</div>
                      <div class="item"><span class="sw available"></span> Volné</div>
                      <div class="item"><span class="sw checkout" style="background:#0095ff; width:18px; height:12px; display:inline-block; border-radius:4px;"></span> Odjezd (ráno)</div>`;
  container.appendChild(legend);
}
