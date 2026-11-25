const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Главная страница — reg.html. ЭТОТ БЛОК ДОЛЖЕН ИДТИ РАНЬШЕ express.static!
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "reg.html"));
});

// Статика — только ПОСЛЕ маршрута "/", и с флагом index: false
app.use(express.static(path.join(__dirname), { index: false }));

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "123Ejik123",
  database: "t_table"
});

// --- Инициализация таблиц при старте ---
async function initDB() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        email VARCHAR(191) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        is_teacher TINYINT(1) NOT NULL DEFAULT 0
      ) ENGINE=InnoDB;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(191) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS teachers (
        teacher_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL
      ) ENGINE=InnoDB;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS classes (
        class_id INT AUTO_INCREMENT PRIMARY KEY,
        slot_time VARCHAR(191) NOT NULL,
        is_booked TINYINT(1) NOT NULL DEFAULT 0,
        teacher_id INT DEFAULT NULL,
        FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Таблицы готовы');
  } catch (err) {
    console.error('❌ Ошибка инициализации БД:', err.message);
  }
}
initDB();

// --- Регистрация ---
app.post('/api/register', async (req, res) => {
  const { name, email, password, isTeacher } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Заполните все поля' });
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await db.execute(
      'INSERT INTO users (name, email, password, is_teacher) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, isTeacher ? 1 : 0]
    );
    res.json({ message: 'Регистрация успешна' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email уже занят' });
    console.error(error);
    res.status(400).json({ message: 'Ошибка регистрации' });
  }
});

// --- Вход ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Заполните поля' });
  const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  if (users.length === 0) return res.status(401).json({ message: 'Неверный email или пароль' });
  const isMatch = await bcrypt.compare(password, users[0].password);
  if (!isMatch) return res.status(401).json({ message: 'Неверный email или пароль' });
  const token = jwt.sign(
    { userId: users[0].id, name: users[0].name, isTeacher: users[0].is_teacher },
    'ваш_секретный_ключ',
    { expiresIn: '1h' }
  );
  res.json({
    token,
    user: {
      id: users[0].id,
      name: users[0].name,
      email: users[0].email,
      isTeacher: users[0].is_teacher
    }
  });
});

// --- Обратная связь ---
app.post('/api/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(403).json({ message: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, 'ваш_секретный_ключ');
    const { name, message } = req.body;
    await db.execute(
      'INSERT INTO feedback (user_id, name, message) VALUES (?, ?, ?)',
      [decoded.userId, name, message]
    );
    res.json({ message: 'Обратная связь отправлена' });
  } catch (error) {
    res.status(403).json({ message: 'Неверный токен' });
  }
});

// --- Добавить преподавателя ---
app.post("/api/teachers/add", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Teacher name required" });
  try {
    const [result] = await db.execute("INSERT INTO teachers (name) VALUES (?)", [name]);
    res.json({ teacher_id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Получить всех преподавателей ---
app.get("/api/teachers/all", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM teachers");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Добавить занятие ---
app.post("/api/classes/add", async (req, res) => {
  const { slot_time } = req.body;
  if (!slot_time) return res.status(400).json({ error: "Slot time required" });
  try {
    const [result] = await db.execute("INSERT INTO classes (slot_time, is_booked) VALUES (?, 0)", [slot_time]);
    res.json({ class_id: result.insertId, slot_time });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Получить свободные занятия ---
app.get("/api/classes/free", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM classes WHERE is_booked = 0");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Получить количество свободных занятий ---
app.get("/api/classes/free/count", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT COUNT(*) as count FROM classes WHERE is_booked = 0");
    res.json({ free_classes: rows[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Забронировать занятие ---
app.post("/api/classes/book", async (req, res) => {
  const { class_id, teacher_id } = req.body;
  if (!class_id || !teacher_id) return res.status(400).json({ error: "class_id and teacher_id required" });
  try {
    const [result] = await db.execute(
      "UPDATE classes SET is_booked = 1, teacher_id = ? WHERE class_id = ? AND is_booked = 0",
      [teacher_id, class_id]
    );
    if (result.affectedRows === 0) return res.status(400).json({ error: "Class already booked or invalid" });
    res.json({ success: true, class_id, teacher_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Все занятия с именами преподавателей ---
app.get("/api/classes/all", async (req, res) => {
  const sql = `
    SELECT c.class_id, c.slot_time, c.is_booked, t.name AS teacher_name
    FROM classes c
    LEFT JOIN teachers t ON c.teacher_id = t.teacher_id
  `;
  try {
    const [rows] = await db.execute(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));