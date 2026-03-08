const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../parking.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        db.serialize(() => {
            // 1. Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'driver',
                phone TEXT
            )`);

            // 2. Vehicles Table
            db.run(`CREATE TABLE IF NOT EXISTS vehicles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL,
                license_plate TEXT NOT NULL,
                type TEXT NOT NULL, -- 'car', 'bike', 'lorry'
                make_model TEXT,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            )`);

            // 3. Parking Lots Table
            db.run(`CREATE TABLE IF NOT EXISTS parking_lots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT,
                total_slots INTEGER NOT NULL
            )`);

            // 4. Parking Slots Table
            db.run(`CREATE TABLE IF NOT EXISTS parking_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lot_id INTEGER NOT NULL,
                slot_number TEXT NOT NULL,
                slot_type TEXT NOT NULL DEFAULT 'car', -- 'car', 'bike', 'lorry'
                status TEXT NOT NULL DEFAULT 'available', -- 'available', 'occupied', 'reserved'
                driver_id INTEGER,
                vehicle_id INTEGER,
                reserved_time TEXT, -- Stores ISO time if reserved for later
                FOREIGN KEY (lot_id) REFERENCES parking_lots(id),
                FOREIGN KEY (driver_id) REFERENCES users(id),
                FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            )`);

            // Insert default Admin user if not exists
            db.get("SELECT id FROM users WHERE username = ?", ["admin"], (err, row) => {
                if (!row) {
                    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
                        ["admin", "admin123", "admin"], 
                        function(err) {
                            if (err) console.error("Could not insert admin user", err.message);
                            else console.log("Default admin created (admin / admin123)");
                        }
                    );
                }
            });
        });
    }
});

module.exports = db;
