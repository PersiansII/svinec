let roomsData = [];
let allBookings = [];
let seasons = [];
let selectedRooms = [];
let bookingState = {
  startDate: "",
  endDate: "",
  people: 1,
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

// --- occupancy helpers: keep per-room inputs bounded by total people and room caps ---
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Replace updateOccupancyLimits: only enforce per-room caps (no global constraint)
function updateOccupancyLimits() {
  const ids = selectedRooms || [];
  ids.forEach(id => {
    const input = document.getElementById(`occupancy-room-${id}`);
    if (!input) return;
    const room = roomsData.find(r => r.id === id);
    const cap = room ? (room.beds || 99) : 99;
    input.max = String(Math.max(1, cap));
    // clamp current value to new max
    const cur = parseInt(input.value || '0', 10) || 1;
    if (cur > cap) {
      input.value = String(cap);
      bookingState.occupancy[id] = cap;
    }
  });
}

// NEW: update order summary for Step 2 / Step 3
function updateOrderSummary(stepNumber) {
  const start = bookingState.startDate ? new Date(bookingState.startDate) : null;
  const end = bookingState.endDate ? new Date(bookingState.endDate) : null;
  let nights = 0;
  if (start && end) nights = Math.round((end - start) / (1000*60*60*24));
  let peopleSum = 0;
  const roomIds = stepNumber === 2 ? selectedRooms : (bookingState.rooms || []);
  roomIds.forEach(id => {
    const v = parseInt(document.getElementById(`occupancy-room-${id}`)?.value || '0', 10) || 0;
    peopleSum += v;
  });

  // Price: use calculateTotalPrice() so services (dog, extra bed, breakfast) are included
  // Ensure bookingState reflects current service selections before calling
  let price = 0;
  if (stepNumber === 2) {
    // sum room prices for currently selectedRooms (services not chosen yet)
    roomIds.forEach(id => {
      const r = roomsData.find(rr => rr.id === id);
      if (r && bookingState.startDate && bookingState.endDate) {
        price += getRoomPrice(r, bookingState.startDate, bookingState.endDate);
      }
    });
  } else {
    // step 3+ use full calculation including services
    price = calculateTotalPrice();
  }

  const summaryId = stepNumber === 2 ? 'order-summary-2' : 'order-summary-3';
  const el = document.getElementById(summaryId);
  if (!el) return;
  el.innerHTML = `
    <div style="margin-top:12px; padding:10px; border-radius:8px; background:#fff; border:1px solid #e6e6e6;">
      <div><strong>Datum:</strong> ${bookingState.startDate || '-'} – ${bookingState.endDate || '-'}</div>
      <div><strong>Počet nocí:</strong> ${nights}</div>
      <div><strong>Počet osob (součet po pokojích):</strong> ${peopleSum}</div>
      <div><strong>Cena (vč. služeb):</strong> ${price} Kč</div>
    </div>
  `;
}

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
    // nicer card layout: photos left, info center, price prominent top-right
    card.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-start; padding:10px; border-radius:8px; border:1px solid #e6e6e6; background:#fff;">
        <div style="min-width:90px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${(room.photos || ['default.jpg']).map((photo, idx) =>
              `<img src="/images/rooms/${photo}" alt="${room.name}" style="width:90px;height:68px;object-fit:cover;border-radius:6px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.08);" onclick='openPhotoModal(${JSON.stringify(room.photos || ['default.jpg'])},${idx})'>`
            ).join('')}
          </div>
        </div>

        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="padding-right:12px;">
              <div style="font-size:1.05rem; font-weight:700; color:#222;">${room.name}</div>
              <div class="room-desc" style="margin-top:8px; color:#444; line-height:1.35; white-space:pre-wrap;">${room.description || ''}</div>
              <div style="margin-top:10px; color:#666; font-size:0.95rem;">💤 ${room.beds} lůžek</div>
            </div>

            <div style="text-align:right; margin-left:8px;">
              <div style="font-weight:800; font-size:1.25rem; color:#b33; background:linear-gradient(180deg,#fff6f6,#fff); padding:8px 12px; border-radius:8px; border:1px solid rgba(179,51,51,0.08);">
                ${getRoomPrice(room, bookingState.startDate, bookingState.endDate)} Kč
              </div>
              <div style="font-size:0.85rem; color:#888; margin-top:6px;">celkem</div>
            </div>
          </div>

          <div class="room-occupancy-container" id="occ-container-${room.id}" style="margin-top:10px; display:none;"></div>

          <div style="margin-top:10px;">
            <label style="display:inline-flex; align-items:center; gap:8px; font-weight:600; color:#333;">
              <input type="checkbox" value="${room.id}" id="room-${room.id}">
              Vybrat pokoj
            </label>
          </div>
        </div>
      </div>
    `;
    const cb = card.querySelector('input');

    cb.addEventListener('change', function() {
      if (this.checked) {
        if (!selectedRooms.includes(room.id)) selectedRooms.push(room.id);

        // show occupancy input for this room
        const occContainer = document.getElementById(`occ-container-${room.id}`);
        if (occContainer) {
          occContainer.style.display = 'block';
          const cap = room && room.beds ? room.beds : 99;
          // create input
          occContainer.innerHTML = `<strong>Počet osob v tomto pokoji:</strong> `;
          const input = document.createElement('input');
          input.type = 'number';
          input.id = `occupancy-room-${room.id}`;
          input.min = 1;
          input.max = String(Math.max(1, cap));
          input.value = '1';
          input.style.width = '80px';
          input.style.marginLeft = '6px';
          // update bookingState on input
          input.addEventListener('input', () => {
            let raw = parseInt(input.value || '0', 10) || 1;
            raw = clamp(raw, 1, parseInt(input.max,10));
            if (String(raw) !== input.value) input.value = String(raw);
            bookingState.occupancy[room.id] = raw;
            updateOccupancyLimits();
            updateOrderSummary(2);
          });
          occContainer.appendChild(input);
          // initialize bookingState for this room
          bookingState.occupancy[room.id] = 1;
        }

        // Update summary and limits
        updateOccupancyLimits();
        updateOrderSummary(2);
      } else {
        // uncheck -> remove
        selectedRooms = selectedRooms.filter(id => id !== room.id);
        delete bookingState.occupancy[room.id];
        const occContainer = document.getElementById(`occ-container-${room.id}`);
        if (occContainer) { occContainer.style.display = 'none'; occContainer.innerHTML = ''; }
        updateOccupancyLimits();
        updateOrderSummary(2);
      }
    });

    container.appendChild(card);
  });

  // Add order summary container at bottom of step 2
  let summaryEl = document.getElementById('order-summary-2');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.id = 'order-summary-2';
    container.appendChild(summaryEl);
  }
  updateOrderSummary(2);
}

// evenly distribute bookingState.people across selected rooms (respect capacities)
function distributeOccupancyDefaults() {
  const ids = [...selectedRooms];
  if (!ids.length) return;
  const caps = ids.map(id => {
    const r = roomsData.find(rr => rr.id === id);
    return { id, cap: r ? (r.beds || bookingState.people) : bookingState.people };
  });

  // start with 1 per room
  let remaining = bookingState.people;
  const assigned = {};
  ids.forEach(id => { assigned[id] = 1; remaining -= 1; });

  // respect caps
  ids.forEach(id => {
    const cap = caps.find(c => c.id === id).cap;
    if (assigned[id] > cap) { remaining += assigned[id] - cap; assigned[id] = cap; }
  });

  // distribute remaining respecting caps
  let loop = 0;
  while (remaining > 0 && loop < 1000) {
    let progressed = false;
    for (const c of caps) {
      if (remaining <= 0) break;
      if ((assigned[c.id] || 0) < c.cap) {
        assigned[c.id] = (assigned[c.id] || 0) + 1;
        remaining--;
        progressed = true;
      }
    }
    if (!progressed) break;
    loop++;
  }

  // write values to inputs and bookingState
  ids.forEach(id => {
    const el = document.getElementById(`occupancy-room-${id}`);
    const val = Math.max(1, Math.min(assigned[id] || 1, caps.find(c => c.id === id).cap));
    if (el) el.value = val;
    bookingState.occupancy[id] = val;
  });

  // enforce per-input limits relative to total people
  updateOccupancyLimits();
}

function renderSummary() {
  const ul = document.getElementById('summary-list');
  const start = bookingState.startDate ? new Date(bookingState.startDate) : null;
  const end = bookingState.endDate ? new Date(bookingState.endDate) : null;
  let nights = 0;
  if (start && end) nights = Math.round((end - start) / (1000*60*60*24));
  ul.innerHTML = `
    <li><strong>Datum:</strong> ${bookingState.startDate} – ${bookingState.endDate}</li>
    <li><strong>Počet nocí:</strong> ${nights}</li>
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
  const { start: startDate, end: endDate } = window.getSelectedDates ? window.getSelectedDates() : { start: null, end: null };
  if (!startDate || !endDate || new Date(startDate) >= new Date(endDate)) {
    alert('Vyberte platný termín.');
    return;
  }
  bookingState.startDate = startDate;
  bookingState.endDate = endDate;
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
  if (selectedRooms.length < 1) {
    const el = document.getElementById('rooms-error');
    if (el) { el.textContent = 'Vyberte prosím alespoň jeden pokoj.'; el.style.display = 'block'; }
    return;
  }

  // Validate occupancy inputs exist and are >= 1
  let sum = 0;
  let missing = false;
  selectedRooms.forEach(id => {
    const occEl = document.getElementById(`occupancy-room-${id}`);
    const val = occEl ? parseInt(occEl.value, 10) : NaN;
    if (!occEl || isNaN(val) || val < 1) missing = true;
    else sum += val;
  });
  if (missing) {
    const el = document.getElementById('rooms-error');
    if (el) { el.textContent = 'U každého vybraného pokoje vyplňte počet osob.'; el.style.display = 'block'; }
    return;
  }

  const elErr = document.getElementById('rooms-error');
  if (elErr) elErr.style.display = 'none';
  bookingState.rooms = [...selectedRooms];
  // derive total people from per-room occupancy
  bookingState.people = sum;
  // occupancy already stored in bookingState.occupancy
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

  // Per-room service options (occupancy inputs are managed in Step 2)
  bookingState.rooms.forEach(roomId => {
    const room = roomsData.find(r => r.id === roomId);
    // Room header only; occupancy inputs are intentionally NOT duplicated here
    container.innerHTML += `
      <div style="margin-bottom:8px;">
        <strong>${room ? room.name : roomId}</strong>
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
          <input type="number" id="breakfast-people" min="1" max="${bookingState.people || 1}" value="${bookingState.breakfastPeople || bookingState.people || 1}" style="width:60px;">
        </label>
      </div>
    </div>
  `;

  // Add order summary for Step 3
  let summaryEl = document.getElementById('order-summary-3');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.id = 'order-summary-3';
    container.appendChild(summaryEl);
  }

  // Attach listeners to service inputs so summary updates automatically
  // Use a short timeout so elements exist in DOM
  setTimeout(() => {
    // Per-room dog / extra-bed listeners
    bookingState.rooms.forEach(roomId => {
      const dogEl = document.getElementById(`dog-room-${roomId}`);
      if (dogEl) {
        // initialize from bookingState
        dogEl.checked = bookingState.dogs.includes(roomId);
        dogEl.addEventListener('change', () => {
          if (dogEl.checked) {
            if (!bookingState.dogs.includes(roomId)) bookingState.dogs.push(roomId);
          } else {
            bookingState.dogs = bookingState.dogs.filter(id => id !== roomId);
          }
          updateOrderSummary(3);
        });
      }

      const extraEl = document.getElementById(`extra-bed-room-${roomId}`);
      if (extraEl) {
        extraEl.checked = bookingState.extraBeds.includes(roomId);
        extraEl.addEventListener('change', () => {
          if (extraEl.checked) {
            if (!bookingState.extraBeds.includes(roomId)) bookingState.extraBeds.push(roomId);
          } else {
            bookingState.extraBeds = bookingState.extraBeds.filter(id => id !== roomId);
          }
          updateOrderSummary(3);
        });
      }
    });

    // Breakfast listeners
    const breakfastCheckbox = document.getElementById('breakfast-checkbox');
    const breakfastPeopleRow = document.getElementById('breakfast-people-row');
    const breakfastPeopleInput = document.getElementById('breakfast-people');

    if (breakfastCheckbox) {
      breakfastCheckbox.checked = !!bookingState.breakfast;
      breakfastPeopleRow.style.display = bookingState.breakfast ? 'block' : 'none';
      breakfastCheckbox.addEventListener('change', () => {
        bookingState.breakfast = breakfastCheckbox.checked;
        if (!bookingState.breakfast) {
          bookingState.breakfastPeople = 0;
        } else {
          bookingState.breakfastPeople = parseInt(breakfastPeopleInput?.value || bookingState.people || 1, 10) || 1;
        }
        breakfastPeopleRow.style.display = breakfastCheckbox.checked ? 'block' : 'none';
        updateOrderSummary(3);
      });
    }

    if (breakfastPeopleInput) {
      breakfastPeopleInput.value = bookingState.breakfastPeople || bookingState.people || 1;
      breakfastPeopleInput.addEventListener('input', () => {
        let v = parseInt(breakfastPeopleInput.value || '0', 10) || 1;
        const max = parseInt(breakfastPeopleInput.max || bookingState.people || 1, 10);
        if (v < 1) v = 1;
        if (v > max) v = max;
        breakfastPeopleInput.value = String(v);
        bookingState.breakfastPeople = v;
        updateOrderSummary(3);
      });
    }

    // Initial summary render
    updateOrderSummary(3);
  }, 0);
}

// Init: show step 1
showStep(0);