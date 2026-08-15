/* =========================================================
   registry.js - the House Fund board + a stepped gift flow
   Standings are percentages only; no dollar amounts or names
   are ever exposed to the page.
   ========================================================= */
(function () {
  var cfg = window.WEDDING_CONFIG || {};
  var sb = null;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  var STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
    'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
    'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming', 'Ukraine'];

  var ABBR = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA', 'Colorado': 'CO',
    'Connecticut': 'CT', 'Delaware': 'DE', 'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
    'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
    'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
    'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
    'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'Ukraine': 'UKR'
  };

  var DEMO = [
    { state: 'Illinois', pct: 38.0, rank: 1 }, { state: 'Texas', pct: 35.0, rank: 2 },
    { state: 'Ukraine', pct: 16.0, rank: 3 }, { state: 'Iowa', pct: 11.0, rank: 4 }
  ];

  var statesEl = document.getElementById('regStates');
  if (!statesEl) return;

  var picksEl = document.getElementById('regPicks');
  var selectEl = document.getElementById('regStateSelect');
  var amountsEl = document.getElementById('regAmounts');
  var amountInput = document.getElementById('regAmount');
  var amountWrap = document.getElementById('regAmountWrap');
  var nameInput = document.getElementById('regName');
  var submitBtn = document.getElementById('regSubmit');
  var msgEl = document.getElementById('regMsg');
  var payEl = document.getElementById('regPay');
  var methodsEl = document.getElementById('regMethods');
  var payLinks = document.getElementById('regPayLinks');
  var paySub = document.getElementById('regPaySub');
  var editBtn = document.getElementById('regEdit');
  var next1 = document.getElementById('next1');
  var next2 = document.getElementById('next2');

  var chosenState = null;
  var chosenAmount = null;
  var pledgeId = null;
  var lastRows = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  /* ---------------- the board ---------------- */
  function render(rows, highlight) {
    if (!rows || !rows.length) {
      statesEl.innerHTML = '<li class="reg__state reg__state--skeleton"><span class="reg__state-name">No votes yet. Be the first.</span></li>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r.pct) || 0; })) || 100;
    var shown = rows.slice(0, 8);
    statesEl.innerHTML = shown.map(function (r, i) {
      var pct = Number(r.pct) || 0;
      var w = Math.max(3, (pct / max) * 100);
      return '<li class="reg__state reg__state--p' + (i + 1) + (highlight === r.state ? ' reg__state--you' : '') + '">' +
        '<span class="reg__state-rank">' + (i + 1) + '</span>' +
        '<span class="reg__state-abbr">' + esc(ABBR[r.state] || '') + '</span>' +
        '<span class="reg__state-name">' + esc(r.state) + '</span>' +
        '<span class="reg__state-bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
        '<span class="reg__state-pct">' + pct.toFixed(1) + '%</span>' +
        '</li>';
    }).join('');
    var tail = document.getElementById('regMore');
    var more = rows.length - shown.length;
    if (tail) tail.textContent = more > 0 ? ('plus ' + more + ' more state' + (more === 1 ? '' : 's') + ' in the running') : '';
  }

  async function loadStandings(highlight) {
    if (!sb) { lastRows = DEMO; render(DEMO, highlight); return DEMO; }
    var res = await sb.rpc('registry_standings');
    if (res.error) { console.error(res.error); lastRows = DEMO; render(DEMO, highlight); return DEMO; }
    lastRows = (res.data && res.data.length) ? res.data : DEMO;
    render(lastRows, highlight);
    return lastRows;
  }

  /* ---------------- the stepper ---------------- */
  var current = 1;

  function stepEl(n) { return document.getElementById('step' + n); }

  function openStep(n, opts) {
    current = n;
    [1, 2, 3].forEach(function (i) {
      var s = stepEl(i);
      var done = i < n;
      s.classList.toggle('is-open', i === n);
      s.classList.toggle('is-done', done);
      s.classList.toggle('is-locked', i > n);
      var edit = s.querySelector('.step__edit');
      if (edit) edit.hidden = !done;
      var sum = document.getElementById('sum' + i);
      if (sum) sum.hidden = !done;
    });
    if (!opts || opts.scroll !== false) scrollClear(stepEl(n));
  }

  function scrollClear(el) {
    if (!el) return;
    requestAnimationFrame(function () {
      var nav = document.getElementById('nav');
      var navH = nav ? nav.getBoundingClientRect().height : 60;
      var y = el.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop) - navH - 18;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    });
  }

  function setSummaries() {
    var s1 = document.getElementById('sum1');
    var s2 = document.getElementById('sum2');
    if (s1) s1.textContent = chosenState || '';
    if (s2) s2.textContent = chosenAmount ? money(chosenAmount) + (nameInput.value.trim() ? ' from ' + nameInput.value.trim() : '') : '';
    var rs = document.getElementById('revState');
    var ra = document.getElementById('revAmount');
    if (rs) rs.textContent = chosenState || '-';
    if (ra) ra.textContent = chosenAmount ? money(chosenAmount) : '-';
  }

  /* ---------------- step 1: place ---------------- */
  STATES.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s; o.textContent = s;
    selectEl.appendChild(o);
  });

  function setState(s, fromSelect) {
    chosenState = s;
    picksEl.querySelectorAll('.reg__pick').forEach(function (x) {
      x.classList.toggle('is-on', x.getAttribute('data-state') === s);
    });
    if (!fromSelect) selectEl.value = STATES.indexOf(s) > -1 ? s : '';
    next1.disabled = !s;
    setSummaries();
    if (lastRows) render(lastRows, s);   /* light up the row you are backing */
  }
  picksEl.querySelectorAll('.reg__pick').forEach(function (b) {
    b.addEventListener('click', function () { setState(b.getAttribute('data-state')); });
  });
  selectEl.addEventListener('change', function () {
    if (selectEl.value) setState(selectEl.value, true);
  });
  next1.addEventListener('click', function () {
    if (!chosenState) return;
    setSummaries();
    openStep(2);
  });

  /* ---------------- step 2: amount ---------------- */
  function setAmount(v) {
    chosenAmount = (v && v > 0) ? v : null;
    next2.disabled = !chosenAmount || chosenAmount > 100000;
    setSummaries();
  }
  amountsEl.querySelectorAll('.reg__amt').forEach(function (b) {
    b.addEventListener('click', function () {
      var preset = b.getAttribute('data-amt');
      amountsEl.querySelectorAll('.reg__amt').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      if (amountWrap) amountWrap.hidden = false;
      amountInput.value = preset || '';
      setAmount(parseFloat(preset));
      if (!preset) amountInput.focus();
    });
  });
  amountInput.addEventListener('input', function () {
    setAmount(parseFloat(amountInput.value));
  });
  nameInput.addEventListener('input', setSummaries);
  next2.addEventListener('click', function () {
    if (!chosenAmount) return;
    setSummaries();
    openStep(3);
  });

  /* ---------------- edit / back links ---------------- */
  document.querySelectorAll('[data-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      openStep(+b.getAttribute('data-edit'));
    });
  });

  /* ---------------- payment methods ---------------- */
  function methodHtml(method, amount, state) {
    var p = cfg.registry || {};
    var note = encodeURIComponent('House fund - ' + state);
    if (method === 'venmo' && p.venmo) {
      return '<a class="btn btn--primary" target="_blank" rel="noopener" href="https://venmo.com/' +
        encodeURIComponent(p.venmo) + '?txn=pay&amount=' + encodeURIComponent(amount) + '&note=' + note +
        '">Open Venmo</a><p class="reg__handle">@' + esc(p.venmo) + '</p>';
    }
    if (method === 'paypal' && p.paypal) {
      return '<a class="btn btn--primary" target="_blank" rel="noopener" href="https://www.paypal.com/myaccount/transfer/homepage/pay">Open PayPal</a>' +
        '<p class="reg__handle">Send to <b>' + esc(p.paypal) + '</b> as friends and family</p>';
    }
    if (method === 'zelle' && p.zelle) {
      return '<p class="reg__handle reg__handle--big">Zelle to <b>' + esc(p.zelle) + '</b></p>' +
        '<p class="reg__fineprint">Open your bank app and send to that email.</p>';
    }
    if (method === 'cash') {
      return '<p class="reg__handle reg__handle--big">Hand it to us at the wedding</p>' +
        '<p class="reg__fineprint">Cash, or a check made out to Austin Sabella. Your vote already counted.</p>';
    }
    return '<p class="reg__handle">We will send you the details.</p>';
  }
  methodsEl.querySelectorAll('.reg__method').forEach(function (b) {
    b.addEventListener('click', function () {
      methodsEl.querySelectorAll('.reg__method').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      payLinks.innerHTML = methodHtml(b.getAttribute('data-method'), chosenAmount, chosenState);
    });
  });

  /* ---------------- what the vote did ---------------- */
  function showImpact(rows) {
    var el = document.getElementById('regImpact');
    if (!el || !rows) return;
    var i = rows.map(function (r) { return r.state; }).indexOf(chosenState);
    if (i < 0) { el.hidden = true; return; }
    var r = rows[i];
    var pct = Number(r.pct).toFixed(1) + '%';
    var place = (i === 0) ? 'now leading the race' : 'now in ' + ordinal(i + 1) + ' place';
    el.textContent = chosenState + ' is ' + place + ' at ' + pct + '.';
    el.hidden = false;
  }
  function ordinal(n) {
    return n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  }

  /* ---------------- step 3: submit / retract ---------------- */
  function lockIn() {
    stepEl(3).classList.add('is-counted');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Vote counted';
    payEl.hidden = false;
  }
  function unlock() {
    stepEl(3).classList.remove('is-counted');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Count my vote';
    payEl.hidden = true;
    payLinks.innerHTML = '';
    var imp = document.getElementById('regImpact');
    if (imp) { imp.hidden = true; imp.textContent = ''; }
    methodsEl.querySelectorAll('.reg__method').forEach(function (x) { x.classList.remove('is-on'); });
  }

  submitBtn.addEventListener('click', async function () {
    msgEl.className = 'rsvp__msg';
    if (!chosenState) { openStep(1); return; }
    if (!chosenAmount || chosenAmount <= 0) { openStep(2); return; }
    if (chosenAmount > 100000) {
      msgEl.textContent = 'That is a very generous number. Text us instead.';
      msgEl.classList.add('rsvp__msg--err');
      return;
    }
    submitBtn.disabled = true;
    msgEl.textContent = 'Counting your vote...';
    try {
      if (sb) {
        var res = await sb.rpc('registry_pledge', {
          p_state: chosenState, p_amount: chosenAmount,
          p_name: (nameInput.value || '').trim(), p_note: null
        });
        if (res.error) throw res.error;
        pledgeId = res.data;
        var rows = await loadStandings(chosenState);
        showImpact(rows);
      } else {
        await new Promise(function (r) { setTimeout(r, 400); });
        pledgeId = 'demo';
        lastRows = DEMO;
        render(DEMO, chosenState);
        showImpact(DEMO);
      }
      msgEl.textContent = '';
      paySub.textContent = 'Your vote for ' + chosenState + ' is on the board. Now pick how you would like to send ' + money(chosenAmount) + '.';
      lockIn();
      scrollClear(payEl);
      document.querySelector('.reg__board').classList.add('is-bumped');
    } catch (e) {
      console.error(e);
      msgEl.textContent = 'Something went wrong counting that. Please try again.';
      msgEl.classList.add('rsvp__msg--err');
      submitBtn.disabled = false;
    }
  });

  editBtn.addEventListener('click', async function () {
    editBtn.disabled = true;
    try {
      if (sb && pledgeId && pledgeId !== 'demo') {
        var r = await sb.rpc('registry_retract', { p_id: pledgeId });
        if (r.error) throw r.error;
      }
      pledgeId = null;
      await loadStandings();
      unlock();
      openStep(1);
      msgEl.className = 'rsvp__msg';
      msgEl.textContent = 'Vote withdrawn. Pick again and count it back in.';
    } catch (e) {
      console.error(e);
      msgEl.textContent = 'Could not undo that vote. Please try again.';
      msgEl.classList.add('rsvp__msg--err');
    } finally {
      editBtn.disabled = false;
    }
  });

  openStep(1, { scroll: false });
  loadStandings();
})();
