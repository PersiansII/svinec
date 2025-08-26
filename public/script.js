let currentDate = new Date();

function renderCalendar() {
  const monthYear = document.getElementById('current-month');
  const tbody = document.getElementById('calendar-body');
  const thead = document.querySelector('#calendar thead');
  tbody.innerHTML = '';
  thead.innerHTML = '';

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  monthYear.textContent = currentDate.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  // ✅ Add day names row
  const dayNamesRow = document.createElement('tr');
  dayNamesRow.innerHTML = '<th></th>'; // Empty cell for room names
  const dayNames = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    date.setHours(0,0,0,0);
    const th = document.createElement('th');
    th.textContent = dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1];

    // ✅ Mark today column
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      th.setAttribute('data-today', 'true');
    }

    dayNamesRow.appendChild(th);
  }
  thead.appendChild(dayNamesRow);

  // ✅ Add dates row
  const datesRow = document.createElement('tr');
  datesRow.innerHTML = '<th>Pokoj</th>'; // Header for room names
  for (let day = 1; day <= daysInMonth; day++) {
    const th = document.createElement('th');
    th.textContent = day;
    const date = new Date(year, month, day);
    date.setHours(0,0,0,0);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      th.setAttribute('data-today', 'true');
    }
    datesRow.appendChild(th);
  }
  thead.appendChild(datesRow);

  fetch('/api/rooms')
  .then(res => res.json())
  .then(rooms => {
    fetch('/api/common-rooms')
      .then(res => res.json())
      .then(commonRooms => {
        fetch('/api/bookings/all')
          .then(res => res.json())
          .then(allBookings => {

                  // Render regular rooms
                  rooms.forEach(room => {
                    const tr = document.createElement('tr');
                    const tdName = document.createElement('td');
                    tdName.textContent = room.name;
                    tr.appendChild(tdName);

                    for (let day = 1; day <= daysInMonth; day++) {
                      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      const td = document.createElement('td');

                      // Find bookings for this room and date
                      const booking = allBookings.find(b =>
                        b.type === 'room' &&
                        b.rooms.includes(room.id) &&
                        new Date(dateStr) >= new Date(b.startDate) &&
                        new Date(dateStr) < new Date(b.endDate)
                      );

                      if (booking) {
                        td.className = booking.status === 'pending' ? 'pending' : 'booked';
                      } else {
                        td.className = 'available';
                      }

                      // Mark weekend
                      const cellDate = new Date(dateStr);
                      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                      if (isWeekend) td.classList.add("weekend");

                      // Mark today column
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      if (cellDate.getTime() === today.getTime()) {
                        td.classList.add("today-column");
                      }

                      tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                  });

                  // Render common rooms
                  commonRooms.forEach(room => {
                    const tr = document.createElement('tr');
                    const tdName = document.createElement('td');
                    tdName.textContent = room.name;
                    tr.appendChild(tdName);

                    for (let day = 1; day <= daysInMonth; day++) {
                      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      const td = document.createElement('td');

                      // Helper: does booking overlap this day?
function isCommonBookingOnDay(booking, dateStr) {
  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59");
  const bookingStart = new Date(booking.start);
  const bookingEnd = new Date(booking.end);
  return bookingStart <= dayEnd && bookingEnd > dayStart;
}

// Find bookings for this common room and date
const bookingsForCell = allBookings.filter(b =>
  b.type === 'common' &&
  b.rooms.includes(room.id) &&
  isCommonBookingOnDay(b, dateStr)
);

                      // Prioritize confirmed over pending for coloring
                      const totalPeople = bookingsForCell
                        .filter(b => b.status === 'confirmed')
                        .reduce((sum, b) => sum + (b.people || 0), 0);

                      if (totalPeople >= room.capacity) {
                        td.className = 'fully-booked';
                      } else if (totalPeople > 0) {
                        td.className = 'partially-booked';
                      } else if (bookingsForCell.some(b => b.status === 'pending')) {
                        td.className = 'pending';
                      } else {
                        td.className = 'available';
                      }

                      // Mark weekend
                      const cellDate = new Date(dateStr);
                      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                      if (isWeekend) td.classList.add("weekend");

                      // Mark today column
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      if (cellDate.getTime() === today.getTime()) {
                        td.classList.add("today-column");
                      }

                      tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                  });

                });
            });
        });
}


document.getElementById('prev-month').addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
});

renderCalendar();
