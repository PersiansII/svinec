let calStart = null, calEnd = null;
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();

function renderCalendar() {
  const container = document.getElementById('calendar-container');
  container.innerHTML = '';
  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd = new Date(calYear, calMonth + 1, 0);
  const today = new Date();
  today.setHours(0,0,0,0);

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

function selectDate(date) {
  date.setHours(0,0,0,0); // Ensure midnight
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