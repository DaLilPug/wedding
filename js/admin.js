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

  /* ---- auth ---- */
  async function init() {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) { showDashboard(); loadGuests(); } else { showLogin(); }
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
    setMsg(msgEl, ''); showDashboard(); loadGuests();
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
    var plus = g ? g.is_plus_one : false;
    var status = g ? statusBadge(g.attending) : '<span class="badge badge--new">Unsaved</span>';
    var email = g && g.email ? '<span class="grow-email">' + esc(g.email) + '</span>' : '';
    return '<div class="grow' + (plus ? ' grow--plus' : '') + '" data-id="' + esc(id) + '" data-party="' + esc(partyKey) + '">' +
      '<input class="grow-name" type="text" value="' + esc(name) + '" placeholder="Full name" />' +
      '<label class="grow-plus-tog"><input type="checkbox"' + (plus ? ' checked' : '') + ' /> +1</label>' +
      '<input class="grow-phone" type="tel" value="' + esc(phone) + '" placeholder="Phone (optional)" />' +
      '<span class="grow-status">' + status + email + '</span>' +
      '<button class="grow-save" type="button">Save</button>' +
      '<button class="grow-del" type="button" title="Remove" aria-label="Remove">&#10005;</button>' +
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
    var plus = row.querySelector('.grow-plus-tog input').checked;
    if (!name) { setMsg(dashMsg, 'A name is required to save.', 'err'); return; }
    var btn = row.querySelector('.grow-save'); btn.disabled = true;
    var res = await sb.rpc('admin_save_guest', {
      p_id: id, p_party_key: party, p_full_name: name, p_is_plus_one: plus, p_phone: phone
    });
    btn.disabled = false;
    if (res.error) { setMsg(dashMsg, 'Could not save: ' + res.error.message, 'err'); return; }
    var saved = res.data;
    if (id) {
      var g = guests.filter(function (x) { return x.id === id; })[0];
      if (g) { g.full_name = saved.full_name; g.phone = saved.phone; g.is_plus_one = saved.is_plus_one; g.party_key = saved.party_key; }
    } else {
      guests.push(saved); row.setAttribute('data-id', saved.id);
      var st = row.querySelector('.grow-status'); if (st) st.innerHTML = statusBadge(saved.attending);
    }
    row.classList.toggle('grow--plus', plus);
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
    var cols = ['party_key', 'full_name', 'is_plus_one', 'attending', 'email', 'phone', 'note', 'responded_at'];
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
})();
