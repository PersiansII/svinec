let roomsData = [];
let allBookings = [];
let seasons = [];
let selectedRooms = [];
let bookingState = {
  startDate: "",
  endDate: "",
  people: 1,
  roomCount: 1,
  rooms: [],
  dog: false,
  breakfast: false,
  name: "",
  email: "",
  phone: "",
  dogs: [],
  extraBeds: [],
  occupancy: {} // <-- per-room occupancy { roomId: count }
};
let galleryPhotos = [];
let galleryIndex = 0;

async function loadRooms() {
  const res = await fetch('/api/rooms');
  roomsData = await res.json();
}
async function loadBookings() {
  const res = await fetch('/api/bookings/all');
  allBookings = await res.json();
}
async function loadSeasons() {
  const res = await fetch('/api/seasons');
  seasons = await res.json();
}

function showStep(n) {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });
}

function getAvailableRooms(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return roomsData.filter(room => {
    return !allBookings.some(booking => {
      if (!booking.rooms) return false;
      const bookingStart = new Date(booking.startDate);
      const bookingEnd = new Date(booking.endDate);
      const overlap = start < bookingEnd && end > bookingStart;
      return overlap && booking.rooms.includes(room.id);
    });
  });
}

function getRoomPrice(room, startDate, endDate) {
  let nights = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  let total = 0;
  for (let i = 0; i < nights; i++) {
    let day = new Date(startDate);
    day.setDate(day.getDate() + i);
    let percent = 0, flat = 0;
    seasons.forEach(season => {
      const s = new Date(season.start);
      const e = new Date(season.end);
      if (day >= s && day < e) {
        if (season.type === 'percent') percent += Number(season.value);
        else if (season.type === 'flat') flat += Number(season.value);
      }
    });
    let nightPrice = room.price * (1 + percent / 100) + flat;
    total += nightPrice;
  }
  return Math.round(total);
}

function renderRoomsStep() {
  const container = document.getElementById('rooms-list');
  container.innerHTML = '';
  selectedRooms = [];
  const available = getAvailableRooms(bookingState.startDate, bookingState.endDate);
  available.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    card.innerHTML = `
      <input type="checkbox" value="${room.id}" id="room-${room.id}">
      <div class="room-photos">
        ${(room.photos || ['default.jpg']).map((photo, idx) =>
          `<img src="/images/rooms/${photo}" alt="${room.name}" style="width:80px;height:60px;margin-right:5px;border-radius:4px;cursor:pointer;" onclick='openPhotoModal(${JSON.stringify(room.photos || ['default.jpg'])},${idx})'>`
        ).join('')}
      </div>
      <div>
        <strong>${room.name}</strong><br>
        <span>${room.description || ''}</span><br>
        <span>💤 ${room.beds} lůžek</span><br>
        <span>💵 ${getRoomPrice(room, bookingState.startDate, bookingState.endDate)} Kč celkem</span>
      </div>
    `;
    card.querySelector('input').addEventListener('change', function() {
      if (this.checked) {
        if (selectedRooms.length < bookingState.roomCount) {
          selectedRooms.push(room.id);
        } else {
          this.checked = false;
        }
      } else {
        selectedRooms = selectedRooms.filter(id => id !== room.id);
      }
      // Enforce max selection
      document.querySelectorAll('#rooms-list input[type="checkbox"]').forEach(cb => {
        cb.disabled = !cb.checked && selectedRooms.length >= bookingState.roomCount;
      });
    });
    container.appendChild(card);
  });
}

function renderSummary() {
  const ul = document.getElementById('summary-list');
  ul.innerHTML = `
    <li><strong>Datum:</strong> ${bookingState.startDate} – ${bookingState.endDate}</li>
    <li><strong>Počet osob:</strong> ${bookingState.people}</li>
    <li><strong>Pokoje:</strong> ${bookingState.rooms.map(id => {
      const r = roomsData.find(r => r.id === id);
      return r ? r.name : id;
    }).join(', ')}</li>
    <li><strong>Obsazení po pokojích:</strong>
      <ul>
        ${bookingState.rooms.map(id => {
          const r = roomsData.find(r => r.id === id);
          const cnt = bookingState.occupancy && bookingState.occupancy[id] ? bookingState.occupancy[id] : 0;
          return `<li>${r ? r.name : id}: ${cnt} osob</li>`;
        }).join('')}
      </ul>
    </li>
    <li><strong>Služby:</strong> ${
      bookingState.dogs.map(id => {
        const r = roomsData.find(r => r.id === id);
        return r ? `${r.name} pes` : '';
      }).concat(
        bookingState.extraBeds.map(id => {
          const r = roomsData.find(r => r.id === id);
          return r ? `${r.name} přistýlka` : '';
        })
      ).concat(
        bookingState.breakfast ? [`Snídaně pro ${bookingState.breakfastPeople} osob`] : []
      ).join(', ')
    }</li>
  `;
  document.getElementById('total-price').textContent = Math.round(calculateTotalPrice());
}

function calculateTotalPrice() {
  let total = 0;
  bookingState.rooms.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room) total += getRoomPrice(room, bookingState.startDate, bookingState.endDate);
  });
  bookingState.dogs.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room) total += room.dogFee;
  });
  bookingState.extraBeds.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room) total += room.extraBedFee;
  });
  if (bookingState.breakfast) {
    const nights = (new Date(bookingState.endDate) - new Date(bookingState.startDate)) / (1000 * 60 * 60 * 24);
    total += bookingState.breakfastPeople * nights * 150;
  }
  bookingState.totalPrice = Math.round(total); // <-- Store in bookingState
  return bookingState.totalPrice;
}

document.getElementById('to-step-2').onclick = async function() {
  const { start: startDate, end: endDate } = window.getSelectedDates();
  const people = parseInt(document.getElementById('people').value, 10);
  const roomCount = parseInt(document.getElementById('roomCount').value, 10);
  if (!startDate || !endDate || !people || !roomCount || new Date(startDate) >= new Date(endDate)) {
    alert('Vyberte platný termín a vyplňte všechna pole.');
    return;
  }
  bookingState.startDate = startDate;
  bookingState.endDate = endDate;
  bookingState.people = people;
  bookingState.roomCount = roomCount;
  await loadRooms();
  await loadBookings();
  await loadSeasons();
  renderRoomsStep();
  showStep(1);
};

document.getElementById('back-to-1').onclick = function() {
  showStep(0);
};

document.getElementById('to-step-3').onclick = function() {
  if (selectedRooms.length !== bookingState.roomCount) {
    document.getElementById('rooms-error').style.display = 'block';
    return;
  }
  document.getElementById('rooms-error').style.display = 'none';
  bookingState.rooms = [...selectedRooms];
  renderServicesStep();
  showStep(2);
};

document.getElementById('back-to-2').onclick = function() {
  showStep(1);
};

document.getElementById('to-step-4').onclick = function() {
  // Collect per-room services and occupancy
  bookingState.dogs = [];
  bookingState.extraBeds = [];
  bookingState.breakfast = false;
  bookingState.breakfastPeople = 0;

  const occupancy = {};
  let sumPeople = 0;
  let invalid = false;

  bookingState.rooms.forEach(roomId => {
    const occEl = document.getElementById(`occupancy-room-${roomId}`);
    const occVal = parseInt(occEl?.value, 10) || 0;
    const room = roomsData.find(r => r.id === roomId);
    const maxAllowed = room && room.beds ? room.beds : bookingState.people;

    if (occVal < 1 || occVal > maxAllowed) {
      invalid = true;
    }

    occupancy[roomId] = occVal;
    sumPeople += occVal;

    if (document.getElementById(`dog-room-${roomId}`)?.checked) {
      bookingState.dogs.push(roomId);
    }
    if (document.getElementById(`extra-bed-room-${roomId}`)?.checked) {
      bookingState.extraBeds.push(roomId);
    }
  });

  // Breakfast
  const breakfastCheckbox = document.getElementById('breakfast-checkbox');
  if (breakfastCheckbox && breakfastCheckbox.checked) {
    bookingState.breakfast = true;
    const breakfastPeople = parseInt(document.getElementById('breakfast-people').value, 10) || 1;
    bookingState.breakfastPeople = Math.min(Math.max(breakfastPeople, 1), bookingState.people);
  } else {
    bookingState.breakfast = false;
    bookingState.breakfastPeople = 0;
  }

  // Validate occupancy
  if (invalid || sumPeople !== bookingState.people) {
    document.getElementById('occupancy-error').style.display = 'block';
    return;
  } else {
    document.getElementById('occupancy-error').style.display = 'none';
    bookingState.occupancy = occupancy;
  }

  renderSummary();
  showStep(3);
};

document.getElementById('back-to-3').onclick = function() {
  showStep(2);
};

document.getElementById('booking-form').onsubmit = async function(e) {
  e.preventDefault();
  bookingState.name = document.getElementById('name').value;
  bookingState.email = document.getElementById('email').value;
  bookingState.phone = document.getElementById('phone').value;

  // Beds check
  let totalBeds = 0;
  bookingState.rooms.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room) totalBeds += room.beds;
  });
  if (bookingState.people > totalBeds) {
    alert('Počet lůžek je nedostatečný.');
    return;
  }

  // Occupancy sanity check before final submit
  let occupancySum = 0;
  if (!bookingState.occupancy) bookingState.occupancy = {};
  bookingState.rooms.forEach(id => {
    occupancySum += bookingState.occupancy[id] || 0;
  });
  if (occupancySum !== bookingState.people) {
    alert('Součet osob v pokojích neodpovídá celkovému počtu osob.');
    return;
  }

  calculateTotalPrice();

  const payload = {
    startDate: bookingState.startDate,
    endDate: bookingState.endDate,
    rooms: bookingState.rooms,
    people: bookingState.people,
    dogs: bookingState.dogs,
    extraBeds: bookingState.extraBeds,
    breakfast: bookingState.breakfast,
    breakfastPeople: bookingState.breakfastPeople,
    name: bookingState.name,
    email: bookingState.email,
    phone: bookingState.phone,
    totalPrice: bookingState.totalPrice,
    occupancy: bookingState.occupancy // <-- per-room occupancy included
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
};

function openPhotoModal(photos, idx) {
  galleryPhotos = photos;
  galleryIndex = idx;
  const modal = document.getElementById('photo-modal');
  const img = document.getElementById('photo-modal-img');
  img.src = `/images/rooms/${galleryPhotos[galleryIndex]}`;
  modal.style.display = 'flex';
  updateNavButtons();
}

function updateNavButtons() {
  document.getElementById('photo-prev').disabled = galleryIndex === 0;
  document.getElementById('photo-next').disabled = galleryIndex === galleryPhotos.length - 1;
}

document.getElementById('photo-modal-close').onclick = function() {
  document.getElementById('photo-modal').style.display = 'none';
};
document.getElementById('photo-prev').onclick = function() {
  if (galleryIndex > 0) {
    galleryIndex--;
    document.getElementById('photo-modal-img').src = `/images/rooms/${galleryPhotos[galleryIndex]}`;
    updateNavButtons();
  }
};
document.getElementById('photo-next').onclick = function() {
  if (galleryIndex < galleryPhotos.length - 1) {
    galleryIndex++;
    document.getElementById('photo-modal-img').src = `/images/rooms/${galleryPhotos[galleryIndex]}`;
    updateNavButtons();
  }
};
// Optional: close modal on background click
document.getElementById('photo-modal').onclick = function(e) {
  if (e.target === this) this.style.display = 'none';
};

function renderServicesStep() {
  const container = document.getElementById('services-list');
  container.innerHTML = '';

  // Per-room occupancy + dog and extra bed
  bookingState.rooms.forEach(roomId => {
    const room = roomsData.find(r => r.id === roomId);
    const maxPeople = room && room.beds ? room.beds : bookingState.people;
    const defaultOccupancy = Math.min(maxPeople, Math.ceil(bookingState.people / bookingState.roomCount));

    // Occupancy input
    container.innerHTML += `
      <div style="margin-bottom:8px;">
        <strong>${room ? room.name : roomId}</strong><br>
        Počet osob v tomto pokoji:
        <input type="number" id="occupancy-room-${roomId}" min="1" max="${maxPeople}" value="${defaultOccupancy}" style="width:80px; margin-left:6px;">
      </div>
    `;

    if (room && room.dogAllowed) {
      const id = `dog-room-${room.id}`;
      container.innerHTML += `
        <label>
          <input type="checkbox" id="${id}">
          ${room.name} pes (+${room.dogFee} Kč)
        </label><br>
      `;
    }
    if (room && room.extraBedAllowed) {
      const id = `extra-bed-room-${room.id}`;
      container.innerHTML += `
        <label>
          <input type="checkbox" id="${id}">
          ${room.name} přistýlka (+${room.extraBedFee} Kč)
        </label><br>
      `;
    }
  });

  // Occupancy error row
  container.innerHTML += `<div id="occupancy-error" style="color:red; display:none; margin-top:8px;">Součet osob v pokojích musí odpovídat celkovému počtu osob.</div>`;

  // Breakfast option
  container.innerHTML += `
    <div style="margin-top:10px;">
      <label>
        <input type="checkbox" id="breakfast-checkbox">
        Snídaně (+150 Kč/osoba/noc)
      </label>
      <div id="breakfast-people-row" style="display:none; margin-top:5px;">
        <label>
          Počet osob na snídani:
          <input type="number" id="breakfast-people" min="1" max="${bookingState.people}" value="${bookingState.people}" style="width:60px;">
        </label>
      </div>
    </div>
  `;

  // Show/hide breakfast people input
  setTimeout(() => {
    const breakfastCheckbox = document.getElementById('breakfast-checkbox');
    const breakfastPeopleRow = document.getElementById('breakfast-people-row');
    breakfastCheckbox.addEventListener('change', function() {
      breakfastPeopleRow.style.display = this.checked ? 'block' : 'none';
    });
  }, 0);
}

// Init: show step 1
showStep(0);