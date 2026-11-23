const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve index.html
app.use(express.static(path.join(__dirname)));

// Connect to SQLite DB
const db = new sqlite3.Database("./timetable.db");

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teachers (
    teacher_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS classes (
    class_id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_time TEXT NOT NULL,
    is_booked INTEGER DEFAULT 0,
    teacher_id INTEGER,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
  )`);
});

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Add teacher
app.post("/teachers/add", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Teacher name required" });

  db.run("INSERT INTO teachers (name) VALUES (?)", [name], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ teacher_id: this.lastID, name });
  });
});

// Add class
app.post("/classes/add", (req, res) => {
  const { slot_time } = req.body;
  if (!slot_time) return res.status(400).json({ error: "Slot time required" });

  db.run("INSERT INTO classes (slot_time) VALUES (?)", [slot_time], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ class_id: this.lastID, slot_time });
  });
});

// Get free classes
app.get("/classes/free", (req, res) => {
  db.all("SELECT * FROM classes WHERE is_booked = 0", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get count of free classes
app.get("/classes/free/count", (req, res) => {
  db.get("SELECT COUNT(*) as count FROM classes WHERE is_booked = 0", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ free_classes: row.count });
  });
});

// Book a class
app.post("/classes/book", (req, res) => {
  const { class_id, teacher_id } = req.body;
  if (!class_id || !teacher_id)
    return res.status(400).json({ error: "class_id and teacher_id required" });

  db.run(
    "UPDATE classes SET is_booked = 1, teacher_id = ? WHERE class_id = ? AND is_booked = 0",
    [teacher_id, class_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(400).json({ error: "Class already booked or invalid" });
      res.json({ success: true, class_id, teacher_id });
    }
  );
});

// Optional: view all classes with teacher names
app.get("/classes/all", (req, res) => {
  const sql = `
    SELECT c.class_id, c.slot_time, c.is_booked, t.name AS teacher_name
    FROM classes c
    LEFT JOIN teachers t ON c.teacher_id = t.teacher_id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
