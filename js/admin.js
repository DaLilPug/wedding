/* =========================================================
   admin.js  -  private RSVP dashboard + guest manager
   Auth: Supabase email + password. All reads/writes go through
   allow-list-gated SECURITY DEFINER functions:
     admin_list_guests(), admin_save_guest(...), admin_delete_guest(...)
   ========================================================= */
(function () {
  var cfg = window.WEDDING_CONFIG || {};
  var loginEl = document.getElementById('adminLogin');
  var dashEl = document.getElementById('adminDash');
  var msgEl = document.getElementById('admMsg');
  var dashMsg = document.getElementById('admDashMsg');
  var sb = null;
  var guests = [];

  function setMsg(el, text, kind) {
    el.textContent = text || '';
    el.className = 'admin-msg' + (kind ? ' admin-msg--' + kind : '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  if (!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)) {
    setMsg(msgEl, 'Add your Supabase URL and anon key to js/config.js, then reload.', 'err');
    var lb0 = document.getElementById('admLoginBtn'); if (lb0) lb0.disabled = true;
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  function showDashboard() { loginEl.hidden = true; dashEl.hidden = false; }
  function showLogin() { dashEl.hidden = true; loginEl.hidden = false; }

  /* ---- reminders ---- */
  var reminders = [];
  var AUDIENCES = [['all','Everyone'],['attending','Attending'],['declined','Declined'],['not_responded','Not yet responded']];

  async function loadReminders() {
    var res = await sb.rpc('admin_list_reminders');
    if (res.error) { setMsg(document.getElementById('admRemMsg'), 'Could not load reminders: ' + res.error.message, 'err'); return; }
    reminders = res.data || [];
    renderReminders();
  }

  function reminderRowHtml(r) {
    var id = r ? r.id : '';
    var sent = r && r.sent_at;
    var opts = AUDIENCES.map(function (a) {
      return '<option value="' + a[0] + '"' + ((r && r.audience) === a[0] ? ' selected' : '') + '>' + a[1] + '</option>';
    }).join('');
    return '<div class="grow rem-row' + (sent ? ' rem-row--sent' : '') + '" data-id="' + esc(id) + '">' +
      '<input class="rem-date" type="date" value="' + esc(r ? r.send_on : '') + '"' + (sent ? ' disabled' : '') + ' />' +
      '<select class="rem-aud"' + (sent ? ' disabled' : '') + '>' + opts + '</select>' +
      '<input class="rem-subject" type="text" value="' + esc(r ? r.subject : '') + '" placeholder="Subject"' + (sent ? ' disabled' : '') + ' />' +
      (sent
        ? '<span class="rem-status">Sent to ' + (r.sent_count || 0) + '</span>'
        : '<button class="grow-save rem-save" type="button">Save</button>' +
          '<button class="grow-del rem-del" type="button" title="Remove" aria-label="Remove">&#10005;</button>') +
      '<textarea class="rem-body" placeholder="Message... (blank line = new paragraph)"' + (sent ? ' disabled' : '') + '>' + esc(r ? r.body : '') + '</textarea>' +
      '</div>';
  }

  function renderReminders() {
    var el = document.getElementById('admReminders');
    el.innerHTML = reminders.map(function (r) { return reminderRowHtml(r); }).join('') ||
      '<p class="admin-cell-muted" style="padding:18px">No reminders yet. Add one above.</p>';
    el.querySelectorAll('.rem-save').forEach(function (b) { b.onclick = function () { saveReminder(b.closest('.rem-row')); }; });
    el.querySelectorAll('.rem-del').forEach(function (b) { b.onclick = function () { deleteReminder(b.closest('.rem-row')); }; });
  }

  async function saveReminder(row) {
    var msg = document.getElementById('admRemMsg');
    var id = row.getAttribute('data-id') || null;
    var sendOn = row.querySelector('.rem-date').value;
    var subject = row.querySelector('.rem-subject').value.trim();
    var body = row.querySelector('.rem-body').value.trim();
    if (!sendOn || !subject || !body) { setMsg(msg, 'A reminder needs a date, subject, and message.', 'err'); return; }
    var res = await sb.rpc('admin_save_reminder', {
      p_id: id, p_send_on: sendOn,
      p_audience: row.querySelector('.rem-aud').value,
      p_subject: subject, p_body: body
    });
    if (res.error) { setMsg(msg, 'Could not save: ' + res.error.message, 'err'); return; }
    setMsg(msg, 'Reminder saved for ' + sendOn + '.', 'ok');
    loadReminders();
  }

  async function deleteReminder(row) {
    var id = row.getAttribute('data-id');
    if (!id) { row.remove(); return; }
    if (!confirm('Remove this reminder?')) return;
    var res = await sb.rpc('admin_delete_reminder', { p_id: id });
    if (res.error) { setMsg(document.getElementById('admRemMsg'), 'Could not remove: ' + res.error.message, 'err'); return; }
    loadReminders();
  }

  /* ---- house fund pledges ---- */
  var pledges = [];

  async function loadPledges() {
    var res = await sb.rpc('admin_list_pledges');
    if (res.error) { setMsg(document.getElementById('admPledgeMsg'), 'Could not load pledges: ' + res.error.message, 'err'); return; }
    pledges = res.data || [];
    renderPledges();
  }

  function renderPledges() {
    var totals = {}, grand = 0, received = 0, real = 0;
    pledges.forEach(function (p) {
      var amt = Number(p.amount) || 0;
      totals[p.state] = (totals[p.state] || 0) + amt;
      grand += amt;
      if (!p.is_baseline) { real += amt; if (p.confirmed) received += amt; }
    });
    var lead = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; })[0] || '-';
    var money = function (n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); };
    document.getElementById('admPledgeMetrics').innerHTML = [
      ['Pledged (real)', money(real)],
      ['Received', money(received)],
      ['Gifts', String(pledges.filter(function (p) { return !p.is_baseline; }).length)],
      ['Leading', lead]
    ].map(function (c) {
      return '<div class="metric"><span>' + esc(c[1]) + '</span><label>' + esc(c[0]) + '</label></div>';
    }).join('');

    document.getElementById('admPledges').innerHTML = pledges.map(function (p) {
      var when = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
      return '<div class="grow pl-row' + (p.is_baseline ? ' pl-row--base' : '') + '" data-id="' + esc(p.id) + '">' +
        '<input class="pl-state" type="text" value="' + esc(p.state) + '" placeholder="State" />' +
        '<input class="pl-amount" type="number" step="1" value="' + esc(p.amount) + '" placeholder="Amount" />' +
        '<input class="pl-name" type="text" value="' + esc(p.guest_name || '') + '" placeholder="From" />' +
        '<label class="pl-conf"><input type="checkbox"' + (p.confirmed ? ' checked' : '') + ' /> received</label>' +
        '<span class="pl-date">' + esc(when) + '</span>' +
        '<button class="grow-save pl-save" type="button">Save</button>' +
        '<button class="grow-del pl-del" type="button" title="Remove" aria-label="Remove">&#10005;</button>' +
        '</div>';
    }).join('') || '<p class="admin-cell-muted" style="padding:18px">No gifts yet.</p>';

    var list = document.getElementById('admPledges');
    list.querySelectorAll('.pl-save').forEach(function (b) { b.onclick = function () { savePledge(b.closest('.pl-row')); }; });
    list.querySelectorAll('.pl-del').forEach(function (b) { b.onclick = function () { delPledge(b.closest('.pl-row')); }; });
  }

  async function savePledge(row) {
    var msg = document.getElementById('admPledgeMsg');
    var res = await sb.rpc('admin_save_pledge', {
      p_id: row.getAttribute('data-id'),
      p_state: row.querySelector('.pl-state').value.trim(),
      p_amount: parseFloat(row.querySelector('.pl-amount').value),
      p_name: row.querySelector('.pl-name').value.trim(),
      p_confirmed: row.querySelector('.pl-conf input').checked
    });
    if (res.error) { setMsg(msg, 'Could not save: ' + res.error.message, 'err'); return; }
    setMsg(msg, 'Saved.', 'ok');
    loadPledges();
  }

  async function delPledge(row) {
    if (!confirm('Remove this gift and its vote?')) return;
    var res = await sb.rpc('admin_delete_pledge', { p_id: row.getAttribute('data-id') });
    if (res.error) { setMsg(document.getElementById('admPledgeMsg'), 'Could not remove: ' + res.error.message, 'err'); return; }
    loadPledges();
  }

  /* ---- auth ---- */

  async function init() {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) { showDashboard(); loadGuests(); loadReminders(); loadPledges(); } else { showLogin(); }
  }
  async function login() {
    var email = document.getElementById('admEmail').value.trim();
    var pass = document.getElementById('admPass').value;
    var btn = document.getElementById('admLoginBtn');
    if (!email || !pass) { setMsg(msgEl, 'Enter your email and password.', 'err'); return; }
    btn.disabled = true; setMsg(msgEl, 'Signing in...');
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    btn.disabled = false;
    if (res.error) { setMsg(msgEl, 'Could not sign in. Check your email and password.', 'err'); return; }
    setMsg(msgEl, ''); showDashboard(); loadGuests(); loadReminders(); loadPledges();
  }
  async function signout() {
    await sb.auth.signOut(); guests = [];
    document.getElementById('admPass').value = ''; showLogin();
  }

  /* ---- data ---- */
  async function loadGuests() {
    setMsg(dashMsg, 'Loading...');
    var res = await sb.rpc('admin_list_guests');
    if (res.error) {
      var m = /not authorized/i.test(res.error.message || '')
        ? 'This account is not on the admin allowlist. Add its email to the admins table in Supabase.'
        : 'Could not load guests. Please try again.';
      setMsg(dashMsg, m, 'err'); guests = []; render(); return;
    }
    guests = res.data || [];
    setMsg(dashMsg, ''); render();
  }

  /* ---- grouping ---- */
  function parties() {
    var map = {}, order = [];
    guests.forEach(function (g) {
      if (!map[g.party_key]) { map[g.party_key] = []; order.push(g.party_key); }
      map[g.party_key].push(g);
    });
    order.forEach(function (k) {
      map[k].sort(function (a, b) {
        return (a.is_plus_one ? 1 : 0) - (b.is_plus_one ? 1 : 0) ||
               (a.full_name || '').localeCompare(b.full_name || '');
      });
    });
    return order.map(function (k) { return { key: k, members: map[k] }; });
  }

  function statusBadge(att) {
    if (att === true) return '<span class="badge badge--yes">Attending</span>';
    if (att === false) return '<span class="badge badge--no">Declined</span>';
    return '<span class="badge badge--pending">Awaiting</span>';
  }
  function rsvpSelect(att) {
    var v = att === true ? 'yes' : att === false ? 'no' : '';
    return '<select class="grow-rsvp grow-rsvp--' + (v || 'await') + '" aria-label="RSVP status">' +
      '<option value=""' + (v === '' ? ' selected' : '') + '>Awaiting</option>' +
      '<option value="yes"' + (v === 'yes' ? ' selected' : '') + '>Attending</option>' +
      '<option value="no"' + (v === 'no' ? ' selected' : '') + '>Declined</option>' +
      '</select>';
  }

  function renderMetrics() {
    var total = guests.length;
    var yes = guests.filter(function (g) { return g.attending === true; }).length;
    var no = guests.filter(function (g) { return g.attending === false; }).length;
    var pending = total - yes - no;
    var parties_n = parties().length;
    var cards = [['Guests', total], ['Parties', parties_n], ['Attending', yes], ['Declined', no], ['Awaiting', pending]];
    document.getElementById('admMetrics').innerHTML = cards.map(function (c) {
      return '<div class="metric"><span>' + c[1] + '</span><label>' + c[0] + '</label></div>';
    }).join('');
  }

  /* ---- rendering the editable list ---- */
  function rowHtml(g, partyKey) {
    var id = g ? g.id : '';
    var name = g ? g.full_name : '';
    var phone = g ? (g.phone || '') : '';
    var email = g ? (g.email || '') : '';
    var note = g ? (g.note || '') : '';
    var role = g ? (g.role || '') : '';
    var address = g ? (g.address || '') : '';
    var plus = g ? g.is_plus_one : false;
    var att = g ? g.attending : null;
    return '<div class="grow' + (plus ? ' grow--plus' : '') + '" data-id="' + esc(id) + '" data-party="' + esc(partyKey) + '">' +
      '<input class="grow-name" type="text" value="' + esc(name) + '" placeholder="Full name" />' +
      '<label class="grow-plus-tog"><input type="checkbox"' + (plus ? ' checked' : '') + ' /> +1</label>' +
      '<input class="grow-phone" type="tel" value="' + esc(phone) + '" placeholder="Phone" />' +
      '<input class="grow-emailf" type="email" value="' + esc(email) + '" placeholder="Email" />' +
      '<input class="grow-role" type="text" value="' + esc(role) + '" placeholder="Role (optional)" />' +
      rsvpSelect(att) +
      '<button class="grow-save" type="button">Save</button>' +
      '<button class="grow-del" type="button" title="Remove" aria-label="Remove">&#10005;</button>' +
      '<input class="grow-address" type="text" value="' + esc(address) + '" placeholder="Mailing address" />' +
      '<input class="grow-note" type="text" value="' + esc(note) + '" placeholder="Note for us (optional)" />' +
      '</div>';
  }

  function render() {
    renderMetrics();
    var q = (document.getElementById('admSearch').value || '').trim().toLowerCase();
    var ps = parties().filter(function (p) {
      if (!q) return true;
      return p.key.toLowerCase().indexOf(q) !== -1 ||
        p.members.some(function (m) { return (m.full_name || '').toLowerCase().indexOf(q) !== -1; });
    });
    var html = ps.map(function (p) {
      return '<div class="party" data-party="' + esc(p.key) + '">' +
        p.members.map(function (m) { return rowHtml(m, p.key); }).join('') +
        '<button class="party-add" type="button" data-party="' + esc(p.key) + '">+ add a person to this party</button>' +
        '</div>';
    }).join('');
    document.getElementById('admList').innerHTML = html ||
      '<p class="admin-cell-muted" style="padding:18px">No guests match your search.</p>';
    wire();
  }

  function wire() {
    var list = document.getElementById('admList');
    list.querySelectorAll('.grow-save').forEach(function (b) { b.onclick = function () { saveRow(b.closest('.grow')); }; });
    list.querySelectorAll('.grow-del').forEach(function (b) { b.onclick = function () { delRow(b.closest('.grow')); }; });
    list.querySelectorAll('.party-add').forEach(function (b) { b.onclick = function () { addPerson(b.getAttribute('data-party')); }; });
  }

  /* ---- mutations ---- */
  async function saveRow(row) {
    var id = row.getAttribute('data-id') || null;
    var party = row.getAttribute('data-party');
    var name = row.querySelector('.grow-name').value.trim();
    var phone = row.querySelector('.grow-phone').value.trim();
    var email = row.querySelector('.grow-emailf').value.trim();
    var note = row.querySelector('.grow-note').value.trim();
    var role = row.querySelector('.grow-role').value.trim();
    var address = row.querySelector('.grow-address').value.trim();
    var rv = row.querySelector('.grow-rsvp').value;
    var attending = rv === 'yes' ? true : rv === 'no' ? false : null;
    var plus = row.querySelector('.grow-plus-tog input').checked;
    if (!name) { setMsg(dashMsg, 'A name is required to save.', 'err'); return; }
    var btn = row.querySelector('.grow-save'); btn.disabled = true;
    var res = await sb.rpc('admin_save_guest', {
      p_id: id, p_party_key: party, p_full_name: name, p_is_plus_one: plus,
      p_phone: phone, p_email: email, p_attending: attending, p_note: note,
      p_role: role, p_address: address
    });
    if (res.error && res.error.code === 'PGRST202') {
      res = await sb.rpc('admin_save_guest', {
        p_id: id, p_party_key: party, p_full_name: name, p_is_plus_one: plus,
        p_phone: phone, p_email: email, p_attending: attending, p_note: note
      });
    }
    btn.disabled = false;
    if (res.error) { setMsg(dashMsg, 'Could not save: ' + res.error.message, 'err'); return; }
    var saved = res.data;
    if (id) {
      var g = guests.filter(function (x) { return x.id === id; })[0];
      if (g) {
        g.full_name = saved.full_name; g.phone = saved.phone; g.email = saved.email;
        g.is_plus_one = saved.is_plus_one; g.party_key = saved.party_key;
        g.attending = saved.attending; g.note = saved.note; g.responded_at = saved.responded_at;
        g.role = saved.role; g.address = saved.address;
      }
    } else {
      guests.push(saved); row.setAttribute('data-id', saved.id);
    }
    row.classList.toggle('grow--plus', plus);
    row.querySelector('.grow-rsvp').className = 'grow-rsvp grow-rsvp--' + (rv || 'await');
    row.classList.add('grow--ok'); setTimeout(function () { row.classList.remove('grow--ok'); }, 1200);
    setMsg(dashMsg, 'Saved ' + esc(name) + '.', 'ok');
    renderMetrics();
  }

  async function delRow(row) {
    var id = row.getAttribute('data-id');
    if (!id) { row.remove(); return; }
    var name = (row.querySelector('.grow-name').value || 'this guest').trim();
    if (!window.confirm('Remove ' + name + ' from the guest list?')) return;
    var res = await sb.rpc('admin_delete_guest', { p_id: id });
    if (res.error) { setMsg(dashMsg, 'Could not remove: ' + res.error.message, 'err'); return; }
    guests = guests.filter(function (x) { return x.id !== id; });
    row.remove();
    setMsg(dashMsg, 'Removed ' + esc(name) + '.', 'ok');
    renderMetrics();
  }

  function addPerson(partyKey) {
    var party = document.querySelector('.party[data-party="' + cssEsc(partyKey) + '"]');
    if (!party) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = rowHtml(null, partyKey);
    var row = tmp.firstChild;
    party.insertBefore(row, party.querySelector('.party-add'));
    // default a freshly added person to +1
    var chk = row.querySelector('.grow-plus-tog input'); if (chk) chk.checked = true;
    wire();
    row.querySelector('.grow-name').focus();
  }

  function addGuest() {
    var key = 'party-' + Math.random().toString(36).slice(2, 10);
    var tmp = document.createElement('div');
    tmp.innerHTML = '<div class="party" data-party="' + esc(key) + '">' + rowHtml(null, key) +
      '<button class="party-add" type="button" data-party="' + esc(key) + '">+ add a person to this party</button></div>';
    var list = document.getElementById('admList');
    list.insertBefore(tmp.firstChild, list.firstChild);
    wire();
    list.querySelector('.grow-name').focus();
  }

  /* ---- export helpers ---- */
  function copyText(text, okMsg) {
    function done() { setMsg(dashMsg, okMsg, 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fb);
    } else { fb(); }
    function fb() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { setMsg(dashMsg, 'Could not copy automatically.', 'err'); }
      document.body.removeChild(ta);
    }
  }
  function copyPhones() {
    var seen = {}, phones = [];
    guests.forEach(function (g) { var p = (g.phone || '').trim(); if (p && !seen[p]) { seen[p] = 1; phones.push(p); } });
    if (!phones.length) { setMsg(dashMsg, 'No phone numbers saved yet.', 'err'); return; }
    copyText(phones.join('\n'), phones.length + ' phone number(s) copied.');
  }
  function downloadCsv() {
    var cols = ['party_key', 'full_name', 'is_plus_one', 'attending', 'email', 'phone', 'address', 'role', 'note', 'responded_at'];
    function cell(v) { if (v == null) v = ''; v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var csv = cols.join(',') + '\n' + guests.map(function (g) { return cols.map(function (c) { return cell(g[c]); }).join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'wedding-guests.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  /* ---- wire static controls ---- */
  document.getElementById('admLoginBtn').addEventListener('click', login);
  document.getElementById('admPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  document.getElementById('admRefresh').addEventListener('click', loadGuests);
  document.getElementById('admSignout').addEventListener('click', signout);
  document.getElementById('admSearch').addEventListener('input', render);
  document.getElementById('admAddGuest').addEventListener('click', addGuest);
  document.getElementById('admCopyPhones').addEventListener('click', copyPhones);
  document.getElementById('admCsv').addEventListener('click', downloadCsv);

  init();

  var admAddRem = document.getElementById('admAddReminder');
  if (admAddRem) admAddRem.addEventListener('click', function () {
    var el = document.getElementById('admReminders');
    if (el.querySelector('.admin-cell-muted')) el.innerHTML = '';
    el.insertAdjacentHTML('afterbegin', reminderRowHtml(null));
    el.querySelectorAll('.rem-save').forEach(function (b) { b.onclick = function () { saveReminder(b.closest('.rem-row')); }; });
    el.querySelectorAll('.rem-del').forEach(function (b) { b.onclick = function () { deleteReminder(b.closest('.rem-row')); }; });
  });


  var plRefresh = document.getElementById('admPledgeRefresh');
  if (plRefresh) plRefresh.addEventListener('click', loadPledges);
})();