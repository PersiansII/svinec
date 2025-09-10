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

  // booking occupies morning of D when its interval overlaps D 00:00-12:00
  // occupies afternoon of D when it overlaps D 12:00-24:00
  function bookingOccupiesHalf(booking, roomId, D) {
    if (!booking.rooms || !booking.rooms.includes(roomId)) return { morning:false, afternoon:false };
    const S = new Date(booking.startDate || booking.start);
    const E = new Date(booking.endDate || booking.end);
    // morning half: D 00:00 -> D 12:00
    const morningStart = new Date(D); morningStart.setHours(0,0,0,0);
    const morningEnd = new Date(D); morningEnd.setHours(12,0,0,0);
    // afternoon half: D 12:00 -> next day 00:00
    const afternoonStart = new Date(D); afternoonStart.setHours(12,0,0,0);
    const afternoonEnd = new Date(D); afternoonEnd.setHours(24,0,0,0);

    const morning = (S < morningEnd) && (E > morningStart);
    const afternoon = (S < afternoonEnd) && (E > afternoonStart);
    return { morning, afternoon };
  }

  // combine regular rooms and commonRooms but keep type marker
  const combined = [
    ...rooms.map(r => ({ ...r, __type: 'room' })),
    ...commonRooms.map(r => ({ ...r, __type: 'common' }))
  ];

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
