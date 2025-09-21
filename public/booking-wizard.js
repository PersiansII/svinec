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
  cots: [],
  bikes: [],
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

  // Always update footer summary even if inline summary element is not present
  renderFooterSummary(stepNumber);

  // Update inline summary if the container exists (Step 2 keeps its own block)
  const summaryId = stepNumber === 2 ? 'order-summary-2' : 'order-summary-3';
  const el = document.getElementById(summaryId);
  if (el) {
    el.innerHTML = `
      <div style="margin-top:12px; padding:10px; border-radius:0; background:#fff; border:1px solid #e6e6e6;">
        <div><strong>Datum:</strong> ${bookingState.startDate || '-'} – ${bookingState.endDate || '-'}</div>
        <div><strong>Počet nocí:</strong> ${nights}</div>
        <div><strong>Počet osob (součet po pokojích):</strong> ${peopleSum}</div>
        <div><strong>Cena (vč. služeb):</strong> ${price} Kč</div>
      </div>
    `;
  }
}

function formatDateRange(start, end){
  if (!start || !end) return '-';
  return `${start} – ${end}`;
}

function renderFooterSummary(stepNumber){
  const cont = document.getElementById('footer-summary');
  if (!cont) return;
  // For step 1, reflect live calendar selection (before persisting to bookingState)
  let startISO = bookingState.startDate;
  let endISO = bookingState.endDate;
  if (stepNumber === 1 && typeof window.getSelectedDates === 'function') {
    try {
      const sel = window.getSelectedDates() || {};
      if (sel.start) startISO = sel.start;
      if (sel.end) endISO = sel.end;
    } catch (e) {}
  }
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;
  let nights = 0;
  if (start && end) nights = Math.round((end - start) / (1000*60*60*24));
  const roomIds = stepNumber === 2 ? selectedRooms : (bookingState.rooms || []);
  let peopleSum = 0;
  roomIds.forEach(id => {
    const v = parseInt(document.getElementById(`occupancy-room-${id}`)?.value || '0', 10) || 0;
    peopleSum += v;
  });
  let price = 0;
  if (stepNumber === 2) {
    roomIds.forEach(id => {
      const r = roomsData.find(rr => rr.id === id);
      if (r && startISO && endISO) {
        price += getRoomPrice(r, startISO, endISO);
      }
    });
  } else {
    if (bookingState.rooms && bookingState.rooms.length) price = calculateTotalPrice();
  }
  const showPeople = stepNumber !== 1;
  let chips = `
    <div class="footer-chip"><strong>Datum:</strong> ${formatDateRange(startISO, endISO)}</div>
    <div class="footer-chip"><strong>Nocí:</strong> ${nights}</div>
  `;
  if (showPeople) {
    const ppl = peopleSum || bookingState.people || 0;
    chips += `<div class="footer-chip"><strong>Osob:</strong> ${ppl}</div>`;
  }
  chips += `<div class="footer-chip"><strong>Cena:</strong> ${price} Kč</div>`;
  cont.innerHTML = chips;
}

function updateFooterForStep(stepIdx){
  const backBtn = document.getElementById('footer-back');
  const nextBtn = document.getElementById('footer-next');
  const submitBtn = document.getElementById('footer-submit');
  if (!backBtn || !nextBtn || !submitBtn) return;
  backBtn.style.display = stepIdx === 0 ? 'none' : '';
  nextBtn.style.display = (stepIdx === 3) ? 'none' : '';
  submitBtn.style.display = (stepIdx === 3) ? '' : 'none';
  if (stepIdx === 0) {
    const { start, end } = window.getSelectedDates ? window.getSelectedDates() : { start:null, end:null };
    nextBtn.disabled = !(start && end && new Date(start) < new Date(end));
  } else if (stepIdx === 1) {
    const ok = selectedRooms.length>0 && selectedRooms.every(id => (parseInt(document.getElementById(`occupancy-room-${id}`)?.value||'0',10)||0) >= 1);
    nextBtn.disabled = !ok;
  } else if (stepIdx === 2) {
    nextBtn.disabled = false;
  } else if (stepIdx === 3) {
    const name = document.getElementById('name')?.value?.trim();
    const email = document.getElementById('email')?.value?.trim();
    submitBtn.disabled = !(name && email);
  }
  renderFooterSummary(stepIdx+1);
}

// Footer nav hooks
(function(){
  const back = document.getElementById('footer-back');
  const next = document.getElementById('footer-next');
  const submit = document.getElementById('footer-submit');
  if (back) back.addEventListener('click', () => {
    if (document.getElementById('step-4')?.classList.contains('active')) return document.getElementById('back-to-3').click();
    if (document.getElementById('step-3')?.classList.contains('active')) return document.getElementById('back-to-2').click();
    if (document.getElementById('step-2')?.classList.contains('active')) return document.getElementById('back-to-1').click();
  });
  if (next) next.addEventListener('click', () => {
    if (document.getElementById('step-1')?.classList.contains('active')) return document.getElementById('to-step-2').click();
    if (document.getElementById('step-2')?.classList.contains('active')) return document.getElementById('to-step-3').click();
    if (document.getElementById('step-3')?.classList.contains('active')) return document.getElementById('to-step-4').click();
  });
  if (submit) submit.addEventListener('click', () => {
    document.getElementById('submit-btn')?.click();
  });
})();

// keep footer summary live on final form fields
['name','email','phone'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => updateFooterForStep(3));
});

async function loadRooms() {
  try {
    let res = await fetch('/api/rooms/bookable');
    if (!res.ok) {
      // fallback to a more generic endpoint
      res = await fetch('/api/rooms');
    }
    if (!res.ok) throw new Error(`Rooms endpoint returned ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      roomsData = await res.json();
    } else {
      const txt = await res.text();
      try { roomsData = JSON.parse(txt); } catch(e) { throw new Error('Rooms response not JSON'); }
    }
    return true;
  } catch (err) {
    console.error('Failed to load rooms:', err);
    roomsData = [];
    return false;
  }
}

async function loadBookings() {
  try {
    let res = await fetch('/api/bookings/all');
    if (!res.ok) res = await fetch('/api/bookings');
    if (!res.ok) throw new Error(`Bookings endpoint returned ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      allBookings = await res.json();
    } else {
      const txt = await res.text();
      try { allBookings = JSON.parse(txt); } catch(e) { throw new Error('Bookings response not JSON'); }
    }
    return true;
  } catch (err) {
    console.error('Failed to load bookings:', err);
    allBookings = [];
    return false;
  }
}

async function loadSeasons() {
  try {
    let res = await fetch('/api/seasons');
    if (!res.ok) { seasons = []; return true; }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      seasons = await res.json();
    } else {
      const txt = await res.text();
      try { seasons = JSON.parse(txt); } catch(e) { seasons = []; }
    }
    return true;
  } catch (err) {
    console.error('Failed to load seasons:', err);
    seasons = [];
    return false;
  }
}

function showStep(n) {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });
  updateFooterForStep(n);
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
    const photos = (room.photos || []).length ? room.photos : ['default.jpg'];
    const card = document.createElement('div');
    card.className = 'common-room-card';
    card.innerHTML = `
      <div class="crc-main">
        <img class="crc-image" src="/images/rooms/${photos[0]}" alt="${room.name}">
        <div class="crc-content">
          <div class="crc-title">${room.name}</div>
          <div class="crc-desc">${room.description || ''}</div>
          <div class="crc-stats">
            <div class="crc-stat">Cena za pobyt: <strong>${getRoomPrice(room, bookingState.startDate, bookingState.endDate)} Kč</strong></div>
            <div class="crc-stat">Lůžek: <strong>${room.beds || 0}</strong></div>
          </div>
          <div class="crc-actions">
            <label>
              <input type="checkbox" class="room-cb" data-id="${room.id}"> Vybrat
            </label>
            <div class="crc-people" data-id="${room.id}">
              <label>Počet osob: <input type="number" min="1" max="${room.beds || 1}" value="1" class="people-input" id="occupancy-room-${room.id}" data-id="${room.id}"></label>
            </div>
          </div>
        </div>
      </div>`;

    // Image opens gallery modal
    const imgEl = card.querySelector('.crc-image');
    imgEl.addEventListener('click', () => openPhotoModal(photos, 0));

    container.appendChild(card);
  });

  // Attach behavior (mirror common step 2)
  function updateSummary() { updateOrderSummary(2); }

  container.querySelectorAll('.room-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = (e.target.getAttribute('data-id'));
      const roomId = isNaN(Number(id)) ? id : Number(id);
      const room = roomsData.find(r => r.id === roomId);
      const cap = room && room.beds ? room.beds : 1;
      if (e.target.checked) {
        if (!selectedRooms.includes(roomId)) selectedRooms.push(roomId);
        const pplWrap = container.querySelector(`.crc-people[data-id="${roomId}"]`);
        if (pplWrap) {
          pplWrap.classList.add('show');
          const input = pplWrap.querySelector('input');
          if (input) {
            input.min = '1';
            input.max = String(Math.max(1, cap));
            input.value = input.value && Number(input.value) >= 1 ? input.value : '1';
            bookingState.occupancy[roomId] = clamp(parseInt(input.value||'1',10)||1, 1, parseInt(input.max,10));
          }
        }
      } else {
        selectedRooms = selectedRooms.filter(rid => rid !== roomId);
        delete bookingState.occupancy[roomId];
        const pplWrap = container.querySelector(`.crc-people[data-id="${roomId}"]`);
        if (pplWrap) pplWrap.classList.remove('show');
      }
      updateOccupancyLimits();
      updateSummary();
      if (typeof updateFooterForStep === 'function') updateFooterForStep(1);
    });
  });

  container.querySelectorAll('.people-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const id = (e.target.getAttribute('data-id'));
      const roomId = isNaN(Number(id)) ? id : Number(id);
      const max = parseInt(e.target.max || '1', 10);
      let v = parseInt(e.target.value || '0', 10) || 1;
      v = clamp(v, 1, max);
      e.target.value = String(v);
      bookingState.occupancy[roomId] = v;
      updateOccupancyLimits();
      updateSummary();
      if (typeof updateFooterForStep === 'function') updateFooterForStep(1);
    });
  });

  // Add order summary container at bottom of step 2
  updateOrderSummary(2);
  if (typeof updateFooterForStep === 'function') updateFooterForStep(1);
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
        bookingState.cots.map(id => {
          const r = roomsData.find(r => r.id === id);
          return r ? `${r.name} postýlka` : '';
        })
      ).concat(
        bookingState.bikes.map(id => {
          const r = roomsData.find(r => r.id === id);
          return r ? `${r.name} uložení kol` : '';
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
  // extra services (per-room)
  bookingState.dogs.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room && typeof room.dogFee !== 'undefined' && Number(room.dogFee) >= 0) total += Number(room.dogFee);
  });
  bookingState.extraBeds.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    // Přistýlka: flat fee (not per night)
    if (room && typeof room.extraBedFee !== 'undefined' && Number(room.extraBedFee) >= 0) total += Number(room.extraBedFee);
  });
  // cots and bike storage are one-time fees
  bookingState.cots.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room && typeof room.cotFee !== 'undefined' && Number(room.cotFee) >= 0) total += Number(room.cotFee);
  });
  bookingState.bikes.forEach(id => {
    const room = roomsData.find(r => r.id === id);
    if (room && typeof room.bikeFee !== 'undefined' && Number(room.bikeFee) >= 0) total += Number(room.bikeFee);
  });

  // Breakfast: 150 Kč per person per night
  if (bookingState.breakfast) {
    const nights = Math.max(0, Math.round((new Date(bookingState.endDate) - new Date(bookingState.startDate)) / (1000*60*60*24)));
    const peopleForBreakfast = Number(bookingState.breakfastPeople || bookingState.people || 0);
    total += peopleForBreakfast * nights * 150;
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

  // Load required data with error handling
  const okRooms = await loadRooms();
  if (!okRooms) {
    alert('Nepodařilo se načíst seznam pokojů ze serveru. Zkuste to prosím znovu později nebo zkontrolujte server.');
    return;
  }
  const okBookings = await loadBookings();
  if (!okBookings) {
    // still proceed but warn user (empty bookings = conservative availability)
    console.warn('Bookings could not be loaded; continuing with empty bookings list.');
  }
  await loadSeasons(); // seasons are optional; failures result in empty seasons
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
  bookingState.cots = [];
  bookingState.bikes = [];
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
    if (document.getElementById(`cot-room-${roomId}`)?.checked) {
      bookingState.cots.push(roomId);
    }
    if (document.getElementById(`bike-room-${roomId}`)?.checked) {
      bookingState.bikes.push(roomId);
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
    cots: bookingState.cots,
    bikes: bookingState.bikes,
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
  // Ensure legacy inline summary for step 3 is removed
  const oldSummary3 = document.getElementById('order-summary-3');
  if (oldSummary3) oldSummary3.remove();
    container.innerHTML += '<h3 style="margin: 0 0 10px 0;">Služby</h3>';

  // Per-room service options (occupancy inputs are managed in Step 2)
  bookingState.rooms.forEach(roomId => {
    const room = roomsData.find(r => r.id === roomId);
    // Room header only; occupancy inputs are intentionally NOT duplicated here
    container.innerHTML += `
      <div style="margin-bottom:8px;">
        <strong>${room ? room.name : roomId}</strong>
      </div>
    `;

    // Render available services based on fee >= 0
    if (room && typeof room.dogFee !== 'undefined' && Number(room.dogFee) >= 0) {
      const id = `dog-room-${room.id}`;
      container.innerHTML += `
        <label>
          <input type="checkbox" id="${id}">
          ${room.name} pes (+${room.dogFee} Kč)
        </label><br>
      `;
    }
    if (room && typeof room.extraBedFee !== 'undefined' && Number(room.extraBedFee) >= 0) {
      const id = `extra-bed-room-${room.id}`;
      container.innerHTML += `
        <label>
          <input type="checkbox" id="${id}">
          ${room.name} přistýlka (+${room.extraBedFee} Kč)
        </label><br>
      `;
    }
    if (room && typeof room.cotFee !== 'undefined' && Number(room.cotFee) >= 0) {
      const id = `cot-room-${room.id}`;
      container.innerHTML += `
        <label>
          <input type="checkbox" id="${id}">
          ${room.name} postýlka (+${room.cotFee} Kč)
        </label><br>
      `;
    }
    if (room && typeof room.bikeFee !== 'undefined' && Number(room.bikeFee) >= 0) {
      const id = `bike-room-${room.id}`;
      container.innerHTML += `
        <label>
          <input type="checkbox" id="${id}">
          ${room.name} uložení kol (+${room.bikeFee} Kč)
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

  // Attach listeners to service inputs so summary updates automatically
  // Use a short timeout so elements exist in DOM
  setTimeout(() => {
    // Per-room dog / extra-bed listeners
    bookingState.rooms.forEach(roomId => {
      const dogEl = document.getElementById(`dog-room-${roomId}`);
      if (dogEl) {
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

      const cotEl = document.getElementById(`cot-room-${roomId}`);
      if (cotEl) {
        cotEl.checked = bookingState.cots.includes(roomId);
        cotEl.addEventListener('change', () => {
          if (cotEl.checked) {
            if (!bookingState.cots.includes(roomId)) bookingState.cots.push(roomId);
          } else {
            bookingState.cots = bookingState.cots.filter(id => id !== roomId);
          }
          updateOrderSummary(3);
        });
      }

      const bikeEl = document.getElementById(`bike-room-${roomId}`);
      if (bikeEl) {
        bikeEl.checked = bookingState.bikes.includes(roomId);
        bikeEl.addEventListener('change', () => {
          if (bikeEl.checked) {
            if (!bookingState.bikes.includes(roomId)) bookingState.bikes.push(roomId);
          } else {
            bookingState.bikes = bookingState.bikes.filter(id => id !== roomId);
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

    // Initial footer summary render
    updateOrderSummary(3);
   }, 0);
 }

 // Init: show step 1
 showStep(0);