const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const bcrypt =  require ("bcrypt");
const jwt = require("jsonwebtoken");
const mysql= require("mysql2/promise")

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve index.html
app.use(express.static(path.join(__dirname)));

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "reg.html"));
});
const db = mysql.createPool({
  host:"localhost",
  user:"root",
  password:"1111",
  database:"t_table"
})
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        await db.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
        res.json({ message: 'Регистрация успешна' });
    } catch (error) {
        res.status(400).json({ message: 'Ошибка регистрации' });
    }
});
// Вход
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ message: 'Неверный email или пароль' });
    const isMatch = await bcrypt.compare(password, users[0].password);
    if (!isMatch) return res.status(401).json({ message: 'Неверный email или пароль' });
    const token = jwt.sign({ userId: users[0].id, name: users[0].name }, 'ваш_секретный_ключ', { expiresIn: '1h' });
    res.json({ token, user: { id: users[0].id, name: users[0].name, email: users[0].email } });
});
// Обратная связь
app.post('/api/feedback', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Нет токена' });
    try {
        const decoded = jwt.verify(token, 'ваш_секретный_ключ');
        const { name, message } = req.body;
        await db.execute('INSERT INTO feedback (user_id, name, message) VALUES (?, ?, ?)', [decoded.userId, name, message]);
        res.json({ message: 'Обратная связь отправлена' });
    } catch (error) {
        res.status(403).json({ message: 'Неверный токен' });
    }
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

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
