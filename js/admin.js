/* =========================================================
   admin.js  -  private RSVP dashboard
   Auth: Supabase email + password. The guest list is returned
   only by admin_list_guests(), which checks the signed-in user
   against the public.admins allowlist server-side.
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

  if (!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)) {
    setMsg(msgEl, 'Add your Supabase URL and anon key to js/config.js, then reload.', 'err');
    var lb = document.getElementById('admLoginBtn');
    if (lb) lb.disabled = true;
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  /* ---- view switching ---- */
  function showDashboard() { loginEl.hidden = true; dashEl.hidden = false; }
  function showLogin() { dashEl.hidden = true; loginEl.hidden = false; }

  /* ---- auth ---- */
  async function init() {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) { showDashboard(); loadGuests(); }
    else { showLogin(); }
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
    setMsg(msgEl, '');
    showDashboard();
    loadGuests();
  }

  async function signout() {
    await sb.auth.signOut();
    guests = [];
    document.getElementById('admPass').value = '';
    showLogin();
  }

  /* ---- data ---- */
  async function loadGuests() {
    setMsg(dashMsg, 'Loading...');
    var res = await sb.rpc('admin_list_guests');
    if (res.error) {
      var m = /not authorized/i.test(res.error.message || '')
        ? 'This account is not on the admin allowlist. Add its email to the admins table in Supabase.'
        : 'Could not load responses. Please try again.';
      setMsg(dashMsg, m, 'err');
      guests = [];
      render();
      return;
    }
    guests = res.data || [];
    setMsg(dashMsg, '');
    render();
  }

  /* ---- rendering ---- */
  function statusBadge(attending) {
    if (attending === true) return '<span class="badge badge--yes">Attending</span>';
    if (attending === false) return '<span class="badge badge--no">Declined</span>';
    return '<span class="badge badge--pending">Awaiting</span>';
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function currentRows() {
    var q = (document.getElementById('admSearch').value || '').trim().toLowerCase();
    if (!q) return guests.slice();
    return guests.filter(function (g) {
      return (g.full_name || '').toLowerCase().indexOf(q) !== -1 ||
             (g.party_key || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderMetrics() {
    var total = guests.length;
    var yes = guests.filter(function (g) { return g.attending === true; }).length;
    var no = guests.filter(function (g) { return g.attending === false; }).length;
    var pending = total - yes - no;
    var cards = [
      ['Guests', total], ['Attending', yes], ['Declined', no], ['Awaiting', pending]
    ];
    document.getElementById('admMetrics').innerHTML = cards.map(function (c) {
      return '<div class="metric"><span>' + c[1] + '</span><label>' + c[0] + '</label></div>';
    }).join('');
  }

  function renderTable() {
    var rows = currentRows();
    var head = '<thead><tr>' +
      ['Name', 'Party', 'Status', 'Email', 'Phone', 'Note', 'Responded']
        .map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead>';
    if (!rows.length) {
      document.getElementById('admTable').innerHTML = head +
        '<tbody><tr><td colspan="7" class="admin-cell-muted">No guests to show.</td></tr></tbody>';
      return;
    }
    var body = rows.map(function (g) {
      return '<tr' + (g.is_plus_one ? ' class="is-plus"' : '') + '>' +
        '<td>' + esc(g.full_name) + '</td>' +
        '<td class="admin-cell-muted">' + esc(g.party_key) + '</td>' +
        '<td>' + statusBadge(g.attending) + '</td>' +
        '<td class="admin-cell-muted">' + esc(g.email) + '</td>' +
        '<td class="admin-cell-muted">' + esc(g.phone) + '</td>' +
        '<td class="admin-cell-muted">' + esc(g.note) + '</td>' +
        '<td class="admin-cell-muted">' + fmtDate(g.responded_at) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('admTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function render() { renderMetrics(); renderTable(); }

  /* ---- actions ---- */
  function copyText(text, okMsg) {
    function done() { setMsg(dashMsg, okMsg, 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { setMsg(dashMsg, 'Could not copy automatically. Select the table manually.', 'err'); }
      document.body.removeChild(ta);
    }
  }

  function copyPhones() {
    var rows = currentRows();
    var seen = {}, phones = [];
    rows.forEach(function (g) {
      var p = (g.phone || '').trim();
      if (p && !seen[p]) { seen[p] = 1; phones.push(p); }
    });
    if (!phones.length) { setMsg(dashMsg, 'No phone numbers in the current view.', 'err'); return; }
    copyText(phones.join('\n'), phones.length + ' phone number(s) copied to your clipboard.');
  }

  function downloadCsv() {
    var rows = currentRows();
    var cols = ['party_key', 'full_name', 'is_plus_one', 'attending', 'email', 'phone', 'note', 'responded_at'];
    function cell(v) {
      if (v === null || v === undefined) v = '';
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var csv = cols.join(',') + '\n' +
      rows.map(function (g) { return cols.map(function (c) { return cell(g[c]); }).join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'wedding-rsvps.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ---- wire up ---- */
  document.getElementById('admLoginBtn').addEventListener('click', login);
  document.getElementById('admPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  document.getElementById('admRefresh').addEventListener('click', loadGuests);
  document.getElementById('admSignout').addEventListener('click', signout);
  document.getElementById('admSearch').addEventListener('input', renderTable);
  document.getElementById('admCopyPhones').addEventListener('click', copyPhones);
  document.getElementById('admCsv').addEventListener('click', downloadCsv);

  init();
})();
