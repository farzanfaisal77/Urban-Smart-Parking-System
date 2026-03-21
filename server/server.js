const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

// --- AUTHENTICATION API ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query("SELECT id, username, role, phone FROM users WHERE username = ? AND password = ?", [username, password]);
        if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
        res.json({ success: true, user: rows[0] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [result] = await db.query("INSERT INTO users (username, password, role) VALUES (?, ?, 'driver')", [username, password]);
        res.json({ success: true, message: "Account created successfully. You can now login.", user_id: result.insertId });
    } catch(err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Username already exists" });
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/user/phone', async (req, res) => {
    const { user_id, phone } = req.body;
    try {
        await db.query("UPDATE users SET phone = ? WHERE id = ?", [phone, user_id]);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});


// --- ADMIN API ---
app.get('/api/admin/users', async (req, res) => {
    const sql = `
        SELECT u.id, u.username, u.phone, u.due_fees, 
               COALESCE(
                   JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'id', v.id,
                           'license_plate', v.license_plate, 
                           'make_model', v.make_model, 
                           'type', v.type,
                           'parked_slot', s.slot_number,
                           'parked_lot', l.name,
                           'entry_time', ps.entry_time
                       )
                   ), '[]'
               ) as vehicles
        FROM users u
        LEFT JOIN vehicles v ON u.id = v.owner_id
        LEFT JOIN parking_sessions ps ON v.id = ps.vehicle_id AND ps.status = 'active'
        LEFT JOIN parking_slots s ON ps.slot_id = s.id
        LEFT JOIN parking_lots l ON s.lot_id = l.id
        WHERE u.role = 'driver'
        GROUP BY u.id
    `;
    try {
        const [rows] = await db.query(sql);
        const parsed = rows.map(r => {
            // Unpack JSON string or array safely if using MySQL driver stringify
            let parsedVehicles = typeof r.vehicles === 'string' ? JSON.parse(r.vehicles) : r.vehicles;
            if(!Array.isArray(parsedVehicles)) parsedVehicles = [parsedVehicles];
            
            return {
                ...r,
                vehicles: parsedVehicles.filter(v => v !== null && v.license_plate)
            };
        });
        res.json(parsed);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/sessions', async (req, res) => {
    const sql = `
        SELECT ps.id, ps.entry_time, ps.exit_time, ps.status,
               u.username, u.phone,
               v.license_plate, v.type as vehicle_type,
               s.slot_number,
               l.name as lot_name,
               ps.duration_hours, ps.fee_charged
        FROM parking_sessions ps
        JOIN users u ON ps.user_id = u.id
        JOIN vehicles v ON ps.vehicle_id = v.id
        JOIN parking_slots s ON ps.slot_id = s.id
        JOIN parking_lots l ON s.lot_id = l.id
        ORDER BY ps.entry_time DESC
    `;
    try {
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    const userId = req.params.id;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Close any active sessions right now
        await conn.query("UPDATE parking_sessions SET exit_time = CURRENT_TIMESTAMP, status = 'completed' WHERE user_id = ? AND status = 'active'", [userId]);

        // Find all vehicles owned by this user
        const [vehicles] = await conn.query("SELECT id FROM vehicles WHERE owner_id = ?", [userId]);
        for (let v of vehicles) {
            // Free any slots occupied by these vehicles
            await conn.query("UPDATE parking_slots SET status = 'available', driver_id = NULL, vehicle_id = NULL, reserved_time = NULL WHERE vehicle_id = ?", [v.id]);
        }

        // The database schema automatically cascades vehicle deletion and session linkage when deleting a user, 
        // so we just cleanly wipe the user now.
        await conn.query("DELETE FROM users WHERE id = ?", [userId]);

        await conn.commit();
        res.json({ success: true, message: "User securely deleted." });
    } catch(err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/lots', async (req, res) => {
    let { name, address, total_slots, price_per_hour } = req.body;
    total_slots = parseInt(total_slots, 10);
    price_per_hour = parseFloat(price_per_hour) || 0.00;
    
    // Grab single connection for transaction safely
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query("INSERT INTO parking_lots (name, address, total_slots, price_per_hour) VALUES (?, ?, ?, ?)", [name, address, total_slots, price_per_hour]);
        const lotId = result.insertId;
        
        const insertions = [];
        for (let i = 1; i <= total_slots; i++) {
            insertions.push(conn.query("INSERT INTO parking_slots (lot_id, slot_number, slot_type) VALUES (?, ?, 'car')", [lotId, `A-${i}`]));
        }
        
        await Promise.all(insertions);
        await conn.commit();
        res.json({ success: true, message: "Lot and slots created successfully" });
    } catch(e) {
        await conn.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

app.delete('/api/lots/:id', async (req, res) => {
    const lotId = req.params.id;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM parking_slots WHERE lot_id = ?", [lotId]);
        await conn.query("DELETE FROM parking_lots WHERE id = ?", [lotId]);
        await conn.commit();
        res.json({ success: true, message: "Parking Lot structurally deleted." });
    } catch(e) {
        await conn.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

app.put('/api/slots/:slotId', async (req, res) => {
    const { slotId } = req.params;
    const { slot_type } = req.body;
    try {
        const [rows] = await db.query("SELECT status FROM parking_slots WHERE id = ?", [slotId]);
        if (rows.length === 0) return res.status(404).json({ error: "Slot not found" });
        if (rows[0].status !== 'available') return res.status(400).json({ error: "Cannot change type of an occupied or reserved slot." });
        
        await db.query("UPDATE parking_slots SET slot_type = ? WHERE id = ?", [slot_type, slotId]);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/slots/:slotId/status', async (req, res) => {
    const { slotId } = req.params;
    const { status } = req.body; 
    try {
        if (status === 'available') {
            const [sessionRows] = await db.query(`
                SELECT ps.id as session_id, ps.user_id, ps.entry_time, l.price_per_hour 
                FROM parking_sessions ps
                JOIN parking_slots s ON ps.slot_id = s.id
                JOIN parking_lots l ON s.lot_id = l.id
                WHERE ps.slot_id = ? AND ps.status = 'active'
            `, [slotId]);

            await db.query("UPDATE parking_slots SET status = 'available', driver_id = NULL, vehicle_id = NULL, reserved_time = NULL WHERE id = ?", [slotId]);
            await db.query("UPDATE parking_sessions SET exit_time = CURRENT_TIMESTAMP, status = 'completed' WHERE slot_id = ? AND status = 'active'", [slotId]);
            
            if (sessionRows.length > 0) {
                const { session_id, user_id, entry_time, price_per_hour } = sessionRows[0];
                const now = new Date();
                const entryDate = new Date(entry_time);
                let hours = Math.ceil((now - entryDate) / (1000 * 60 * 60));
                if (hours < 1 || isNaN(hours)) hours = 1;
                
                const fee = hours * parseFloat(price_per_hour || 0);
                if (fee > 0) {
                    await db.query("UPDATE users SET due_fees = due_fees + ? WHERE id = ?", [fee, user_id]);
                    await db.query("UPDATE parking_sessions SET fee_charged = ? WHERE id = ?", [fee, session_id]);
                }
            }

            res.json({ success: true, message: "Slot forcefully liberated." });
        } else {
            await db.query("UPDATE parking_slots SET status = ?, driver_id = NULL, vehicle_id = NULL WHERE id = ?", [status, slotId]);
            res.json({ success: true, message: `Slot forced to ${status}.` });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});


// --- VEHICLE API ---
app.get('/api/vehicles/:userId', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM vehicles WHERE owner_id = ?", [req.params.userId]);
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vehicles', async (req, res) => {
    const { owner_id, license_plate, type, make_model } = req.body;
    try {
        await db.query("INSERT INTO vehicles (owner_id, license_plate, type, make_model) VALUES (?, ?, ?, ?)", [owner_id, license_plate, type, make_model]);
        res.json({ success: true, message: "Vehicle added" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vehicles/:id', async (req, res) => {
    const vehicleId = req.params.id;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Check if the vehicle is currently parked anywhere
        const [slots] = await conn.query("SELECT id FROM parking_slots WHERE vehicle_id = ?", [vehicleId]);
        for (const slot of slots) {
            // Free the slot
            await conn.query("UPDATE parking_slots SET status = 'available', driver_id = NULL, vehicle_id = NULL, reserved_time = NULL WHERE id = ?", [slot.id]);
        }

        // Close any active sessions
        await conn.query("UPDATE parking_sessions SET exit_time = CURRENT_TIMESTAMP, status = 'completed' WHERE vehicle_id = ? AND status = 'active'", [vehicleId]);

        // Actually delete the vehicle
        await conn.query("DELETE FROM vehicles WHERE id = ?", [vehicleId]);

        await conn.commit();
        res.json({ success: true, message: "Vehicle deleted and related parking sessions closed." });
    } catch (e) {
        await conn.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});


// --- DRIVER API ---
app.get('/api/lots', async (req, res) => {
    const sql = `
        SELECT 
            l.id as lot_id, l.name, l.address, l.total_slots, l.price_per_hour,
            COUNT(s.id) as total,
            CAST(SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) AS UNSIGNED) as available_slots
        FROM parking_lots l
        LEFT JOIN parking_slots s ON l.id = s.lot_id
        GROUP BY l.id
    `;
    try {
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/lots/:id/slots', async (req, res) => {
    const lotId = req.params.id;
    try {
        const [rows] = await db.query("SELECT * FROM parking_slots WHERE lot_id = ?", [lotId]);
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reserve', async (req, res) => {
    const { slot_id, driver_id, vehicle_id, action_type, time, duration_hours } = req.body;
    
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [vRow] = await conn.query("SELECT type FROM vehicles WHERE id = ?", [vehicle_id]);
        if (vRow.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: "Vehicle not found" });
        }

        const [sRow] = await conn.query("SELECT status, slot_type FROM parking_slots WHERE id = ? FOR UPDATE", [slot_id]);
        if (sRow.length === 0 || sRow[0].status !== 'available') {
            await conn.rollback();
            return res.status(400).json({ error: "Slot not available" });
        }
        
        if (vRow[0].type !== sRow[0].slot_type) {
            await conn.rollback();
            return res.status(400).json({ error: `Cannot park a ${vRow[0].type} in a ${sRow[0].slot_type} slot.` });
        }
        
        let status = action_type === 'now' ? 'occupied' : 'reserved';
        let reserved_time = action_type === 'now' ? null : time;
        
        await conn.query("UPDATE parking_slots SET status = ?, driver_id = ?, vehicle_id = ?, reserved_time = ? WHERE id = ?", 
        [status, driver_id, vehicle_id, reserved_time, slot_id]);

        // Create a new active session
        await conn.query("INSERT INTO parking_sessions (user_id, vehicle_id, slot_id, duration_hours, status) VALUES (?, ?, ?, ?, 'active')", [driver_id, vehicle_id, slot_id, duration_hours || null]);
        
        await conn.commit();
        res.json({ success: true, message: "Slot secured successfully" });
    } catch(err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/release', async (req, res) => {
    const { slot_id } = req.body;
    
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [sessionRows] = await conn.query(`
            SELECT ps.id as session_id, ps.user_id, ps.entry_time, l.price_per_hour 
            FROM parking_sessions ps
            JOIN parking_slots s ON ps.slot_id = s.id
            JOIN parking_lots l ON s.lot_id = l.id
            WHERE ps.slot_id = ? AND ps.status = 'active'
        `, [slot_id]);

        await conn.query("UPDATE parking_slots SET status = 'available', driver_id = NULL, vehicle_id = NULL, reserved_time = NULL WHERE id = ?", [slot_id]);
        
        // Finalize the active session for this slot
        await conn.query("UPDATE parking_sessions SET exit_time = CURRENT_TIMESTAMP, status = 'completed' WHERE slot_id = ? AND status = 'active'", [slot_id]);

        if (sessionRows.length > 0) {
            const { session_id, user_id, entry_time, price_per_hour } = sessionRows[0];
            const now = new Date();
            const entryDate = new Date(entry_time);
            let hours = Math.ceil((now - entryDate) / (1000 * 60 * 60));
            if (hours < 1 || isNaN(hours)) hours = 1;
            
            const fee = hours * parseFloat(price_per_hour || 0);
            if (fee > 0) {
                await conn.query("UPDATE users SET due_fees = due_fees + ? WHERE id = ?", [fee, user_id]);
                await conn.query("UPDATE parking_sessions SET fee_charged = ? WHERE id = ?", [fee, session_id]);
            }
        }

        await conn.commit();
        res.json({ success: true, message: "Slot released successfully" });
    } catch(err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.get('/api/my-sessions/:userId', async (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT s.id as slot_id, s.slot_number, s.status, s.reserved_time, 
               l.name as lot_name, l.address,
               v.license_plate, v.make_model,
               ps.entry_time
        FROM parking_slots s
        JOIN parking_lots l ON s.lot_id = l.id
        LEFT JOIN vehicles v ON s.vehicle_id = v.id
        LEFT JOIN parking_sessions ps ON s.id = ps.slot_id AND ps.status = 'active'
        WHERE s.driver_id = ? AND s.status IN ('occupied', 'reserved')
    `;
    try {
        const [rows] = await db.query(sql, [userId]);
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:userId/dues', async (req, res) => {
    let { amount } = req.body;
    amount = parseFloat(amount);
    if (isNaN(amount)) amount = 0;
    
    try {
        await db.query("UPDATE users SET due_fees = ? WHERE id = ?", [amount, req.params.userId]);
        res.json({ success: true, message: "Dues updated successfully" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/dues/:userId', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT due_fees FROM users WHERE id = ?", [req.params.userId]);
        if (rows.length === 0) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, due_fees: rows[0].due_fees });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
