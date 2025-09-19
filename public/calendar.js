let calStart = null, calEnd = null;
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let calOccupancyMap = {}; // expose map so selectDate can read it

// helper: map percent -> occupancy class (same buckets)
function occupancyClass(p) {
  if (p === 0) return 'occ-0';
  if (p > 0 && p <= 30) return 'occ-1-30';
  if (p > 30 && p <= 60) return 'occ-31-60';
  if (p > 60 && p < 100) return 'occ-61-99';
  return 'occ-100';
}

// NEW helper to return inline colors
function occupancyColors(p){
  if (p === 0) return { bg:'#2ecc71', color:'#ffffff' };
  if (p > 0 && p <= 30) return { bg:'#fff8c2', color:'#111111' };
  if (p > 30 && p <= 60) return { bg:'#f1c40f', color:'#111111' };
  if (p > 60 && p < 100) return { bg:'#e67e22', color:'#ffffff' };
  return { bg:'#e74c3c', color:'#ffffff' };
}

// helper: does booking cover night D (S <= D < E)
function bookingCoversNight(booking, D) {
  const rawS = booking.startDate || booking.start || booking.startDateTime || booking.start;
  const rawE = booking.endDate || booking.end || booking.endDateTime || booking.end;
  if (!rawS || !rawE) return false;
  const S = new Date(rawS); S.setHours(0,0,0,0);
  const E = new Date(rawE); E.setHours(0,0,0,0);
  return S.getTime() <= D.getTime() && E.getTime() > D.getTime();
}

// make renderCalendar async so we can fetch occupancy info
async function renderCalendar() {
  const container = document.getElementById('calendar-container');
  container.innerHTML = '';
  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd = new Date(calYear, calMonth + 1, 0);
  const today = new Date();
  today.setHours(0,0,0,0);

  // fetch rooms + bookings to compute per-day occupancy
  let rooms = [];
  let allBookings = [];
  try {
    const [roomsRes, bookingsRes] = await Promise.all([
      fetch('/api/rooms'),
      fetch('/api/bookings/all') // contains room + common bookings with status/type
    ]);
    rooms = await roomsRes.json().catch(()=>[]);
    allBookings = await bookingsRes.json().catch(()=>[]);
  } catch (e) {
    rooms = [];
    allBookings = [];
  }

  // visible/bookable rooms for occupancy calculation (respect showInCalendar)
  const visibleRooms = (rooms || []).filter(r => typeof r.showInCalendar === 'undefined' ? true : Boolean(r.showInCalendar));
  const totalRoomsCount = visibleRooms.length;

  // precompute occupancy map for this month (YYYY-MM-DD -> percent)
  const occupancyMap = {};
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const D = new Date(calYear, calMonth, d); D.setHours(0,0,0,0);
    let bookedRoomsCount = 0;
    if (totalRoomsCount > 0) {
      visibleRooms.forEach(r => {
        const isBooked = (allBookings || []).some(b =>
          (b.type === 'room' || typeof b.type === 'undefined') &&
          (b.status === 'confirmed' || b.status === undefined) &&
          (b.rooms || []).includes(r.id) &&
          bookingCoversNight(b, D)
        );
        if (isBooked) bookedRoomsCount++;
      });
    }
    const percent = totalRoomsCount ? Math.min(100, Math.round((bookedRoomsCount / totalRoomsCount) * 100)) : 0;
    const iso = `${D.getFullYear()}-${String(D.getMonth()+1).padStart(2,'0')}-${String(D.getDate()).padStart(2,'0')}`;
    occupancyMap[iso] = percent;
  }

  // expose for selectDate
  calOccupancyMap = occupancyMap;

  const table = document.createElement('table');
  table.className = 'calendar-table';
  const header = document.createElement('tr');
  header.innerHTML = `<th><button id="prev-month">&lt;</button></th>
    <th colspan="5">${monthStart.toLocaleString('cs-CZ', {month:'long', year:'numeric'})}</th>
    <th><button id="next-month">&gt;</button></th>`;
  table.appendChild(header);

  const daysRow = document.createElement('tr');
  ['Po','Út','St','Čt','Pá','So','Ne'].forEach(d => {
    const th = document.createElement('th');
    th.textContent = d;
    daysRow.appendChild(th);
  });
  table.appendChild(daysRow);

  let row = document.createElement('tr');
  let firstDay = monthStart.getDay() === 0 ? 7 : monthStart.getDay();
  for (let i = 1; i < firstDay; i++) {
    row.appendChild(document.createElement('td'));
  }
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const date = new Date(calYear, calMonth, d);
    date.setHours(0,0,0,0);
    const td = document.createElement('td');
    td.textContent = d;
    td.onclick = () => selectDate(date);

    // apply occupancy class if present
    const y2 = date.getFullYear();
    const m2 = String(date.getMonth() + 1).padStart(2, '0');
    const day2 = String(date.getDate()).padStart(2, '0');
    const iso = `${y2}-${m2}-${day2}`;
    const percent = occupancyMap[iso] || 0;
    td.classList.add(occupancyClass(percent));
    // apply inline fallback colors so visuals appear even if stylesheet not applied
    const oc = occupancyColors(percent);
    td.style.background = oc.bg;
    td.style.color = oc.color;

    // Modern visuals
    if (calStart && calEnd && date > calStart && date < calEnd) {
      td.classList.add('range');
    }
    if (calStart && date.getTime() === calStart.getTime()) {
      td.classList.add('selected');
    }
    if (calEnd && date.getTime() === calEnd.getTime()) {
      td.classList.add('selected');
    }
    if (date.getTime() === today.getTime()) {
      td.classList.add('today');
    }
    if (date < today) {
      td.style.opacity = 0.5;
      td.style.pointerEvents = 'none';
    }
    row.appendChild(td);
    if ((firstDay + d - 1) % 7 === 0) {
      table.appendChild(row);
      row = document.createElement('tr');
    }
  }
  table.appendChild(row);
  container.appendChild(table);

  document.getElementById('prev-month').onclick = () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  };
  document.getElementById('next-month').onclick = () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  };
  updateSelectedDates();
}

// enhance selectDate to show immediate warning when red date chosen
function selectDate(date) {
  date.setHours(0,0,0,0); // Ensure midnight
  // show/hide warning immediately based on calOccupancyMap (if available)
  try {
    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const pct = calOccupancyMap[iso] || 0;
    const selEl = document.getElementById('selected-dates');
    if (pct === 100 && selEl) {
      let warn = document.getElementById('date-warning-calendar');
      if (!warn) {
        warn = document.createElement('div');
        warn.id = 'date-warning-calendar';
        warn.style.marginTop = '8px';
        warn.style.padding = '8px';
        warn.style.borderRadius = '6px';
        warn.style.background = '#ffe6e6';
        warn.style.color = '#7a0000';
        warn.style.fontWeight = '600';
        warn.style.border = '1px solid #ff9b9b';
        selEl.parentNode.insertBefore(warn, selEl.nextSibling);
      }
      warn.textContent = 'Jejda! V tohle datum je už chata plná. Zkuste prosím jiné datum.';
      warn.style.display = 'block';
    } else {
      const warn = document.getElementById('date-warning-calendar');
      if (warn) warn.style.display = 'none';
    }
  } catch (e) { /* ignore */ }

  if (!calStart || (calStart && calEnd)) {
    calStart = date;
    calEnd = null;
  } else if (date < calStart) {
    calEnd = calStart;
    calStart = date;
  } else {
    calEnd = date;
  }
  console.log('Selected:', calStart, calEnd); // Debug: check what is being set
  renderCalendar();
}

function updateSelectedDates() {
  const el = document.getElementById('selected-dates');
  if (calStart && calEnd) {
    el.textContent = `Vybráno: ${calStart.toLocaleDateString()} – ${calEnd.toLocaleDateString()}`;
  } else if (calStart) {
    el.textContent = `Vyberte datum odjezdu po ${calStart.toLocaleDateString()}`;
  } else {
    el.textContent = '';
  }
}

window.getSelectedDates = () => ({
  start: calStart
    ? `${calStart.getFullYear()}-${String(calStart.getMonth()+1).padStart(2,'0')}-${String(calStart.getDate()).padStart(2,'0')}`
    : '',
  end: calEnd
    ? `${calEnd.getFullYear()}-${String(calEnd.getMonth()+1).padStart(2,'0')}-${String(calEnd.getDate()).padStart(2,'0')}`
    : ''
});

document.addEventListener('DOMContentLoaded', renderCalendar);