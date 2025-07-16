
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const config = require('./config.json');

app.use(express.static('public'));
app.use(bodyParser.json());

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


// Admin login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === config.adminPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
