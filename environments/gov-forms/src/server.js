import express from 'express';
import { randomBytes } from 'crypto';

const PORT = process.env.PORT || 3335;

// In-memory session store
const sessions = new Map();

function getSession(req, res) {
  let sid = req.cookies?.['gov_sid'];
  if (!sid || !sessions.has(sid)) {
    sid = randomBytes(16).toString('hex');
    sessions.set(sid, {});
    res.setHeader('Set-Cookie', `gov_sid=${sid}; Path=/; HttpOnly`);
  }
  return { sid, data: sessions.get(sid) };
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, _res, next) => { req.cookies = parseCookies(req); next(); });

function html(title, body, progress = 0) {
  const steps = ['Personal Info', 'Address', 'Employment', 'Review & Submit'];
  const progressHtml = progress > 0 ? `
    <div class="progress">
      ${steps.map((s, i) => `<div class="step ${i < progress ? 'done' : i === progress - 1 ? 'active' : ''}">${i + 1}. ${s}</div>`).join('')}
    </div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - GovForms</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #1a3c6e; }
    .nav { background: #1a3c6e; padding: 10px 20px; margin: -40px -20px 40px; }
    .nav a { color: white; text-decoration: none; font-size: 1.1em; font-weight: bold; }
    form { background: #f5f7fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    label { display: block; margin-bottom: 4px; font-weight: bold; color: #333; }
    input, select, textarea { width: 100%; padding: 8px; margin-bottom: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { background: #1a3c6e; color: white; padding: 10px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 1em; }
    button:hover { background: #2a5ca0; }
    .error { background: #fde8e8; border: 1px solid #f5c6c6; border-radius: 6px; padding: 12px; margin-bottom: 16px; color: #c00; }
    .success { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 20px; }
    .conditional { display: none; }
    .conditional.visible { display: block; }
    .progress { display: flex; gap: 8px; margin-bottom: 24px; }
    .step { flex: 1; padding: 8px; background: #e2e8f0; border-radius: 4px; font-size: 0.85em; text-align: center; }
    .step.done { background: #c6f6d5; color: #276749; }
    .step.active { background: #1a3c6e; color: white; font-weight: bold; }
    .review-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .review-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    .review-table td:first-child { font-weight: bold; color: #555; width: 40%; }
    .ref-box { font-size: 1.8em; font-weight: bold; color: #1a3c6e; letter-spacing: 2px; margin: 12px 0; }
    .upload-area { border: 2px dashed #ccc; border-radius: 6px; padding: 20px; text-align: center; background: #fafafa; margin-bottom: 14px; }
    .upload-area label { display: inline; font-weight: normal; color: #666; cursor: pointer; }
    .section-header { font-size: 1.05em; font-weight: bold; color: #1a3c6e; margin: 16px 0 8px; border-bottom: 2px solid #1a3c6e; padding-bottom: 4px; }
  </style>
</head>
<body>
  <div class="nav"><a href="/">GovForms — Public Services Portal</a></div>
  ${progressHtml}
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

// Homepage
app.get('/', (_req, res) => {
  res.send(html('Welcome to GovForms', `
    <p>Use this portal to submit your General Services Application. The form takes about 10 minutes to complete.</p>
    <p>You will need:</p>
    <ul>
      <li>Personal identification details</li>
      <li>Current address information</li>
      <li>Employment details</li>
      <li>Supporting documents (optional)</li>
    </ul>
    <a href="/apply" style="background:#1a3c6e;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;display:inline-block;font-size:1em" id="start-application">Start Application</a>
  `));
});

// Page 1: Personal Info
app.get('/apply', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  const { error = '', p1 = {} } = data;
  data.error = '';
  const errorHtml = error ? `<div class="error">${error}</div>` : '';
  const p = p1;
  res.send(html('Step 1: Personal Information', `
    ${errorHtml}
    <form action="/apply" method="POST" id="personal-info-form">
      <div class="section-header">Personal Details</div>
      <label for="first_name">First Name *</label>
      <input type="text" name="first_name" id="first_name" value="${p.first_name || ''}" required placeholder="Jane">
      <label for="last_name">Last Name *</label>
      <input type="text" name="last_name" id="last_name" value="${p.last_name || ''}" required placeholder="Doe">
      <label for="date_of_birth">Date of Birth *</label>
      <input type="date" name="date_of_birth" id="date_of_birth" value="${p.date_of_birth || ''}" required>
      <label for="email">Email Address *</label>
      <input type="email" name="email" id="email" value="${p.email || ''}" required placeholder="jane@example.com">
      <label for="phone">Phone Number *</label>
      <input type="tel" name="phone" id="phone" value="${p.phone || ''}" required placeholder="+1-555-000-0000">
      <div class="section-header">Nationality</div>
      <label for="nationality">Nationality *</label>
      <select name="nationality" id="nationality" required onchange="toggleForeignDocs(this.value)">
        <option value="">— Select nationality —</option>
        <option value="domestic" ${p.nationality === 'domestic' ? 'selected' : ''}>Domestic Citizen</option>
        <option value="eu" ${p.nationality === 'eu' ? 'selected' : ''}>EU / EEA Citizen</option>
        <option value="international" ${p.nationality === 'international' ? 'selected' : ''}>International / Other</option>
      </select>
      <div class="conditional ${(p.nationality === 'eu' || p.nationality === 'international') ? 'visible' : ''}" id="foreign-docs">
        <label for="passport_number">Passport / ID Number</label>
        <input type="text" name="passport_number" id="passport_number" value="${p.passport_number || ''}" placeholder="AB123456">
        <label for="visa_status">Visa / Residency Status</label>
        <select name="visa_status" id="visa_status">
          <option value="">— Select status —</option>
          <option value="citizen" ${p.visa_status === 'citizen' ? 'selected' : ''}>Permanent Resident / Citizen</option>
          <option value="work_visa" ${p.visa_status === 'work_visa' ? 'selected' : ''}>Work Visa</option>
          <option value="student_visa" ${p.visa_status === 'student_visa' ? 'selected' : ''}>Student Visa</option>
          <option value="other" ${p.visa_status === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <button type="submit" id="next-btn">Next: Address →</button>
    </form>
    <script>
      function toggleForeignDocs(val) {
        const d = document.getElementById('foreign-docs');
        d.classList.toggle('visible', val === 'eu' || val === 'international');
      }
    </script>
  `, 1));
});

app.post('/apply', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  const { first_name, last_name, date_of_birth, email, phone, nationality } = req.body;
  const errors = [];
  if (!first_name?.trim()) errors.push('First name is required');
  if (!last_name?.trim()) errors.push('Last name is required');
  if (!date_of_birth) errors.push('Date of birth is required');
  if (!email?.includes('@')) errors.push('Valid email is required');
  if (!phone?.trim()) errors.push('Phone number is required');
  if (!nationality) errors.push('Nationality is required');
  // Validate DOB is in the past
  if (date_of_birth && new Date(date_of_birth) >= new Date()) {
    errors.push('Date of birth must be in the past');
  }
  if (errors.length > 0) {
    data.error = errors.join('; ');
    data.p1 = req.body;
    return res.redirect('/apply');
  }
  data.p1 = req.body;
  data.error = '';
  res.redirect('/apply/address');
});

// Page 2: Address
app.get('/apply/address', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  if (!data.p1) return res.redirect('/apply');
  const { error = '', p2 = {} } = data;
  data.error = '';
  const errorHtml = error ? `<div class="error">${error}</div>` : '';
  const p = p2;
  res.send(html('Step 2: Address Details', `
    ${errorHtml}
    <form action="/apply/address" method="POST" id="address-form">
      <div class="section-header">Current Address</div>
      <label for="street">Street Address *</label>
      <input type="text" name="street" id="street" value="${p.street || ''}" required placeholder="123 Main Street">
      <label for="city">City *</label>
      <input type="text" name="city" id="city" value="${p.city || ''}" required placeholder="Springfield">
      <label for="state">State / Region *</label>
      <select name="state" id="state" required>
        <option value="">— Select state —</option>
        ${['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'].map(s => `<option value="${s}" ${p.state === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label for="postcode">Postal Code *</label>
      <input type="text" name="postcode" id="postcode" value="${p.postcode || ''}" required placeholder="90210" pattern="[0-9]{5}(-[0-9]{4})?">
      <label for="country">Country *</label>
      <select name="country" id="country" required onchange="toggleResidency(this.value)">
        <option value="">— Select country —</option>
        <option value="US" ${p.country === 'US' ? 'selected' : ''}>United States</option>
        <option value="CA" ${p.country === 'CA' ? 'selected' : ''}>Canada</option>
        <option value="GB" ${p.country === 'GB' ? 'selected' : ''}>United Kingdom</option>
        <option value="AU" ${p.country === 'AU' ? 'selected' : ''}>Australia</option>
        <option value="other" ${p.country === 'other' ? 'selected' : ''}>Other</option>
      </select>
      <div class="section-header">Residency Duration</div>
      <label for="years_at_address">Years at Current Address *</label>
      <select name="years_at_address" id="years_at_address" required>
        <option value="">— Select —</option>
        <option value="less_than_1" ${p.years_at_address === 'less_than_1' ? 'selected' : ''}>Less than 1 year</option>
        <option value="1_to_3" ${p.years_at_address === '1_to_3' ? 'selected' : ''}>1–3 years</option>
        <option value="3_to_5" ${p.years_at_address === '3_to_5' ? 'selected' : ''}>3–5 years</option>
        <option value="more_than_5" ${p.years_at_address === 'more_than_5' ? 'selected' : ''}>More than 5 years</option>
      </select>
      <div style="display:flex;gap:10px;margin-top:10px">
        <a href="/apply" style="flex:1;text-align:center;padding:10px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#333">← Back</a>
        <button type="submit" id="next-btn" style="flex:2">Next: Employment →</button>
      </div>
    </form>
    <script>
      function toggleResidency(val) {
        // Could show extra fields for non-US addresses
      }
    </script>
  `, 2));
});

app.post('/apply/address', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  const { street, city, state, postcode, country, years_at_address } = req.body;
  const errors = [];
  if (!street?.trim()) errors.push('Street address is required');
  if (!city?.trim()) errors.push('City is required');
  if (!state) errors.push('State is required');
  if (!postcode?.trim()) errors.push('Postal code is required');
  if (!country) errors.push('Country is required');
  if (!years_at_address) errors.push('Years at address is required');
  if (errors.length > 0) {
    data.error = errors.join('; ');
    data.p2 = req.body;
    return res.redirect('/apply/address');
  }
  data.p2 = req.body;
  data.error = '';
  res.redirect('/apply/employment');
});

// Page 3: Employment
app.get('/apply/employment', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  if (!data.p2) return res.redirect('/apply/address');
  const { error = '', p3 = {} } = data;
  data.error = '';
  const errorHtml = error ? `<div class="error">${error}</div>` : '';
  const p = p3;
  const isEmployed = p.employment_status === 'employed' || p.employment_status === 'self_employed';
  res.send(html('Step 3: Employment Details', `
    ${errorHtml}
    <form action="/apply/employment" method="POST" id="employment-form">
      <div class="section-header">Employment Status</div>
      <label for="employment_status">Current Employment Status *</label>
      <select name="employment_status" id="employment_status" required onchange="toggleEmployerDetails(this.value)">
        <option value="">— Select status —</option>
        <option value="employed" ${p.employment_status === 'employed' ? 'selected' : ''}>Employed (full-time / part-time)</option>
        <option value="self_employed" ${p.employment_status === 'self_employed' ? 'selected' : ''}>Self-employed / Freelance</option>
        <option value="unemployed" ${p.employment_status === 'unemployed' ? 'selected' : ''}>Unemployed</option>
        <option value="student" ${p.employment_status === 'student' ? 'selected' : ''}>Student</option>
        <option value="retired" ${p.employment_status === 'retired' ? 'selected' : ''}>Retired</option>
      </select>
      <label for="occupation">Occupation / Job Title</label>
      <input type="text" name="occupation" id="occupation" value="${p.occupation || ''}" placeholder="Software Engineer">
      <div class="conditional ${isEmployed ? 'visible' : ''}" id="employer-details">
        <div class="section-header">Employer Details</div>
        <label for="employer_name">Employer Name</label>
        <input type="text" name="employer_name" id="employer_name" value="${p.employer_name || ''}" placeholder="Acme Corp">
        <label for="employer_address">Employer Address</label>
        <input type="text" name="employer_address" id="employer_address" value="${p.employer_address || ''}" placeholder="456 Business Ave, City">
        <label for="annual_salary">Annual Salary (USD)</label>
        <select name="annual_salary" id="annual_salary">
          <option value="">— Select range —</option>
          <option value="under_25k" ${p.annual_salary === 'under_25k' ? 'selected' : ''}>Under $25,000</option>
          <option value="25k_50k" ${p.annual_salary === '25k_50k' ? 'selected' : ''}>$25,000 – $50,000</option>
          <option value="50k_75k" ${p.annual_salary === '50k_75k' ? 'selected' : ''}>$50,000 – $75,000</option>
          <option value="75k_100k" ${p.annual_salary === '75k_100k' ? 'selected' : ''}>$75,000 – $100,000</option>
          <option value="over_100k" ${p.annual_salary === 'over_100k' ? 'selected' : ''}>Over $100,000</option>
        </select>
        <label for="start_date">Start Date at Current Employer</label>
        <input type="date" name="start_date" id="start_date" value="${p.start_date || ''}">
      </div>
      <div style="display:flex;gap:10px;margin-top:10px">
        <a href="/apply/address" style="flex:1;text-align:center;padding:10px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#333">← Back</a>
        <button type="submit" id="next-btn" style="flex:2">Next: Review →</button>
      </div>
    </form>
    <script>
      function toggleEmployerDetails(val) {
        const d = document.getElementById('employer-details');
        d.classList.toggle('visible', val === 'employed' || val === 'self_employed');
      }
    </script>
  `, 3));
});

app.post('/apply/employment', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  const { employment_status } = req.body;
  const errors = [];
  if (!employment_status) errors.push('Employment status is required');
  if (errors.length > 0) {
    data.error = errors.join('; ');
    data.p3 = req.body;
    return res.redirect('/apply/employment');
  }
  data.p3 = req.body;
  data.error = '';
  res.redirect('/apply/review');
});

// Page 4: Review & Submit
app.get('/apply/review', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  if (!data.p3) return res.redirect('/apply/employment');
  const p1 = data.p1 || {};
  const p2 = data.p2 || {};
  const p3 = data.p3 || {};
  res.send(html('Step 4: Review & Submit', `
    <p>Please review your information before submitting. If anything is incorrect, use the Back links to correct it.</p>
    <div class="section-header">Personal Information</div>
    <table class="review-table">
      <tr><td>Name</td><td>${p1.first_name || ''} ${p1.last_name || ''}</td></tr>
      <tr><td>Date of Birth</td><td>${p1.date_of_birth || ''}</td></tr>
      <tr><td>Email</td><td>${p1.email || ''}</td></tr>
      <tr><td>Phone</td><td>${p1.phone || ''}</td></tr>
      <tr><td>Nationality</td><td>${p1.nationality || ''}</td></tr>
    </table>
    <a href="/apply" style="font-size:0.9em;color:#1a3c6e">Edit Personal Info</a>
    <div class="section-header">Address</div>
    <table class="review-table">
      <tr><td>Street</td><td>${p2.street || ''}</td></tr>
      <tr><td>City</td><td>${p2.city || ''}</td></tr>
      <tr><td>State</td><td>${p2.state || ''}</td></tr>
      <tr><td>Postcode</td><td>${p2.postcode || ''}</td></tr>
      <tr><td>Country</td><td>${p2.country || ''}</td></tr>
    </table>
    <a href="/apply/address" style="font-size:0.9em;color:#1a3c6e">Edit Address</a>
    <div class="section-header">Employment</div>
    <table class="review-table">
      <tr><td>Status</td><td>${p3.employment_status || ''}</td></tr>
      <tr><td>Occupation</td><td>${p3.occupation || ''}</td></tr>
      ${p3.employer_name ? `<tr><td>Employer</td><td>${p3.employer_name}</td></tr>` : ''}
    </table>
    <a href="/apply/employment" style="font-size:0.9em;color:#1a3c6e">Edit Employment</a>
    <div class="section-header" style="margin-top:20px">Supporting Documents (Optional)</div>
    <div class="upload-area">
      <p>Upload supporting documents (ID, proof of address, etc.)</p>
      <label for="file-upload">📎 Click to select files (mock — no file is actually uploaded)</label>
      <input type="file" id="file-upload" name="document" multiple style="display:none" onchange="showFileName(this)">
      <p id="file-name" style="color:#666;font-size:0.9em"></p>
    </div>
    <form action="/apply/submit" method="POST" id="submit-form">
      <label style="display:flex;align-items:center;gap:8px;font-weight:normal;margin-bottom:16px">
        <input type="checkbox" name="declaration" id="declaration" required style="width:auto;margin:0">
        I declare that the information provided is true and accurate to the best of my knowledge.
      </label>
      <button type="submit" id="submit-btn">Submit Application</button>
    </form>
    <script>
      function showFileName(input) {
        const names = Array.from(input.files).map(f => f.name).join(', ');
        document.getElementById('file-name').textContent = names ? 'Selected: ' + names : '';
      }
    </script>
  `, 4));
});

app.post('/apply/submit', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  if (!data.p3) return res.redirect('/apply');
  if (!req.body.declaration) {
    data.error = 'You must accept the declaration to submit';
    return res.redirect('/apply/review');
  }
  const ref = `GF-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
  data.referenceNumber = ref;
  data.submittedAt = new Date().toISOString();
  res.redirect(`/apply/confirmation/${ref}`);
});

// Confirmation page
app.get('/apply/confirmation/:ref', (req, res) => {
  const { sid, data } = getSession(req, res);
  void sid;
  const { ref } = req.params;
  if (!data.referenceNumber || data.referenceNumber !== ref) {
    return res.redirect('/');
  }
  res.send(html('Application Submitted!', `
    <div class="success">
      <h2>✅ Application Received!</h2>
      <p>Your General Services Application has been submitted successfully.</p>
      <div class="ref-box" id="reference-number">${ref}</div>
      <p><strong>Reference Number — please keep this for your records.</strong></p>
      <p>Submitted: ${data.submittedAt || new Date().toISOString()}</p>
      <p>You will receive a confirmation email at <strong>${data.p1?.email || 'your email'}</strong> within 5 business days.</p>
    </div>
    <p style="margin-top:20px"><a href="/" style="color:#1a3c6e">Return to Homepage</a></p>
  `));
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gov-forms' }));

app.listen(PORT, () => {
  console.log(`Gov-forms app running on http://localhost:${PORT}`);
});
