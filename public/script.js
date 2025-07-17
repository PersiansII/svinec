
let currentDate = new Date();

function renderCalendar() {
  const monthYear = document.getElementById('current-month');
  const tbody = document.getElementById('calendar-body');
  const thead = document.querySelector('#calendar thead tr');
  tbody.innerHTML = '';
  thead.innerHTML = '<th>Pokoj</th>';
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  monthYear.textContent = currentDate.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
  
  for (let day = 1; day <= daysInMonth; day++) {
    const th = document.createElement('th');
    th.textContent = day;
    thead.appendChild(th);
  }

  fetch('/api/rooms')
    .then(res => res.json())
    .then(rooms => {
      fetch('/api/bookings')
        .then(res => res.json())
        .then(bookings => {
          rooms.forEach(room => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td');
            tdName.textContent = room.name;
            tr.appendChild(tdName);

            for (let day = 1; day <= daysInMonth; day++) {
              const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              const td = document.createElement('td');
              const booked = bookings.some(b => b.rooms.includes(room.id) &&
                new Date(dateStr) >= new Date(b.startDate) &&
                new Date(dateStr) < new Date(b.endDate));
              td.textContent = booked ? "Obsazeno" : "Volno";
              td.className = booked ? "booked" : "available";
              tr.appendChild(td);
            }
            tbody.appendChild(tr);
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
