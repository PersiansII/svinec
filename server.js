const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('./config.json');
const multer = require('multer');
const upload = multer({ dest: 'public/images/rooms/' });
const cookieParser = require('cookie-parser');
const PORT = process.env.PORT || 3000;

// replace bodyParser with built-in express parsers
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📂 Serve static admin files (css, js)
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// 📂 Serve public files
app.use(express.static(path.join(__dirname, 'public')));

// Simple helper: ensure data file exists and return parsed JSON
function readJsonFileSafe(p) {
  try {
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify([], null, 2));
    }
    return JSON.parse(fs.readFileSync(p, 'utf8') || '[]');
  } catch (e) {
    console.error('readJsonFileSafe error', p, e);
    return [];
  }
}

// GET all pending + archived common bookings (pending first)
app.get('/api/common-bookings', (req, res) => {
  const pendingPath = path.join(__dirname, 'data', 'pending-common-bookings.json');
  const archivePath = path.join(__dirname, 'data', 'archive-common.json');
  const pending = readJsonFileSafe(pendingPath);
  const archive = readJsonFileSafe(archivePath);
  // return pending first, then archive
  res.json([].concat(pending, archive));
});

// GET common rooms list
app.get('/api/common-rooms', (req, res) => {
  const file = path.join(__dirname, 'data', 'common-rooms.json');
  const rooms = readJsonFileSafe(file);
  res.json(rooms);
});

// POST create pending common booking
app.post('/api/common-bookings', (req, res) => {
  try {
    const { start, end, rooms, people, name, email, phone } = req.body || {};
    if (!start || !end || !Array.isArray(rooms) || !rooms.length || !name || !email) {
      return res.status(400).json({ success: false, message: 'Neplatná data rezervace.' });
    }
    const pendingPath = path.join(__dirname, 'data', 'pending-common-bookings.json');
    const pending = readJsonFileSafe(pendingPath);
    const booking = {
      start,
      end,
      rooms,
      people: Number(people) || 1,
      name,
      email,
      phone: phone || '',
      createdAt: new Date().toISOString(),
      id: Date.now()
    };
    pending.push(booking);
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
    return res.json({ success: true, id: booking.id });
  } catch (err) {
    console.error('POST /api/common-bookings error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API routes
app.get('/api/rooms', (req, res) => {
    const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));
    res.json(rooms);
});

app.get('/api/bookings', (req, res) => {
    const bookings = JSON.parse(fs.readFileSync('./data/confirmed-bookings.json'));
    res.json(bookings);
});

app.post('/api/bookings', (req, res) => {
  try {
    // basic validation
    const { startDate, endDate, rooms, people, name, email } = req.body || {};
    if (!startDate || !endDate || !Array.isArray(rooms) || rooms.length === 0 || !name || !email) {
      return res.status(400).json({ success: false, message: 'Neplatná data rezervace.' });
    }

    const pendingPath = path.join(__dirname, 'data', 'pending-bookings.json');
    const pending = fs.existsSync(pendingPath) ? JSON.parse(fs.readFileSync(pendingPath, 'utf8')) : [];

    const booking = {
      id: Date.now(),
      startDate,
      endDate,
      rooms: rooms.map(Number),
      people: Number(people) || 0,
      name: name || '',
      email: email || '',
      phone: req.body.phone || '',
      createdAt: new Date().toISOString(),
      // service fields
      dogs: Array.isArray(req.body.dogs) ? req.body.dogs.map(Number) : [],
      extraBeds: Array.isArray(req.body.extraBeds) ? req.body.extraBeds.map(Number) : [],
      cots: Array.isArray(req.body.cots) ? req.body.cots.map(Number) : [],
      bikes: Array.isArray(req.body.bikes) ? req.body.bikes.map(Number) : [],
      breakfast: !!req.body.breakfast,
      breakfastPeople: Number(req.body.breakfastPeople || 0),
      totalPrice: Number(req.body.totalPrice || 0),
      occupancy: req.body.occupancy || {}
    };

    pending.push(booking);
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

    // notify admin/customer that booking is pending (optional)
    try { notifyBookingStatus(booking, 'pending', false); } catch (e) { /* ignore */ }

    res.json({ success: true, id: booking.id });
  } catch (err) {
    console.error('POST /api/bookings error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


app.get('/api/bookings/pending', (req, res) => {
    removeExpiredPendingBookings();
    const filePath = path.join(__dirname, 'data', 'pending-bookings.json');
    if (fs.existsSync(filePath)) {
        const pendingBookings = JSON.parse(fs.readFileSync(filePath));
        res.json(pendingBookings);
    } else {
        res.json([]);
    }
});

// Get confirmed bookings
app.get('/api/bookings/confirmed', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'confirmed-bookings.json');
    if (fs.existsSync(filePath)) {
        const confirmedBookings = JSON.parse(fs.readFileSync(filePath));
        res.json(confirmedBookings);
    } else {
        res.json([]);
    }
});

// Accept pending booking
app.post('/api/bookings/:id/accept', (req, res) => {
    removeExpiredPendingBookings();
    const bookingId = parseInt(req.params.id);
    const pendingFile = path.join(__dirname, 'data', 'pending-bookings.json');
    const confirmedFile = path.join(__dirname, 'data', 'confirmed-bookings.json');
    const archiveFile = path.join(__dirname, 'data', 'archive-rooms.json');

    let pending = JSON.parse(fs.readFileSync(pendingFile));
    let confirmed = JSON.parse(fs.readFileSync(confirmedFile));
    let archive = fs.existsSync(archiveFile) ? JSON.parse(fs.readFileSync(archiveFile)) : [];

    const bookingIndex = pending.findIndex(b => b.id === bookingId);
    if (bookingIndex === -1) {
        return res.status(404).json({ success: false, message: 'Rezervace nenalezena.' });
    }

    const booking = pending[bookingIndex];

    // Check for conflicts
    const conflict = confirmed.some(c =>
        c.rooms.some(r => booking.rooms.includes(r)) &&
        new Date(booking.startDate) < new Date(c.endDate) &&
        new Date(booking.endDate) > new Date(c.startDate)
    );

    if (conflict) {
        return res.status(409).json({ success: false, message: 'Termín již není dostupný.' });
    }

    // Move to confirmed
    confirmed.push(booking);
    archive.push(booking); // Archive the booking
    pending.splice(bookingIndex, 1);

    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
    fs.writeFileSync(confirmedFile, JSON.stringify(confirmed, null, 2));
    fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2));

    // send notifications
    try { notifyBookingStatus(booking, 'accepted', false); } catch (e) { console.error(e); }

    res.json({ success: true, message: 'Rezervace potvrzena.' });
});

// Reject pending booking
app.post('/api/bookings/:id/reject', (req, res) => {
    removeExpiredPendingBookings();
    const bookingId = parseInt(req.params.id);
    const pendingFile = path.join(__dirname, 'data', 'pending-bookings.json');

    let pending = JSON.parse(fs.readFileSync(pendingFile));

    const bookingIndex = pending.findIndex(b => b.id === bookingId);
    if (bookingIndex === -1) {
        return res.status(404).json({ success: false, message: 'Rezervace nenalezena.' });
    }

    const booking = pending[bookingIndex];

    pending.splice(bookingIndex, 1);
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

    // send notifications
    try { notifyBookingStatus(booking, 'rejected', false); } catch (e) { console.error(e); }

    res.json({ success: true, message: 'Rezervace zamítnuta.' });
});

// === Common Rooms API ===

// Get all common rooms
app.get('/api/common-rooms', (req, res) => {
    const rooms = JSON.parse(fs.readFileSync('./data/common-rooms.json'));
    res.json(rooms);
});

// Get confirmed common room bookings
app.get('/api/common-bookings/confirmed', (req, res) => {
    const bookings = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));
    res.json(bookings);
});

// Get pending common room bookings
app.get('/api/common-bookings/pending', (req, res) => {
    removeExpiredPendingBookings();
    const bookings = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));
    res.json(bookings);
});

// Create a pending common room booking
app.post('/api/common-bookings', (req, res) => {
    const newBooking = req.body;
    const confirmed = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));
    const commonRooms = JSON.parse(fs.readFileSync('./data/common-rooms.json'));

    // ✅ Validate that rooms is present and an array
    if (!Array.isArray(newBooking.rooms) || newBooking.rooms.length === 0) {
        res.status(400).json({ message: 'Nebyl vybrán žádný společný prostor.' });
        return;
    }

    let exceedsCapacity = false;

    // ✅ Check if total people for each room exceeds capacity in the requested timeslot
    newBooking.rooms.forEach(roomId => {
        const room = commonRooms.find(r => r.id === roomId);
        if (!room) return; // Skip if room ID not found

        const totalPeople = confirmed
            .filter(existing => {
                const overlap = new Date(newBooking.start) < new Date(existing.end) &&
                                new Date(newBooking.end) > new Date(existing.start);
                return overlap && existing.rooms.includes(roomId);
            })
            .reduce((sum, b) => sum + (b.people || 0), 0);

        if (totalPeople + (newBooking.people || 0) > room.capacity) {
            exceedsCapacity = true;
        }
    });

    if (exceedsCapacity) {
        res.status(409).json({ message: 'Tento společný prostor je v tomto termínu již plně obsazený. Vyberte prosím jiný termín.' });
        return;
    }

    // ✅ Assign unique ID for admin confirmation
newBooking.id = Date.now();
newBooking.createdAt = new Date().toISOString(); // <-- Add this line

// Add to pending bookings
const pending = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));
pending.push(newBooking);
    fs.writeFileSync('./data/pending-common-bookings.json', JSON.stringify(pending, null, 2));
    res.status(201).json({ message: 'Rezervace byla odeslána ke schválení.' });
});


app.post('/api/common-bookings/:id/accept', (req, res) => {
    removeExpiredPendingBookings();
    const bookingId = parseInt(req.params.id);
    let pending = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));
    let confirmed = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));
    const archiveFile = path.join(__dirname, 'data', 'archive-common.json');
    let archive = fs.existsSync(archiveFile) ? JSON.parse(fs.readFileSync(archiveFile)) : [];

    const index = pending.findIndex(b => b.id === bookingId);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Rezervace nenalezena." });
    }

    const booking = pending[index];
    pending.splice(index, 1);
    confirmed.push(booking);
    archive.push(booking); // Archive the booking

    fs.writeFileSync('./data/pending-common-bookings.json', JSON.stringify(pending, null, 2));
    fs.writeFileSync('./data/confirmed-common-bookings.json', JSON.stringify(confirmed, null, 2));
    fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2));

    // send notifications
    try { notifyBookingStatus(booking, 'accepted', true); } catch (e) { console.error(e); }

    res.json({ success: true, message: "Rezervace byla potvrzena." });
});

// Reject pending common booking
app.post('/api/common-bookings/:id/reject', (req, res) => {
    removeExpiredPendingBookings();
    const bookingId = parseInt(req.params.id);
    let pending = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));

    const index = pending.findIndex(b => b.id === bookingId);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Rezervace nenalezena." });
    }

    const booking = pending[index];

    pending.splice(index, 1);
    fs.writeFileSync('./data/pending-common-bookings.json', JSON.stringify(pending, null, 2));

    // send notifications
    try { notifyBookingStatus(booking, 'rejected', true); } catch (e) { console.error(e); }

    res.json({ success: true, message: "Rezervace byla zamítnuta." });
});

// Cancel confirmed room booking
app.delete('/api/bookings/:id/cancel', (req, res) => {
    const bookingId = parseInt(req.params.id);
    let confirmed = JSON.parse(fs.readFileSync('./data/confirmed-bookings.json'));
    confirmed = confirmed.filter(b => b.id !== bookingId);
    fs.writeFileSync('./data/confirmed-bookings.json', JSON.stringify(confirmed, null, 2));
    res.json({ success: true, message: "Rezervace byla zrušena." });
});

// Cancel confirmed common room booking
app.delete('/api/common-bookings/:id/cancel', (req, res) => {
    const bookingId = parseInt(req.params.id);
    let confirmed = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));
    confirmed = confirmed.filter(b => b.id !== bookingId);
    fs.writeFileSync('./data/confirmed-common-bookings.json', JSON.stringify(confirmed, null, 2));
    res.json({ success: true, message: "Rezervace byla zrušena." });
});

// Block (all or selected) rooms and common rooms
app.post('/api/block-all', (req, res) => {
    const { start, end, rooms: selectedRooms, commonRooms: selectedCommon } = req.body;

    if (!start || !end) {
        return res.status(400).json({ success: false, message: "Neplatné datum." });
    }

    const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));
    const commonRooms = JSON.parse(fs.readFileSync('./data/common-rooms.json'));

    // Determine which IDs to block:
    // - If caller explicitly provides an array (even empty), use that (empty = block none).
    // - If caller provides neither rooms nor commonRooms, keep old behavior and block all.
    const hasRoomsParam = Array.isArray(selectedRooms);
    const hasCommonParam = Array.isArray(selectedCommon);

    const roomIdsToBlock = hasRoomsParam
        ? (selectedRooms.length ? selectedRooms.map(Number) : [])
        : (!hasCommonParam ? rooms.map(r => r.id) : []); // only default to ALL when neither param provided

    const commonIdsToBlock = hasCommonParam
        ? (selectedCommon.length ? selectedCommon.map(Number) : [])
        : (!hasRoomsParam ? commonRooms.map(r => r.id) : []); // only default to ALL when neither param provided

    // add a single confirmed booking entry for the selected regular rooms (one booking spanning the whole period)
    const confirmedRooms = JSON.parse(fs.readFileSync('./data/confirmed-bookings.json'));
    if (roomIdsToBlock.length) {
        const fullBlockRooms = {
            id: Date.now(),
            rooms: roomIdsToBlock,
            name: "Rezervace celé chaty (Admin)",
            email: "admin@cottage.local",
            phone: "",
            people: rooms.filter(r => roomIdsToBlock.includes(r.id)).reduce((sum, r) => sum + (r.beds || 0), 0),
            dog: false,
            breakfast: false,
            startDate: start,
            endDate: end
        };
        confirmedRooms.push(fullBlockRooms);
    }

    // create a single confirmed booking entry for all selected common rooms spanning the whole period
    const confirmedCommon = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));
    if (commonIdsToBlock.length) {
        const peopleTotal = commonRooms
            .filter(r => commonIdsToBlock.includes(r.id))
            .reduce((sum, r) => sum + (r.capacity || 0), 0);

        confirmedCommon.push({
            id: Date.now(),
            rooms: commonIdsToBlock,
            name: "Rezervace celé chaty (Admin)",
            email: "admin@cottage.local",
            phone: "",
            people: peopleTotal,
            // full-range timestamps for common booking
            start: `${start}T08:00`,
            end: `${end}T22:00`
        });
    }

    fs.writeFileSync('./data/confirmed-bookings.json', JSON.stringify(confirmedRooms, null, 2));
    fs.writeFileSync('./data/confirmed-common-bookings.json', JSON.stringify(confirmedCommon, null, 2));

    res.json({ success: true, message: "Blokace byla provedena." });
});

// Update room details
app.post('/api/rooms/update', upload.array('photos', 10), (req, res) => {
    const { id, name, price, beds, dogAllowed, dogFee, extraBedAllowed, extraBedFee, description, bookable } = req.body;
    const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));
    const roomIndex = rooms.findIndex(r => r.id == id);
    if (roomIndex === -1) {
        return res.status(404).json({ success: false, message: "Pokoj nenalezen." });
    }
    // save provided fields
    if (typeof name !== 'undefined') rooms[roomIndex].name = String(name);
    rooms[roomIndex].price = Number.isFinite(Number(price)) ? parseInt(price, 10) : rooms[roomIndex].price;
    rooms[roomIndex].beds = Number.isFinite(Number(beds)) ? parseInt(beds, 10) : rooms[roomIndex].beds;

    // Save description (if provided)
    if (typeof description !== 'undefined') {
      rooms[roomIndex].description = String(description);
    }
 
     // Save dog/extra bed values
     rooms[roomIndex].dogAllowed = (rooms[roomIndex].dogFee || -1) >= 0;
     rooms[roomIndex].extraBedAllowed = (rooms[roomIndex].extraBedFee || -1) >= 0;

     // Save bookable flag
     if (typeof bookable !== 'undefined') {
       rooms[roomIndex].bookable = (bookable === 'true' || bookable === true);
     }
     // Save showInCalendar flag
     if (typeof req.body.showInCalendar !== 'undefined') {
       rooms[roomIndex].showInCalendar = (req.body.showInCalendar === 'true' || req.body.showInCalendar === true);
     }
    // Service fees: -1 means disabled
    if (typeof req.body.dogFee !== 'undefined') rooms[roomIndex].dogFee = parseInt(req.body.dogFee, 10);
    if (typeof req.body.extraBedFee !== 'undefined') rooms[roomIndex].extraBedFee = parseInt(req.body.extraBedFee, 10);
    if (typeof req.body.cotFee !== 'undefined') rooms[roomIndex].cotFee = parseInt(req.body.cotFee, 10);
    if (typeof req.body.bikeFee !== 'undefined') rooms[roomIndex].bikeFee = parseInt(req.body.bikeFee, 10);
    // Group assignment
    if (typeof req.body.group !== 'undefined') {
      // form may send group as repeated fields resulting in array; normalize to single string
      const g = Array.isArray(req.body.group) ? (req.body.group[0] || '') : req.body.group;
      rooms[roomIndex].group = String(g);
    }
  
     // Handle multiple photos
     if (req.files && req.files.length > 0) {
         rooms[roomIndex].photos = rooms[roomIndex].photos || [];
         req.files.forEach(file => {
             if (!rooms[roomIndex].photos.includes(file.filename)) {
                 rooms[roomIndex].photos.push(file.filename);
             }
         });
     }
  
     fs.writeFileSync('./data/rooms.json', JSON.stringify(rooms, null, 2));
     res.json({ success: true });
 });

// Return only rooms that are bookable for the booking wizard
app.get('/api/rooms/bookable', (req, res) => {
  const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));
  const bookable = rooms.filter(r => typeof r.bookable === 'undefined' ? true : Boolean(r.bookable));
  res.json(bookable);
});
 
 // Delete a photo from a room's album (remove reference and delete file)
app.post('/api/rooms/:id/photos/delete', (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const filename = req.body && req.body.filename;
    if (!filename) return res.status(400).json({ success: false, message: 'Chybí název souboru.' });

    const roomsPath = path.join(__dirname, 'data', 'rooms.json');
    const rooms = readJsonFileSafe(roomsPath);
    const idx = rooms.findIndex(r => Number(r.id) === roomId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Pokoj nenalezen.' });

    rooms[idx].photos = (rooms[idx].photos || []).filter(f => f !== filename);
    fs.writeFileSync(roomsPath, JSON.stringify(rooms, null, 2));

    const filePath = path.join(__dirname, 'public', 'images', 'rooms', filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error('Failed to delete file', filePath, e); }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting room photo', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
 
 // Get all bookings (confirmed + pending)
 app.get('/api/bookings/all', (req, res) => {
     removeExpiredPendingBookings();
     // Room bookings
     const confirmed = JSON.parse(fs.readFileSync('./data/confirmed-bookings.json'));
     const pending = JSON.parse(fs.readFileSync('./data/pending-bookings.json'));

     // Common room bookings
     const confirmedCommon = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));
     const pendingCommon = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));

     // Add status and type to each booking
     const confirmedWithStatus = confirmed.map(b => ({ ...b, status: 'confirmed', type: 'room' }));
     const pendingWithStatus = pending.map(b => ({ ...b, status: 'pending', type: 'room' }));

     const confirmedCommonWithStatus = confirmedCommon.map(b => ({ ...b, status: 'confirmed', type: 'common' }));
     const pendingCommonWithStatus = pendingCommon.map(b => ({ ...b, status: 'pending', type: 'common' }));

     // Combine all
     res.json([
         ...confirmedWithStatus,
         ...pendingWithStatus,
         ...confirmedCommonWithStatus,
         ...pendingCommonWithStatus
     ]);
 });

// Get all seasons
app.get('/api/seasons', (req, res) => {
    const file = './data/seasons.json';
    if (fs.existsSync(file)) {
        res.json(JSON.parse(fs.readFileSync(file)));
    } else {
        res.json([]);
    }
});

// Add a new season
app.post('/api/seasons', (req, res) => {
    const file = './data/seasons.json';
    let seasons = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
    const newSeason = { ...req.body, id: Date.now() };
    seasons.push(newSeason);
    fs.writeFileSync(file, JSON.stringify(seasons, null, 2));
    res.json({ success: true, season: newSeason });
});

// Delete a season
app.delete('/api/seasons/:id', (req, res) => {
    const file = './data/seasons.json';
    let seasons = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
    seasons = seasons.filter(s => s.id != req.params.id);
    fs.writeFileSync(file, JSON.stringify(seasons, null, 2));
    res.json({ success: true });
});

// create transporter if SMTP configured in config.json
const transporter = (config.smtp && Object.keys(config.smtp).length)
  ? nodemailer.createTransport(config.smtp)
  : null;

function sendEmail(to, subject, text, html) {
  if (!to) return Promise.resolve();
  if (!transporter) {
    console.log('SMTP not configured — skipping email to:', to, subject);
    return Promise.resolve();
  }
  const from = config.emailFrom || config.adminEmail || 'no-reply@cottage.local';
  const mail = { from, to, subject, text, html };
  return transporter.sendMail(mail).catch(err => {
    console.error('sendEmail error', err);
  });
}

function formatBookingSummary(booking, isCommon) {
  const start = booking.startDate || booking.start || '';
  const end = booking.endDate || booking.end || '';
  const rooms = (booking.rooms || []).join(', ');
  return `Rezervace ID: ${booking.id}
Jméno: ${booking.name || '-'}
Email: ${booking.email || '-'}
Telefon: ${booking.phone || '-'}
Typ: ${isCommon ? 'Společný prostor' : 'Pokoj(y)'}
Místnosti: ${rooms}
Datum: ${start} – ${end}
Počet osob: ${booking.people || 0}
`;
}

function notifyBookingStatus(booking, status, isCommon) {
  const adminEmail = config.adminEmail || 'admin@cottage.local';
  const subj = status === 'accepted'
    ? `Rezervace potvrzena #${booking.id}`
    : `Rezervace zamítnuta #${booking.id}`;

  const customerText = (status === 'accepted')
    ? `Dobrý den ${booking.name || ''},

Vaše rezervace byla potvrzena.

` + formatBookingSummary(booking, isCommon)
    : `Dobrý den ${booking.name || ''},

Omlouváme se, ale Vaše rezervace byla bohužel zamítnuta.

` + formatBookingSummary(booking, isCommon);

  const adminText = `ADMIN - Rezervace ${status.toUpperCase()}:
` + formatBookingSummary(booking, isCommon);

  // fire-and-forget
  sendEmail(booking.email, subj, customerText, `<pre>${customerText}</pre>`).catch(()=>{});
  sendEmail(adminEmail, subj, adminText, `<pre>${adminText}</pre>`).catch(()=>{});
}

// Function to remove expired pending bookings
function removeExpiredPendingBookings() {
    const timeout = (config.pendingTimeoutMinutes || 30) * 60 * 1000;
    const now = Date.now();

    // Room bookings
    const pendingPath = './data/pending-bookings.json';
    let pending = JSON.parse(fs.readFileSync(pendingPath));
    const filtered = pending.filter(b => !b.createdAt || (now - new Date(b.createdAt).getTime()) < timeout);
    if (filtered.length !== pending.length) {
        fs.writeFileSync(pendingPath, JSON.stringify(filtered, null, 2));
    }

    // Common room bookings
    const pendingCommonPath = './data/pending-common-bookings.json';
    let pendingCommon = JSON.parse(fs.readFileSync(pendingCommonPath));
    const filteredCommon = pendingCommon.filter(b => !b.createdAt || (now - new Date(b.createdAt).getTime()) < timeout);
    if (filteredCommon.length !== pendingCommon.length) {
        fs.writeFileSync(pendingCommonPath, JSON.stringify(filteredCommon, null, 2));
    }
}

// Function to remove old confirmed bookings
function removeOldConfirmedBookings() {
    const now = Date.now();
    const cutoff = now - 48 * 60 * 60 * 1000; // 48 hours in ms

    // Rooms
    const confirmedPath = './data/confirmed-bookings.json';
    let confirmed = JSON.parse(fs.readFileSync(confirmedPath));
    const filtered = confirmed.filter(b => {
        // Use endDate for rooms
        if (!b.endDate) return true;
        return new Date(b.endDate).getTime() > cutoff;
    });
    if (filtered.length !== confirmed.length) {
        fs.writeFileSync(confirmedPath, JSON.stringify(filtered, null, 2));
    }

    // Common rooms
    const confirmedCommonPath = './data/confirmed-common-bookings.json';
    let confirmedCommon = JSON.parse(fs.readFileSync(confirmedCommonPath));
    const filteredCommon = confirmedCommon.filter(b => {
        // Use end for common rooms
        if (!b.end) return true;
        return new Date(b.end).getTime() > cutoff;
    });
    if (filteredCommon.length !== confirmedCommon.length) {
        fs.writeFileSync(confirmedCommonPath, JSON.stringify(filteredCommon, null, 2));
    }
}

// Check and remove expired bookings every minute
setInterval(() => {
    removeExpiredPendingBookings();
    removeOldConfirmedBookings();
}, 60 * 1000); // every 1 minute

removeOldConfirmedBookings();
setInterval(removeOldConfirmedBookings, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Config route
app.get('/api/config', (req, res) => {
    res.json({ pendingTimeoutMinutes: config.pendingTimeoutMinutes });
});

// Bulk update rooms by group
app.post('/api/rooms/bulk-update', (req, res) => {
  try {
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (!updates.length) return res.status(400).json({ success: false, message: 'No updates provided.' });

    const roomsPath = path.join(__dirname, 'data', 'rooms.json');
    const rooms = readJsonFileSafe(roomsPath);

    // apply updates
    updates.forEach(u => {
      const groupName = String(u.group || '');
      const bookable = typeof u.bookable !== 'undefined' ? !!u.bookable : undefined;
      const showInCalendar = typeof u.showInCalendar !== 'undefined' ? !!u.showInCalendar : undefined;

      rooms.forEach(r => {
        if (String(r.group || '') === groupName) {
          if (typeof bookable !== 'undefined') r.bookable = bookable;
          if (typeof showInCalendar !== 'undefined') r.showInCalendar = showInCalendar;
        }
      });
    });

    fs.writeFileSync(roomsPath, JSON.stringify(rooms, null, 2));
    res.json({ success: true });
  } catch (e) {
    console.error('Bulk update error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});