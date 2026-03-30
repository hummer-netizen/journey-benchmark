import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { seedDatabase } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3333;
const DB_PATH = process.env.DB_PATH || join(__dirname, '../flights.db');

const db = new Database(DB_PATH);
seedDatabase(db);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function html(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - SkyBook Flights</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #1a3c6e; }
    .nav { background: #1a3c6e; padding: 10px 20px; margin: -40px -20px 40px; }
    .nav a { color: white; text-decoration: none; font-size: 1.2em; font-weight: bold; }
    form { background: #f5f7fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, select { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button, .btn { background: #1a3c6e; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
    button:hover, .btn:hover { background: #2a5ca0; }
    .flight-card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
    .flight-info { flex: 1; }
    .flight-price { font-size: 1.5em; font-weight: bold; color: #1a3c6e; }
    .confirmation { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; }
    .error { background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 20px; }
  </style>
</head>
<body>
  <div class="nav"><a href="/">✈ SkyBook Flights</a></div>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

// Homepage — search form
app.get('/', (req, res) => {
  const airports = db.prepare('SELECT DISTINCT origin, origin_city FROM flights ORDER BY origin').all();
  const airportOptions = airports.map(a => `<option value="${a.origin}">${a.origin} — ${a.origin_city}</option>`).join('\n');
  const today = new Date().toISOString().slice(0, 10);
  res.send(html('Search Flights', `
    <form action="/search" method="GET">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;">
        <div>
          <label for="from">From</label>
          <select name="from" id="from" required>
            <option value="">Select origin</option>
            ${airportOptions}
          </select>
        </div>
        <div>
          <label for="to">To</label>
          <select name="to" id="to" required>
            <option value="">Select destination</option>
            ${airportOptions}
          </select>
        </div>
        <div>
          <label for="date">Date</label>
          <input type="date" name="date" id="date" value="${today}" required>
        </div>
      </div>
      <button type="submit" id="search-btn">Search Flights</button>
    </form>
  `));
});

// Search results
app.get('/search', (req, res) => {
  const { from, to, date } = req.query;
  if (!from || !to || !date) {
    return res.redirect('/');
  }
  const flights = db.prepare(`
    SELECT * FROM flights
    WHERE origin = ? AND destination = ? AND departure_date = ?
    ORDER BY departure_time
  `).all(from, to, date);

  const flightCards = flights.length === 0
    ? '<p>No flights found for this route and date. Please try different options.</p>'
    : flights.map(f => `
      <div class="flight-card" data-flight-id="${f.id}">
        <div class="flight-info">
          <strong>${f.flight_number}</strong><br>
          ${f.origin} (${f.origin_city}) → ${f.destination} (${f.destination_city})<br>
          ${f.departure_time} – ${f.arrival_time} &nbsp;·&nbsp; ${Math.floor(f.duration_min/60)}h ${f.duration_min%60}m<br>
          ${f.seats_available} seats available
        </div>
        <div style="text-align:right">
          <div class="flight-price">$${f.price_usd}</div>
          <a href="/book/${f.id}" class="btn" style="margin-top:10px">Select</a>
        </div>
      </div>
    `).join('');

  res.send(html(`Flights: ${from} → ${to} on ${date}`, `
    <p><a href="/">← New search</a></p>
    <p>Found <strong>${flights.length}</strong> flight(s)</p>
    ${flightCards}
  `));
});

// Booking form
app.get('/book/:flightId', (req, res) => {
  const flight = db.prepare('SELECT * FROM flights WHERE id = ?').get(req.params.flightId);
  if (!flight) {
    return res.status(404).send(html('Not Found', '<p class="error">Flight not found.</p>'));
  }
  res.send(html('Book Flight', `
    <div class="flight-card">
      <div class="flight-info">
        <strong>${flight.flight_number}</strong> &nbsp;
        ${flight.origin} → ${flight.destination}<br>
        ${flight.departure_date} &nbsp;·&nbsp; ${flight.departure_time} – ${flight.arrival_time}
      </div>
      <div class="flight-price">$${flight.price_usd}</div>
    </div>
    <form action="/book/${flight.id}" method="POST">
      <label for="passenger_name">Full Name</label>
      <input type="text" name="passenger_name" id="passenger_name" placeholder="Jane Doe" required>
      <label for="passenger_email">Email Address</label>
      <input type="email" name="passenger_email" id="passenger_email" placeholder="jane@example.com" required>
      <label for="seat_class">Seat Class</label>
      <select name="seat_class" id="seat_class">
        <option value="Economy">Economy</option>
        <option value="Business">Business (+$150)</option>
        <option value="First">First Class (+$350)</option>
      </select>
      <button type="submit" id="confirm-booking-btn">Confirm Booking — $${flight.price_usd}</button>
    </form>
  `));
});

// Process booking
app.post('/book/:flightId', (req, res) => {
  const flight = db.prepare('SELECT * FROM flights WHERE id = ?').get(req.params.flightId);
  if (!flight) {
    return res.status(404).send(html('Not Found', '<p class="error">Flight not found.</p>'));
  }
  const { passenger_name, passenger_email, seat_class } = req.body;
  if (!passenger_name || !passenger_email) {
    return res.status(400).send(html('Error', '<p class="error">Name and email are required.</p>'));
  }
  const extras = seat_class === 'Business' ? 150 : seat_class === 'First' ? 350 : 0;
  const total = flight.price_usd + extras;
  const ref = `SKY${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`
    INSERT INTO bookings (booking_ref, flight_id, passenger_name, passenger_email, seat_class, total_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ref, flight.id, passenger_name, passenger_email, seat_class || 'Economy', total);
  res.redirect(`/confirmation/${ref}`);
});

// Booking confirmation
app.get('/confirmation/:bookingRef', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, f.flight_number, f.origin, f.destination, f.departure_date, f.departure_time, f.arrival_time
    FROM bookings b JOIN flights f ON b.flight_id = f.id
    WHERE b.booking_ref = ?
  `).get(req.params.bookingRef);
  if (!booking) {
    return res.status(404).send(html('Not Found', '<p class="error">Booking not found.</p>'));
  }
  res.send(html('Booking Confirmed!', `
    <div class="confirmation">
      <h2>✅ Booking Confirmed!</h2>
      <p>Booking Reference: <strong id="booking-ref">${booking.booking_ref}</strong></p>
      <p>Flight: <strong>${booking.flight_number}</strong> — ${booking.origin} → ${booking.destination}</p>
      <p>Date: ${booking.departure_date} &nbsp;·&nbsp; ${booking.departure_time} – ${booking.arrival_time}</p>
      <p>Passenger: ${booking.passenger_name} (${booking.passenger_email})</p>
      <p>Class: ${booking.seat_class}</p>
      <p>Total Paid: <strong>$${booking.total_price}</strong></p>
    </div>
    <p style="margin-top:20px"><a href="/" class="btn">Book Another Flight</a></p>
  `));
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'flight-app' }));

app.listen(PORT, () => {
  console.log(`Flight app running on http://localhost:${PORT}`);
});

export { db };
