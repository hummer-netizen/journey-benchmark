import express from 'express';
import Database from 'better-sqlite3';
import { createTransport } from 'nodemailer';
import { randomBytes, createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3334;
const DB_PATH = process.env.DB_PATH || join(__dirname, '../auth.db');
const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const mailer = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  ignoreTLS: true,
});

function hashPassword(password) {
  return createHash('sha256').update(password + 'salt_benchmark').digest('hex');
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function html(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - AuthDemo</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; padding: 0 20px; }
    h1 { color: #2d3748; }
    .nav { background: #2d3748; padding: 10px 20px; margin: -60px -20px 40px; display: flex; justify-content: space-between; align-items: center; }
    .nav a { color: white; text-decoration: none; }
    form { background: #f7fafc; padding: 20px; border-radius: 8px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; color: #4a5568; }
    input { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0; border-radius: 4px; box-sizing: border-box; }
    button { background: #4299e1; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
    button:hover { background: #3182ce; }
    .success { background: #c6f6d5; border: 1px solid #9ae6b4; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    .error { background: #fed7d7; border: 1px solid #fc8181; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    .info { background: #bee3f8; border: 1px solid #90cdf4; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    .links { text-align: center; margin-top: 15px; }
    .links a { color: #4299e1; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/"><strong>AuthDemo</strong></a>
    <div><a href="/login">Login</a> &nbsp; <a href="/register">Register</a></div>
  </div>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

// Homepage
app.get('/', (req, res) => {
  res.send(html('Welcome', `
    <p>This is a demo authentication app for testing email verification and password reset flows.</p>
    <div style="display:flex;gap:10px;margin-top:20px">
      <a href="/register" style="flex:1;text-align:center;padding:15px;background:#4299e1;color:white;text-decoration:none;border-radius:8px">Register</a>
      <a href="/login" style="flex:1;text-align:center;padding:15px;background:#48bb78;color:white;text-decoration:none;border-radius:8px">Login</a>
    </div>
  `));
});

// Register form
app.get('/register', (req, res) => {
  const { error, email, name } = req.query;
  const errorHtml = error ? `<div class="error">${decodeURIComponent(String(error))}</div>` : '';
  res.send(html('Create Account', `
    ${errorHtml}
    <form action="/register" method="POST">
      <label for="name">Full Name</label>
      <input type="text" name="name" id="name" value="${name || ''}" placeholder="Jane Doe" required>
      <label for="email">Email Address</label>
      <input type="email" name="email" id="email" value="${email || ''}" placeholder="jane@example.com" required>
      <label for="password">Password</label>
      <input type="password" name="password" id="password" placeholder="Min 8 characters" required minlength="8">
      <button type="submit" id="register-btn">Create Account</button>
    </form>
    <div class="links"><a href="/login">Already have an account? Login</a></div>
  `));
});

// Process registration
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.redirect(`/register?error=${encodeURIComponent('All fields required, password min 8 chars')}&email=${encodeURIComponent(email || '')}&name=${encodeURIComponent(name || '')}`);
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.redirect(`/register?error=${encodeURIComponent('Email already registered')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
  }
  const hash = hashPassword(password);
  const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
  const userId = result.lastInsertRowid;
  const token = generateToken();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)').run(userId, token, 'verify', expires);

  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
  try {
    await mailer.sendMail({
      from: 'noreply@authdemo.local',
      to: email,
      subject: 'Verify your email address',
      text: `Hello ${name},\n\nPlease verify your email:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Hello ${name},</p><p>Please verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }

  res.send(html('Check Your Email', `
    <div class="success">
      <strong>Registration successful!</strong><br>
      We've sent a verification email to <strong>${email}</strong>.<br>
      Please check your inbox and click the verification link.
    </div>
    <div class="info">
      <strong>For testing:</strong> Check MailPit at <a href="http://localhost:8025">localhost:8025</a>
    </div>
  `));
});

// Verify email
app.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');
  const record = db.prepare(`
    SELECT t.*, u.email, u.name FROM tokens t JOIN users u ON t.user_id = u.id
    WHERE t.token = ? AND t.type = 'verify' AND t.used = 0 AND t.expires_at > datetime('now')
  `).get(token);
  if (!record) {
    return res.send(html('Verification Failed', '<div class="error">Invalid or expired verification link.</div>'));
  }
  db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(record.user_id);
  db.prepare('UPDATE tokens SET used = 1 WHERE id = ?').run(record.id);
  res.send(html('Email Verified!', `
    <div class="success">
      <strong>✅ Email verified!</strong><br>
      Your account for <strong>${record.email}</strong> is now active.
    </div>
    <p><a href="/login">Login now →</a></p>
  `));
});

// Login form
app.get('/login', (req, res) => {
  const { error, email, success } = req.query;
  const errorHtml = error ? `<div class="error">${decodeURIComponent(String(error))}</div>` : '';
  const successHtml = success ? `<div class="success">${decodeURIComponent(String(success))}</div>` : '';
  res.send(html('Login', `
    ${errorHtml}${successHtml}
    <form action="/login" method="POST">
      <label for="email">Email Address</label>
      <input type="email" name="email" id="email" value="${email || ''}" placeholder="jane@example.com" required>
      <label for="password">Password</label>
      <input type="password" name="password" id="password" placeholder="Your password" required>
      <button type="submit" id="login-btn">Login</button>
    </form>
    <div class="links">
      <a href="/forgot-password">Forgot password?</a> &nbsp;·&nbsp; <a href="/register">Create account</a>
    </div>
  `));
});

// Process login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}&email=${encodeURIComponent(email || '')}`);
  }
  if (!user.verified) {
    return res.redirect(`/login?error=${encodeURIComponent('Please verify your email before logging in')}&email=${encodeURIComponent(email)}`);
  }
  res.send(html('Welcome Back!', `
    <div class="success" id="login-success">
      <strong>✅ Login successful!</strong><br>
      Welcome back, <strong>${user.name}</strong>!
    </div>
    <p><a href="/">Go to homepage</a></p>
  `));
});

// Forgot password form
app.get('/forgot-password', (req, res) => {
  const { error, success } = req.query;
  const errorHtml = error ? `<div class="error">${decodeURIComponent(String(error))}</div>` : '';
  const successHtml = success ? `<div class="success">${decodeURIComponent(String(success))}</div>` : '';
  res.send(html('Forgot Password', `
    ${errorHtml}${successHtml}
    <form action="/forgot-password" method="POST">
      <label for="email">Email Address</label>
      <input type="email" name="email" id="email" placeholder="jane@example.com" required>
      <button type="submit" id="reset-request-btn">Send Reset Link</button>
    </form>
    <div class="links"><a href="/login">Back to login</a></div>
  `));
});

// Process forgot password
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user) {
    const token = generateToken();
    const expires = new Date(Date.now() + 3600 * 1000).toISOString();
    db.prepare('INSERT INTO tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)').run(user.id, token, 'reset', expires);
    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    try {
      await mailer.sendMail({
        from: 'noreply@authdemo.local',
        to: email,
        subject: 'Reset your password',
        text: `Hello ${user.name},\n\nReset your password:\n${resetUrl}\n\nThis link expires in 1 hour.`,
        html: `<p>Hello ${user.name},</p><p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
      });
    } catch (err) {
      console.error('Email send error:', err.message);
    }
  }
  res.send(html('Check Your Email', `
    <div class="success">
      If that email is registered, we've sent a password reset link.<br>
      Please check your inbox.
    </div>
    <div class="info">
      <strong>For testing:</strong> Check MailPit at <a href="http://localhost:8025">localhost:8025</a>
    </div>
  `));
});

// Reset password form
app.get('/reset-password', (req, res) => {
  const { token, error } = req.query;
  if (!token) return res.redirect('/forgot-password');
  const record = db.prepare(`
    SELECT t.*, u.email FROM tokens t JOIN users u ON t.user_id = u.id
    WHERE t.token = ? AND t.type = 'reset' AND t.used = 0 AND t.expires_at > datetime('now')
  `).get(token);
  if (!record) {
    return res.send(html('Link Expired', '<div class="error">Invalid or expired password reset link.</div>'));
  }
  const errorHtml = error ? `<div class="error">${decodeURIComponent(String(error))}</div>` : '';
  res.send(html('Reset Password', `
    ${errorHtml}
    <form action="/reset-password" method="POST">
      <input type="hidden" name="token" value="${token}">
      <label for="password">New Password</label>
      <input type="password" name="password" id="password" placeholder="Min 8 characters" required minlength="8">
      <label for="confirm_password">Confirm Password</label>
      <input type="password" name="confirm_password" id="confirm_password" placeholder="Repeat password" required minlength="8">
      <button type="submit" id="reset-password-btn">Set New Password</button>
    </form>
  `));
});

// Process password reset
app.post('/reset-password', (req, res) => {
  const { token, password, confirm_password } = req.body;
  if (!token || !password || password !== confirm_password || password.length < 8) {
    return res.redirect(`/reset-password?token=${encodeURIComponent(token || '')}&error=${encodeURIComponent('Passwords must match and be at least 8 characters')}`);
  }
  const record = db.prepare(`
    SELECT t.*, u.email FROM tokens t JOIN users u ON t.user_id = u.id
    WHERE t.token = ? AND t.type = 'reset' AND t.used = 0 AND t.expires_at > datetime('now')
  `).get(token);
  if (!record) {
    return res.send(html('Link Expired', '<div class="error">Invalid or expired password reset link.</div>'));
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), record.user_id);
  db.prepare('UPDATE tokens SET used = 1 WHERE id = ?').run(record.id);
  res.redirect(`/login?success=${encodeURIComponent('Password reset successful! Please login with your new password.')}`);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-app' }));

app.listen(PORT, () => {
  console.log(`Auth app running on http://localhost:${PORT}`);
});

export { db };
