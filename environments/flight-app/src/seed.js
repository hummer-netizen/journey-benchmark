import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../flights.db');

const AIRPORTS = [
  { code: 'JFK', city: 'New York' },
  { code: 'LAX', city: 'Los Angeles' },
  { code: 'ORD', city: 'Chicago' },
  { code: 'ATL', city: 'Atlanta' },
  { code: 'DFW', city: 'Dallas' },
  { code: 'DEN', city: 'Denver' },
  { code: 'SFO', city: 'San Francisco' },
  { code: 'SEA', city: 'Seattle' },
  { code: 'BOS', city: 'Boston' },
  { code: 'MIA', city: 'Miami' },
];

function hashPrice(from, to, date, flightNum) {
  let h = 0;
  const s = `${from}${to}${date}${flightNum}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return 150 + (Math.abs(h) % 500);
}

export function seedDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_number TEXT NOT NULL,
      origin TEXT NOT NULL,
      origin_city TEXT NOT NULL,
      destination TEXT NOT NULL,
      destination_city TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price_usd INTEGER NOT NULL,
      seats_available INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT NOT NULL UNIQUE,
      flight_id INTEGER NOT NULL,
      passenger_name TEXT NOT NULL,
      passenger_email TEXT NOT NULL,
      seat_class TEXT NOT NULL DEFAULT 'Economy',
      total_price INTEGER NOT NULL,
      booked_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (flight_id) REFERENCES flights(id)
    );
  `);

  const existing = db.prepare('SELECT COUNT(*) as cnt FROM flights').get();
  if (existing.cnt > 0) return;

  const insert = db.prepare(`
    INSERT INTO flights (flight_number, origin, origin_city, destination, destination_city,
      departure_date, departure_time, arrival_time, duration_min, price_usd, seats_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const departureTimes = ['06:00', '08:30', '11:00', '14:00', '16:30', '19:00', '21:30'];
  const today = new Date();

  let flightSeq = 100;
  for (const origin of AIRPORTS) {
    for (const dest of AIRPORTS) {
      if (origin.code === dest.code) continue;
      const durationMin = 90 + (Math.abs(hashPrice(origin.code, dest.code, '', 0)) % 300);
      for (let d = 0; d < 30; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() + d);
        const dateStr = date.toISOString().slice(0, 10);
        const depTime = departureTimes[flightSeq % departureTimes.length];
        const [dh, dm] = depTime.split(':').map(Number);
        const arrMins = dh * 60 + dm + durationMin;
        const arrTime = `${String(Math.floor(arrMins / 60) % 24).padStart(2, '0')}:${String(arrMins % 60).padStart(2, '0')}`;
        const price = hashPrice(origin.code, dest.code, dateStr, flightSeq);
        insert.run(
          `AA${flightSeq}`,
          origin.code, origin.city,
          dest.code, dest.city,
          dateStr,
          depTime, arrTime,
          durationMin,
          price,
          10 + (flightSeq % 40)
        );
        flightSeq++;
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = new Database(DB_PATH);
  seedDatabase(db);
  console.log('Flight database seeded.');
  db.close();
}
