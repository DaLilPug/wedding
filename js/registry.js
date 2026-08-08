/* =========================================================
   registry.js - the House Fund board + pledge flow
   Standings come back as percentages only; no dollar amounts
   or names are ever exposed to the page.
   ========================================================= */
(function () {
  var cfg = window.WEDDING_CONFIG || {};
  var sb = null;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  var DEMO = [
    { state: 'Illinois', pct: 38.0, rank: 1 },
    { state: 'Texas', pct: 35.0, rank: 2 },
    { state: 'Colorado', pct: 16.0, rank: 3 },
    { state: 'Iowa', pct: 11.0, rank: 4 }
  ];

  var statesEl = document.getElementById('regStates');
  var picksEl = document.getElementById('regPicks');
  var amountsEl = document.getElementById('regAmounts');
  var amountInput = document.getElementById('regAmount');
  var nameInput = document.getElementById('regName');
  var submitBtn = document.getElementById('regSubmit');
  var msgEl = document.getElementById('regMsg');
  var payEl = document.getElementById('regPay');
  var payLinks = document.getElementById('regPayLinks');
  var paySub = document.getElementById('regPaySub');
  if (!statesEl) return;

  var chosenState = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(rows, highlight) {
    if (!rows || !rows.length) return;
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r.pct) || 0; })) || 100;
    statesEl.innerHTML = rows.map(function (r, i) {
      var pct = Number(r.pct) || 0;
      var w = Math.max(4, (pct / max) * 100);
      return '<li class="reg__state' + (i === 0 ? ' reg__state--lead' : '') +
        (highlight === r.state ? ' reg__state--you' : '') + '">' +
        '<span class="reg__state-rank">' + (i + 1) + '</span>' +
        '<span class="reg__state-name">' + esc(r.state) + '</span>' +
        '<span class="reg__state-bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
        '<span class="reg__state-pct">' + pct.toFixed(1) + '%</span>' +
        '</li>';
    }).join('');
  }

  async function loadStandings(highlight) {
    if (!sb) { render(DEMO, highlight); return; }
    var res = await sb.rpc('registry_standings');
    if (res.error) { console.error(res.error); render(DEMO, highlight); return; }
    render(res.data, highlight);
  }

  /* ---- pickers ---- */
  picksEl.querySelectorAll('.reg__pick').forEach(function (b) {
    b.addEventListener('click', function () {
      chosenState = b.getAttribute('data-state');
      picksEl.querySelectorAll('.reg__pick').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      msgEl.textContent = ''; msgEl.className = 'rsvp__msg';
    });
  });
  amountsEl.querySelectorAll('.reg__amt').forEach(function (b) {
    b.addEventListener('click', function () {
      amountInput.value = b.getAttribute('data-amt');
      amountsEl.querySelectorAll('.reg__amt').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
    });
  });
  amountInput.addEventListener('input', function () {
    amountsEl.querySelectorAll('.reg__amt').forEach(function (x) { x.classList.remove('is-on'); });
  });

  /* ---- payment handoff ---- */
  function payHtml(amount, state) {
    var p = cfg.registry || {};
    var note = encodeURIComponent('House fund - ' + state);
    var out = [];
    if (p.venmo) {
      out.push('<a class="btn btn--primary" target="_blank" rel="noopener" href="https://venmo.com/' +
        encodeURIComponent(p.venmo) + '?txn=pay&amount=' + encodeURIComponent(amount) + '&note=' + note + '">Send with Venmo</a>');
    }
    if (p.paypal) {
      out.push('<a class="btn btn--primary" target="_blank" rel="noopener" href="https://paypal.me/' +
        encodeURIComponent(p.paypal) + '/' + encodeURIComponent(amount) + '">Send with PayPal</a>');
    }
    if (p.zelle) {
      out.push('<p class="reg__zelle">Zelle: <b>' + esc(p.zelle) + '</b></p>');
    }
    if (!out.length) {
      out.push('<p class="reg__zelle">We will send you the details, or just find us at the wedding.</p>');
    }
    return out.join('');
  }

  /* ---- submit ---- */
  submitBtn.addEventListener('click', async function () {
    msgEl.className = 'rsvp__msg';
    var amount = parseFloat(amountInput.value);
    if (!chosenState) {
      msgEl.textContent = 'Pick a state first - that is the whole game.';
      msgEl.classList.add('rsvp__msg--err');
      return;
    }
    if (!amount || amount <= 0) {
      msgEl.textContent = 'Add an amount so we know how much weight your vote carries.';
      msgEl.classList.add('rsvp__msg--err');
      return;
    }
    if (amount > 100000) {
      msgEl.textContent = 'That is a very generous number. Text us instead.';
      msgEl.classList.add('rsvp__msg--err');
      return;
    }

    submitBtn.disabled = true;
    msgEl.textContent = 'Counting your vote...';
    try {
      if (sb) {
        var res = await sb.rpc('registry_pledge', {
          p_state: chosenState, p_amount: amount,
          p_name: (nameInput.value || '').trim(), p_note: null
        });
        if (res.error) throw res.error;
        render(res.data, chosenState);
      } else {
        await new Promise(function (r) { setTimeout(r, 500); });
        render(DEMO, chosenState);
      }
      msgEl.textContent = '';
      paySub.textContent = 'Your vote for ' + chosenState + ' is on the board. Send the gift whenever works.';
      payLinks.innerHTML = payHtml(amount, chosenState);
      payEl.hidden = false;
      payEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('.reg__board').classList.add('is-bumped');
    } catch (e) {
      console.error(e);
      msgEl.textContent = 'Something went wrong counting that. Please try again.';
      msgEl.classList.add('rsvp__msg--err');
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadStandings();
})();
