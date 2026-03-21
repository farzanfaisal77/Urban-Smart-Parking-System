require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL || 'mysql://user:pass@localhost:3306/parking',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDB() {
    try {
        console.log("Connecting to MySQL Database...");
        
        // 1. Users Table
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'driver',
            phone VARCHAR(50),
            due_fees DECIMAL(10,2) DEFAULT 0.00
        )`);
        
        // Add due_fees column if it doesn't exist (migration)
        try { await pool.query("ALTER TABLE users ADD COLUMN due_fees DECIMAL(10,2) DEFAULT 0.00"); } catch(e) {}

        // 2. Vehicles Table
        await pool.query(`CREATE TABLE IF NOT EXISTS vehicles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            license_plate VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL,
            make_model VARCHAR(255),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // 3. Parking Lots Table
        await pool.query(`CREATE TABLE IF NOT EXISTS parking_lots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            address VARCHAR(255),
            total_slots INT NOT NULL,
            price_per_hour DECIMAL(10,2) DEFAULT 0.00
        )`);

        // Add price_per_hour column if it doesn't exist (migration)
        try { await pool.query("ALTER TABLE parking_lots ADD COLUMN price_per_hour DECIMAL(10,2) DEFAULT 0.00"); } catch(e) {}

        // 4. Parking Slots Table
        await pool.query(`CREATE TABLE IF NOT EXISTS parking_slots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lot_id INT NOT NULL,
            slot_number VARCHAR(50) NOT NULL,
            slot_type VARCHAR(50) NOT NULL DEFAULT 'car',
            status VARCHAR(50) NOT NULL DEFAULT 'available',
            driver_id INT,
            vehicle_id INT,
            reserved_time VARCHAR(255),
            FOREIGN KEY (lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE,
            FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
        )`);

        // 5. Parking Sessions Table (Entry/Exit Tracking)
        await pool.query(`CREATE TABLE IF NOT EXISTS parking_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            vehicle_id INT NOT NULL,
            slot_id INT NOT NULL,
            entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            exit_time TIMESTAMP NULL,
            duration_hours INT DEFAULT NULL,
            fee_charged DECIMAL(10,2) DEFAULT NULL,
            status ENUM('active', 'completed') DEFAULT 'active',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
            FOREIGN KEY (slot_id) REFERENCES parking_slots(id) ON DELETE CASCADE
        )`);

        // Add fee_charged column if it doesn't exist (migration)
        try { await pool.query("ALTER TABLE parking_sessions ADD COLUMN fee_charged DECIMAL(10,2) DEFAULT NULL"); } catch(e) {}

        // Insert Admin User if it doesn't exist
        const [rows] = await pool.query("SELECT id FROM users WHERE username = ?", ["admin"]);
        if (rows.length === 0) {
            await pool.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ["admin", "admin123", "admin"]);
            console.log("Default admin created (admin / admin123)");
        }
        
        console.log("Connected to the MySQL database. Schema verified.");
    } catch (err) {
        console.error("MySQL Database connection/init error. Did you set DATABASE_URL? Error:", err.message);
    }
}

initDB();

module.exports = pool;
