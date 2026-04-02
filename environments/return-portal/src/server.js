import express from 'express';
import { randomBytes } from 'crypto';

const PORT = process.env.PORT || 3336;

// In-memory session store
const sessions = new Map();

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

function getSession(req, res) {
  req.cookies = req.cookies || parseCookies(req);
  let sid = req.cookies['ret_sid'];
  if (!sid || !sessions.has(sid)) {
    sid = randomBytes(16).toString('hex');
    sessions.set(sid, {});
    res.setHeader('Set-Cookie', `ret_sid=${sid}; Path=/; HttpOnly`);
  }
  return { sid, data: sessions.get(sid) };
}

// Pre-seeded users
const USERS = [
  { id: 1, email: 'alice@example.com', password: 'password123', name: 'Alice Johnson' },
  { id: 2, email: 'bob@example.com', password: 'password123', name: 'Bob Smith' },
];

// Pre-seeded orders — some eligible (< 30 days old), some not
const now = Date.now();
const ORDERS = [
  {
    id: 'ORD-10021', userId: 1, product: 'Wireless Headphones', price: 89.99,
    date: new Date(now - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: 'delivered', eligible: true, ineligibleReason: null,
  },
  {
    id: 'ORD-10022', userId: 1, product: 'USB-C Hub (6-port)', price: 45.00,
    date: new Date(now - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: 'delivered', eligible: false, ineligibleReason: 'Return window (30 days) has expired.',
  },
  {
    id: 'ORD-10023', userId: 1, product: 'Mechanical Keyboard', price: 129.99,
    date: new Date(now - 12 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: 'delivered', eligible: true, ineligibleReason: null,
  },
  {
    id: 'ORD-10024', userId: 2, product: 'Laptop Stand', price: 35.50,
    date: new Date(now - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: 'delivered', eligible: true, ineligibleReason: null,
  },
  {
    id: 'ORD-10025', userId: 2, product: 'Monitor (27")', price: 399.00,
    date: new Date(now - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: 'delivered', eligible: false, ineligibleReason: 'Non-returnable item: monitors over 21" are final sale.',
  },
];

// Track return requests in memory
const returnRequests = new Map();

function getOrder(orderId) {
  return ORDERS.find(o => o.id === orderId);
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, _res, next) => { req.cookies = parseCookies(req); next(); });

function html(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - ReturnPortal</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #1a3c6e; }
    .nav { background: #1a3c6e; padding: 10px 20px; margin: -40px -20px 40px; display: flex; justify-content: space-between; align-items: center; }
    .nav a { color: white; text-decoration: none; }
    form { background: #f5f7fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    label { display: block; margin-bottom: 4px; font-weight: bold; }
    input, select, textarea { width: 100%; padding: 8px; margin-bottom: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { background: #1a3c6e; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #2a5ca0; }
    .error { background: #fde8e8; border: 1px solid #f5c6c6; border-radius: 6px; padding: 12px; margin-bottom: 16px; color: #c00; }
    .success { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 20px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 16px; }
    .order-card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .order-info { flex: 1; }
    .order-id { font-weight: bold; color: #1a3c6e; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
    .badge-eligible { background: #d4edda; color: #276749; }
    .badge-ineligible { background: #fde8e8; color: #c00; }
    .label-box { background: #f0f4ff; border: 2px solid #1a3c6e; border-radius: 8px; padding: 20px; font-family: monospace; }
    .ref-number { font-size: 1.4em; font-weight: bold; letter-spacing: 2px; color: #1a3c6e; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/" style="font-weight:bold;font-size:1.1em">ReturnPortal</a>
    <div id="nav-user"></div>
  </div>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

// Homepage — redirect to login or orders
app.get('/', (req, res) => {
  const { data } = getSession(req, res);
  if (data.userId) return res.redirect('/orders');
  res.redirect('/login');
});

// Login page
app.get('/login', (req, res) => {
  const { data } = getSession(req, res);
  if (data.userId) return res.redirect('/orders');
  const { error = '' } = req.query;
  const errorHtml = error ? `<div class="error">${decodeURIComponent(String(error))}</div>` : '';
  res.send(html('Sign In', `
    ${errorHtml}
    <form action="/login" method="POST" id="login-form">
      <label for="email">Email Address</label>
      <input type="email" name="email" id="email" required placeholder="alice@example.com">
      <label for="password">Password</label>
      <input type="password" name="password" id="password" required>
      <button type="submit" id="login-btn">Sign In</button>
    </form>
    <p style="color:#666;font-size:0.9em">Test accounts: alice@example.com / bob@example.com (password: password123)</p>
  `));
});

app.post('/login', (req, res) => {
  const { data } = getSession(req, res);
  const { email, password } = req.body;
  const user = USERS.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}`);
  }
  data.userId = user.id;
  data.userName = user.name;
  res.redirect('/orders');
});

app.get('/logout', (req, res) => {
  const { data } = getSession(req, res);
  delete data.userId;
  delete data.userName;
  res.redirect('/login');
});

// Order history
app.get('/orders', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const userOrders = ORDERS.filter(o => o.userId === data.userId);
  const orderCards = userOrders.map(o => `
    <div class="order-card" id="order-${o.id}">
      <div class="order-info">
        <div class="order-id">${o.id}</div>
        <div>${o.product}</div>
        <div style="color:#666;font-size:0.9em">Ordered: ${o.date} · $${o.price.toFixed(2)}</div>
        <div style="margin-top:6px">
          <span class="badge ${o.eligible ? 'badge-eligible' : 'badge-ineligible'}">
            ${o.eligible ? '✓ Return eligible' : '✗ Not eligible'}
          </span>
        </div>
      </div>
      <div>
        <a href="/orders/${o.id}/return" style="background:#1a3c6e;color:white;padding:8px 16px;border-radius:4px;text-decoration:none;display:inline-block" id="return-btn-${o.id}">
          Return / Refund
        </a>
      </div>
    </div>
  `).join('');
  res.send(html('My Orders', `
    <p>Welcome back, <strong>${data.userName}</strong>. <a href="/logout" style="color:#999;font-size:0.9em">Sign out</a></p>
    <p>Select an order below to start a return or refund request.</p>
    ${orderCards || '<p>No orders found.</p>'}
  `));
});

// Return flow — initiate
app.get('/orders/:id/return', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const order = getOrder(req.params.id);
  if (!order || order.userId !== data.userId) {
    return res.status(404).send(html('Not Found', '<p>Order not found.</p>'));
  }
  const { error = '' } = req.query;
  const errorHtml = error ? `<div class="error">${decodeURIComponent(String(error))}</div>` : '';
  res.send(html(`Return Request — ${order.id}`, `
    ${errorHtml}
    <div class="order-card">
      <div class="order-info">
        <div class="order-id">${order.id}</div>
        <div>${order.product}</div>
        <div style="color:#666">Ordered: ${order.date} · $${order.price.toFixed(2)}</div>
      </div>
    </div>
    <form action="/orders/${order.id}/return" method="POST" id="return-form">
      <label for="return_reason">Reason for Return *</label>
      <select name="return_reason" id="return_reason" required>
        <option value="">— Select reason —</option>
        <option value="defective">Item is defective / damaged</option>
        <option value="wrong_item">Wrong item received</option>
        <option value="not_as_described">Not as described</option>
        <option value="changed_mind">Changed my mind</option>
        <option value="other">Other</option>
      </select>
      <label for="return_notes">Additional Notes (optional)</label>
      <textarea name="return_notes" id="return_notes" rows="3" placeholder="Please describe the issue..."></textarea>
      <label for="return_method">Preferred Refund Method *</label>
      <select name="return_method" id="return_method" required>
        <option value="">— Select method —</option>
        <option value="original">Original payment method</option>
        <option value="store_credit">Store credit</option>
        <option value="bank_transfer">Bank transfer</option>
      </select>
      <div style="display:flex;gap:10px;margin-top:10px">
        <a href="/orders" style="flex:1;text-align:center;padding:10px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#333">← Back to Orders</a>
        <button type="submit" id="check-eligibility-btn" style="flex:2">Check Eligibility</button>
      </div>
    </form>
  `));
});

app.post('/orders/:id/return', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const order = getOrder(req.params.id);
  if (!order || order.userId !== data.userId) {
    return res.status(404).send(html('Not Found', '<p>Order not found.</p>'));
  }
  const { return_reason, return_method } = req.body;
  if (!return_reason || !return_method) {
    return res.redirect(`/orders/${order.id}/return?error=${encodeURIComponent('Please fill in all required fields')}`);
  }
  // Store return request data in session
  data.returnRequest = { orderId: order.id, return_reason, return_method, return_notes: req.body.return_notes };
  if (order.eligible) {
    res.redirect(`/orders/${order.id}/return/eligible`);
  } else {
    res.redirect(`/orders/${order.id}/return/ineligible`);
  }
});

// Ineligible page
app.get('/orders/:id/return/ineligible', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const order = getOrder(req.params.id);
  if (!order || order.userId !== data.userId) return res.redirect('/orders');
  res.send(html('Return Not Eligible', `
    <div class="warning" id="ineligible-message">
      <h2>⚠ Return Request Cannot Be Processed</h2>
      <p><strong>Order:</strong> ${order.id} — ${order.product}</p>
      <p><strong>Reason:</strong> ${order.ineligibleReason || 'This order is not eligible for return.'}</p>
    </div>
    <p>If you believe this is an error, please contact our support team.</p>
    <a href="/orders" style="color:#1a3c6e">← Return to My Orders</a>
  `));
});

// Eligible — show return label
app.get('/orders/:id/return/eligible', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const order = getOrder(req.params.id);
  if (!order || order.userId !== data.userId) return res.redirect('/orders');
  const rr = data.returnRequest;
  if (!rr || rr.orderId !== order.id) return res.redirect(`/orders/${order.id}/return`);
  // Generate a return label number
  const labelRef = `RTN-${order.id}-${randomBytes(3).toString('hex').toUpperCase()}`;
  data.returnRequest.labelRef = labelRef;
  res.send(html('Return Approved — Print Label', `
    <div class="success" id="eligibility-approved">
      <h2>✅ Return Request Approved!</h2>
      <p>Your return for <strong>${order.product}</strong> has been approved.</p>
    </div>
    <div class="label-box" id="return-label" style="margin:20px 0">
      <div style="font-size:0.8em;color:#666;margin-bottom:8px">RETURN SHIPPING LABEL</div>
      <div class="ref-number">${labelRef}</div>
      <div style="margin-top:8px;font-size:0.9em">
        <div>From: ${data.userName}</div>
        <div>To: Returns Centre, 100 Warehouse Rd, Industrial Park</div>
        <div>Item: ${order.product}</div>
        <div>Order: ${order.id}</div>
        <div>Refund method: ${rr.return_method?.replace('_', ' ')}</div>
      </div>
    </div>
    <p>Print or save this label and attach it to your return package. Drop it off at any postal location.</p>
    <form action="/orders/${order.id}/return/confirm" method="POST" id="confirm-return-form">
      <button type="submit" id="confirm-return-btn">Confirm Return Shipment</button>
    </form>
  `));
});

// Confirm return
app.post('/orders/:id/return/confirm', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const order = getOrder(req.params.id);
  if (!order || order.userId !== data.userId) return res.redirect('/orders');
  const rr = data.returnRequest;
  const confirmRef = `CONF-${randomBytes(4).toString('hex').toUpperCase()}`;
  returnRequests.set(confirmRef, {
    orderId: order.id,
    userId: data.userId,
    labelRef: rr?.labelRef,
    confirmedAt: new Date().toISOString(),
  });
  data.returnRequest = null;
  res.redirect(`/orders/${order.id}/return/done/${confirmRef}`);
});

// Done page
app.get('/orders/:id/return/done/:ref', (req, res) => {
  const { data } = getSession(req, res);
  if (!data.userId) return res.redirect('/login');
  const order = getOrder(req.params.id);
  if (!order) return res.redirect('/orders');
  const { ref } = req.params;
  const returnReq = returnRequests.get(ref);
  res.send(html('Return Confirmed!', `
    <div class="success" id="return-confirmed">
      <h2>✅ Return Confirmed!</h2>
      <p>Your return for <strong>${order.product}</strong> has been registered.</p>
      <div style="margin:12px 0">
        <strong>Confirmation Number:</strong>
        <div class="ref-number" id="confirmation-number">${ref}</div>
      </div>
      <p>Once we receive your package, the refund will be processed within 5–7 business days.</p>
      ${returnReq ? `<p style="color:#666;font-size:0.9em">Confirmed at: ${returnReq.confirmedAt}</p>` : ''}
    </div>
    <p style="margin-top:20px"><a href="/orders" style="color:#1a3c6e">← Back to My Orders</a></p>
  `));
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'return-portal' }));

app.listen(PORT, () => {
  console.log(`Return portal running on http://localhost:${PORT}`);
});
