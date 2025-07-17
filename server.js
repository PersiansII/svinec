const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const config = require('./config.json');
const multer = require('multer');
const upload = multer({ dest: 'public/images/rooms/' });
const cookieParser = require('cookie-parser');
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(bodyParser.json());

// 🔒 Protect /admin root
app.get('/admin/', (req, res) => {
  if (req.cookies.adminToken === config.adminToken) {
    res.sendFile(path.join(__dirname, 'public/admin/index.html'));
  } else {
    res.redirect('/admin/login.html');
  }
});

// 🔒 Protect /admin/index.html directly
app.get('/admin/index.html', (req, res) => {
  if (req.cookies.adminToken === config.adminToken) {
    res.sendFile(path.join(__dirname, 'public/admin/index.html'));
  } else {
    res.redirect('/admin/login.html');
  }
});

// 📂 Serve static admin files (css, js)
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// 📂 Serve public files
app.use(express.static(path.join(__dirname, 'public')));


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
    const newBooking = req.body;

    // Load confirmed bookings
    const confirmed = JSON.parse(fs.readFileSync('./data/confirmed-bookings.json'));

    // Check for conflicts
    const conflict = confirmed.some(existing => {
        const existingStart = new Date(existing.startDate);
        const existingEnd = new Date(existing.endDate);
        const newStart = new Date(newBooking.startDate);
        const newEnd = new Date(newBooking.endDate);

        // Check for date overlap
        const datesOverlap = newStart < existingEnd && newEnd > existingStart;

        // Check if any rooms overlap
        const roomsOverlap = existing.rooms.some(room => newBooking.rooms.includes(room));

        return datesOverlap && roomsOverlap;
    });

    if (conflict) {
        return res.status(409).json({
            success: false,
            message: "Vybrané pokoje nejsou v požadovaném termínu dostupné."
        });
    }

    // Save as pending if no conflict
    const pending = JSON.parse(fs.readFileSync('./data/pending-bookings.json'));
    newBooking.id = Date.now();
    pending.push(newBooking);
    fs.writeFileSync('./data/pending-bookings.json', JSON.stringify(pending, null, 2));

    res.json({ success: true, message: 'Rezervace byla odeslána a čeká na potvrzení.' });
});


app.get('/api/bookings/pending', (req, res) => {
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
    const bookingId = parseInt(req.params.id);
    const pendingFile = path.join(__dirname, 'data', 'pending-bookings.json');
    const confirmedFile = path.join(__dirname, 'data', 'confirmed-bookings.json');

    let pending = JSON.parse(fs.readFileSync(pendingFile));
    let confirmed = JSON.parse(fs.readFileSync(confirmedFile));

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
    pending.splice(bookingIndex, 1);

    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
    fs.writeFileSync(confirmedFile, JSON.stringify(confirmed, null, 2));

    res.json({ success: true, message: 'Rezervace potvrzena.' });
});

// Reject pending booking
app.post('/api/bookings/:id/reject', (req, res) => {
    const bookingId = parseInt(req.params.id);
    const pendingFile = path.join(__dirname, 'data', 'pending-bookings.json');

    let pending = JSON.parse(fs.readFileSync(pendingFile));

    const bookingIndex = pending.findIndex(b => b.id === bookingId);
    if (bookingIndex === -1) {
        return res.status(404).json({ success: false, message: 'Rezervace nenalezena.' });
    }

    pending.splice(bookingIndex, 1);
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

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
    const bookings = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));
    res.json(bookings);
});

// Create a pending common room booking
app.post('/api/common-bookings', (req, res) => {
    const newBooking = req.body;
    const confirmed = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));

    // Check for conflicts
    const conflict = confirmed.some(existing => {
        const overlap = new Date(newBooking.start) < new Date(existing.end) &&
                        new Date(newBooking.end) > new Date(existing.start);
        const roomsOverlap = existing.rooms.some(r => newBooking.rooms.includes(r));
        return overlap && roomsOverlap;
    });

    if (conflict) {
        return res.status(409).json({
            success: false,
            message: "Vybrané místnosti nejsou v požadovaném čase dostupné."
        });
    }

    const pending = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));
    newBooking.id = Date.now();
    pending.push(newBooking);
    fs.writeFileSync('./data/pending-common-bookings.json', JSON.stringify(pending, null, 2));

    res.json({ success: true, message: 'Rezervace byla odeslána a čeká na potvrzení.' });
});

// Accept pending common booking
app.post('/api/common-bookings/:id/accept', (req, res) => {
    const bookingId = parseInt(req.params.id);
    let pending = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));
    let confirmed = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));

    const index = pending.findIndex(b => b.id === bookingId);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Rezervace nenalezena." });
    }

    const booking = pending[index];
    pending.splice(index, 1);
    confirmed.push(booking);

    fs.writeFileSync('./data/pending-common-bookings.json', JSON.stringify(pending, null, 2));
    fs.writeFileSync('./data/confirmed-common-bookings.json', JSON.stringify(confirmed, null, 2));

    res.json({ success: true, message: "Rezervace byla potvrzena." });
});

// Reject pending common booking
app.post('/api/common-bookings/:id/reject', (req, res) => {
    const bookingId = parseInt(req.params.id);
    let pending = JSON.parse(fs.readFileSync('./data/pending-common-bookings.json'));

    const index = pending.findIndex(b => b.id === bookingId);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Rezervace nenalezena." });
    }

    pending.splice(index, 1);
    fs.writeFileSync('./data/pending-common-bookings.json', JSON.stringify(pending, null, 2));

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

// Block entire building
app.post('/api/block-all', (req, res) => {
    const { start, end } = req.body;

    if (!start || !end) {
        return res.status(400).json({ success: false, message: "Neplatné datum." });
    }

    const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));
    const commonRooms = JSON.parse(fs.readFileSync('./data/common-rooms.json'));

    const fullBlockRooms = {
        id: Date.now(),
        rooms: rooms.map(r => r.id),
        name: "Rezervace celé chaty (Admin)",
        email: "admin@cottage.local",
        phone: "",
        people: rooms.reduce((sum, r) => sum + r.beds, 0),
        dog: false,
        breakfast: false,
        startDate: start,
        endDate: end
    };

    const fullBlockCommon = [];

const startDateObj = new Date(start);
const endDateObj = new Date(end);

for (
    let d = new Date(startDateObj);
    d <= endDateObj;
    d.setDate(d.getDate() + 1)
) {
    commonRooms.forEach(r => {
        fullBlockCommon.push({
            id: Date.now() + r.id + d.getDate(), // Unique ID per room & date
            rooms: [r.id],
            name: "Rezervace celé chaty (Admin)",
            email: "admin@cottage.local",
            phone: "",
            people: r.capacity,
            start: `${d.toISOString().split('T')[0]}T08:00`,
            end: `${d.toISOString().split('T')[0]}T22:00`
        });
    });
}



    const confirmedRooms = JSON.parse(fs.readFileSync('./data/confirmed-bookings.json'));
    const confirmedCommon = JSON.parse(fs.readFileSync('./data/confirmed-common-bookings.json'));

    confirmedRooms.push(fullBlockRooms);
    fullBlockCommon.forEach(b => confirmedCommon.push(b));


    fs.writeFileSync('./data/confirmed-bookings.json', JSON.stringify(confirmedRooms, null, 2));
    fs.writeFileSync('./data/confirmed-common-bookings.json', JSON.stringify(confirmedCommon, null, 2));

    res.json({ success: true, message: "Celá chata byla blokována." });
});

// Update room details
app.post('/api/rooms/update', upload.single('photo'), (req, res) => {
    const { id, price, beds } = req.body;
    const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));

    const roomIndex = rooms.findIndex(r => r.id == id);
    if (roomIndex === -1) {
        return res.status(404).json({ success: false, message: "Pokoj nenalezen." });
    }

    rooms[roomIndex].price = parseInt(price);
    rooms[roomIndex].beds = parseInt(beds);

    if (req.file) {
        rooms[roomIndex].photo = req.file.filename;
    }

    fs.writeFileSync('./data/rooms.json', JSON.stringify(rooms, null, 2));
    res.json({ success: true });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === config.adminPassword) {
    res.cookie('adminToken', config.adminToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Nesprávné heslo' });
  }
});
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
