const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

// --- AUTHENTICATION API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT id, username, role, phone FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Invalid credentials" });
        res.json({ success: true, user: row });
    });
});

app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, 'driver')", [username, password], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "Username already exists" });
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: "Account created successfully. You can now login.", user_id: this.lastID });
    });
});

app.post('/api/user/phone', (req, res) => {
    const { user_id, phone } = req.body;
    db.run("UPDATE users SET phone = ? WHERE id = ?", [phone, user_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


// --- ADMIN API ---
app.get('/api/admin/users', (req, res) => {
    const sql = `
        SELECT u.id, u.username, u.phone, 
               json_group_array(
                   json_object('license_plate', v.license_plate, 'make_model', v.make_model, 'type', v.type)
               ) as vehicles
        FROM users u
        LEFT JOIN vehicles v ON u.id = v.owner_id
        WHERE u.role = 'driver'
        GROUP BY u.id
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            vehicles: JSON.parse(r.vehicles).filter(v => v.license_plate !== null)
        }));
        res.json(parsed);
    });
});

app.post('/api/lots', (req, res) => {
    let { name, address, total_slots } = req.body;
    total_slots = parseInt(total_slots, 10);
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("INSERT INTO parking_lots (name, address, total_slots) VALUES (?, ?, ?)", 
        [name, address, total_slots], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            
            const lotId = this.lastID;
            const stmt = db.prepare("INSERT INTO parking_slots (lot_id, slot_number, slot_type) VALUES (?, ?, 'car')");
            
            // Collect all insertions into an array of Promises so we don't return res.json early.
            const insertions = [];
            for (let i = 1; i <= total_slots; i++) {
                insertions.push(new Promise((resolve, reject) => {
                    stmt.run(lotId, `A-${i}`, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                }));
            }
            
            Promise.all(insertions).then(() => {
                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: "Lot and slots created successfully" });
                });
            }).catch(e => {
                stmt.finalize();
                db.run("ROLLBACK");
                res.status(500).json({ error: e.message });
            });
        });
    });
});

app.delete('/api/lots/:id', (req, res) => {
    const lotId = req.params.id;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        // Delete all slots inside first
        db.run("DELETE FROM parking_slots WHERE lot_id = ?", [lotId], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            // Now delete the lot itself
            db.run("DELETE FROM parking_lots WHERE id = ?", [lotId], function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }
                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: "Parking Lot structurally deleted." });
                });
            });
        });
    });
});

app.put('/api/slots/:slotId', (req, res) => {
    const { slotId } = req.params;
    const { slot_type } = req.body;
    
    db.get("SELECT status FROM parking_slots WHERE id = ?", [slotId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Slot not found" });
        if (row.status !== 'available') return res.status(400).json({ error: "Cannot change type of an occupied or reserved slot." });
        
        db.run("UPDATE parking_slots SET slot_type = ? WHERE id = ?", [slot_type, slotId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.put('/api/admin/slots/:slotId/status', (req, res) => {
    const { slotId } = req.params;
    const { status } = req.body; // 'available', 'occupied', 'reserved'
    
    // If Admin forces to available, we MUST nullify foreign constraints automatically
    if (status === 'available') {
        db.run("UPDATE parking_slots SET status = 'available', driver_id = NULL, vehicle_id = NULL, reserved_time = NULL WHERE id = ?", 
        [slotId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "Slot forcefully liberated." });
        });
    } else {
        // Force to occupied or reserved, no specific driver attached automatically
        db.run("UPDATE parking_slots SET status = ?, driver_id = NULL, vehicle_id = NULL WHERE id = ?", 
        [status, slotId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: `Slot forced to ${status}.` });
        });
    }
});


// --- VEHICLE API ---
app.get('/api/vehicles/:userId', (req, res) => {
    db.all("SELECT * FROM vehicles WHERE owner_id = ?", [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/vehicles', (req, res) => {
    const { owner_id, license_plate, type, make_model } = req.body;
    db.run("INSERT INTO vehicles (owner_id, license_plate, type, make_model) VALUES (?, ?, ?, ?)", 
    [owner_id, license_plate, type, make_model], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Vehicle added" });
    });
});


// --- DRIVER API ---
app.get('/api/lots', (req, res) => {
    // Fixed bug: left join to not duplicate counting
    const sql = `
        SELECT 
            l.id as lot_id, l.name, l.address, l.total_slots,
            COUNT(s.id) as total,
            SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) as available_slots
        FROM parking_lots l
        LEFT JOIN parking_slots s ON l.id = s.lot_id
        GROUP BY l.id
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/lots/:id/slots', (req, res) => {
    const lotId = req.params.id;
    db.all("SELECT * FROM parking_slots WHERE lot_id = ?", [lotId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/reserve', (req, res) => {
    const { slot_id, driver_id, vehicle_id, action_type, time } = req.body;
    
    // First, verify slot type matches vehicle type
    db.get("SELECT type FROM vehicles WHERE id = ?", [vehicle_id], (err, vRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!vRow) return res.status(400).json({ error: "Vehicle not found" });

        db.get("SELECT status, slot_type FROM parking_slots WHERE id = ?", [slot_id], (err, sRow) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!sRow || sRow.status !== 'available') return res.status(400).json({ error: "Slot not available" });
            
            if (vRow.type !== sRow.slot_type) {
                return res.status(400).json({ error: `Cannot park a ${vRow.type} in a ${sRow.slot_type} slot.` });
            }
            
            // Execute Reservation
            let status = action_type === 'now' ? 'occupied' : 'reserved';
            let reserved_time = action_type === 'now' ? null : time;
            
            db.run("UPDATE parking_slots SET status = ?, driver_id = ?, vehicle_id = ?, reserved_time = ? WHERE id = ?", 
            [status, driver_id, vehicle_id, reserved_time, slot_id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: "Slot secured successfully" });
            });
        });
    });
});

app.post('/api/release', (req, res) => {
    const { slot_id } = req.body;
    db.run("UPDATE parking_slots SET status = 'available', driver_id = NULL, vehicle_id = NULL, reserved_time = NULL WHERE id = ?", [slot_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Slot released successfully" });
    });
});

app.get('/api/my-sessions/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT s.id as slot_id, s.slot_number, s.status, s.reserved_time, 
               l.name as lot_name, l.address,
               v.license_plate, v.make_model
        FROM parking_slots s
        JOIN parking_lots l ON s.lot_id = l.id
        LEFT JOIN vehicles v ON s.vehicle_id = v.id
        WHERE s.driver_id = ? AND s.status IN ('occupied', 'reserved')
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
