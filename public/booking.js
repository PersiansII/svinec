let roomsData = [];
let confirmedBookings = [];

async function loadRooms() {
  // Fetch all rooms
  const res = await fetch('/api/rooms');
  roomsData = await res.json();

  // Fetch all confirmed bookings
  const bookingsRes = await fetch('/api/bookings/confirmed');
  confirmedBookings = await bookingsRes.json();

  renderRoomOptions();
}

function renderRoomOptions() {
  const container = document.getElementById('rooms-container');
  container.innerHTML = ''; // Clear previous options

  roomsData.forEach(room => {
    const label = document.createElement('label');
    label.innerHTML = `
      <input type="checkbox" value="${room.id}" data-beds="${room.beds}" data-price="${room.price}">
      ${room.name} (💤 ${room.beds} lůžek, 💵 ${room.price} Kč/noc)
    `;
    container.appendChild(label);
    container.appendChild(document.createElement('br'));
  });
}

function checkRoomAvailability() {
  const startDateValue = document.getElementById('startDate').value;
  const endDateValue = document.getElementById('endDate').value;
  if (!startDateValue || !endDateValue) return; // Dates not selected yet

  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  const roomCheckboxes = document.querySelectorAll('#rooms-container input');

  roomCheckboxes.forEach(cb => {
    const roomId = parseInt(cb.value, 10);
    const isBooked = confirmedBookings.some(booking => {
      // Check for date overlap
      const bookingStart = new Date(booking.startDate);
      const bookingEnd = new Date(booking.endDate);
      const overlap = startDate < bookingEnd && endDate > bookingStart;
      // Check if this room is in the booking
      return overlap && booking.rooms.includes(roomId);
    });

    if (isBooked) {
      cb.disabled = true;
      cb.parentNode.style.color = '#888';
      cb.parentNode.style.textDecoration = 'line-through';
    } else {
      cb.disabled = false;
      cb.parentNode.style.color = '';
      cb.parentNode.style.textDecoration = '';
    }
  });
}

function calculateTotalPrice() {
  const startDate = new Date(document.getElementById('startDate').value);
  const endDate = new Date(document.getElementById('endDate').value);
  const people = parseInt(document.getElementById('people').value, 10);
  const dog = document.getElementById('dog').checked;
  const breakfast = document.getElementById('breakfast').checked;
  const roomCheckboxes = document.querySelectorAll('#rooms-container input:checked');

  let nights = (endDate - startDate) / (1000 * 60 * 60 * 24);
  if (isNaN(nights) || nights <= 0) nights = 0;

  let total = 0;
  let totalBeds = 0;

  roomCheckboxes.forEach(cb => {
    total += parseInt(cb.dataset.price, 10) * nights;
    totalBeds += parseInt(cb.dataset.beds, 10);
  });

  if (dog) total += 200; // example pet fee
  if (breakfast) total += people * nights * 150; // example breakfast cost

  document.getElementById('total-price').textContent = total;

  // Beds vs people check
  const bedsWarning = document.getElementById('beds-warning');
  if (people > totalBeds) {
    bedsWarning.style.display = 'block';
  } else {
    bedsWarning.style.display = 'none';
  }
}

// Hook into date changes
document.getElementById('startDate').addEventListener('change', () => {
  checkRoomAvailability();
  calculateTotalPrice();
});
document.getElementById('endDate').addEventListener('change', () => {
  checkRoomAvailability();
  calculateTotalPrice();
});

// Hook into form changes for price
document.getElementById('booking-form').addEventListener('input', calculateTotalPrice);

document.getElementById('booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const people = parseInt(document.getElementById('people').value, 10);
  const roomCheckboxes = document.querySelectorAll('#rooms-container input:checked');
  let totalBeds = 0;
  roomCheckboxes.forEach(cb => {
    totalBeds += parseInt(cb.dataset.beds, 10);
  });
  if (people > totalBeds) {
    alert('Počet lůžek je nedostatečný.');
    return;
  }

  const payload = {
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value,
    rooms: Array.from(roomCheckboxes).map(cb => parseInt(cb.value, 10)),
    people,
    dog: document.getElementById('dog').checked,
    breakfast: document.getElementById('breakfast').checked,
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value
  };

  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  const result = await res.json();
  if (result.success) {
    alert('Rezervace byla odeslána a čeká na potvrzení.');
    window.location.href = '/';
  } else {
    alert(result.message || 'Chyba při odesílání rezervace.');
  }
});

loadRooms();
