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
app.use(bodyParser.urlencoded({ extended: true }));

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
  // ...validation...
  const pendingBookings = JSON.parse(fs.readFileSync('./data/pending-bookings.json'));
  const booking = {
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    rooms: req.body.rooms,
    people: req.body.people,
    dogs: req.body.dogs,
    extraBeds: req.body.extraBeds,
    breakfast: req.body.breakfast,
    breakfastPeople: req.body.breakfastPeople,
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    totalPrice: req.body.totalPrice,
    occupancy: req.body.occupancy, 
    createdAt: new Date().toISOString(),
    id: Date.now()
  };
  pendingBookings.push(booking);
  fs.writeFileSync('./data/pending-bookings.json', JSON.stringify(pendingBookings, null, 2));
  res.json({ success: true });
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


// Accept pending common booking
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
app.post('/api/rooms/update', upload.array('photos', 10), (req, res) => {
    const { id, price, beds, dogAllowed, dogFee, extraBedAllowed, extraBedFee } = req.body;
    const rooms = JSON.parse(fs.readFileSync('./data/rooms.json'));
    const roomIndex = rooms.findIndex(r => r.id == id);
    if (roomIndex === -1) {
        return res.status(404).json({ success: false, message: "Pokoj nenalezen." });
    }
    rooms[roomIndex].price = parseInt(price);
    rooms[roomIndex].beds = parseInt(beds);

    // Save dog/extra bed values
    rooms[roomIndex].dogAllowed = dogAllowed === 'true' || dogAllowed === true;
    rooms[roomIndex].dogFee = parseInt(dogFee) || 0;
    rooms[roomIndex].extraBedAllowed = extraBedAllowed === 'true' || extraBedAllowed === true;
    rooms[roomIndex].extraBedFee = parseInt(extraBedFee) || 0;

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