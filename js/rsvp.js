/* =========================================================
   rsvp.js  -  guest search + RSVP submission
   Uses Supabase when configured; otherwise runs a local demo
   so the flow is fully testable before the database is wired.
   ========================================================= */
(function () {
  var cfg = window.WEDDING_CONFIG || {};
  var sb = null;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  /* ---- Demo data (used only when Supabase is not configured) ---- */
  var DEMO = [
    { party_key: 'austin-anastasiia', members: [
      { id: 'demo-1', name: 'Austin Sabella', attending: null },
      { id: 'demo-2', name: 'Anastasiia Oliinyk', attending: null }
    ]},
    { party_key: 'demo-smith', members: [
      { id: 'demo-3', name: 'Jordan Smith', attending: null },
      { id: 'demo-4', name: 'Guest of Jordan Smith', attending: null }
    ]}
  ];

  /* ---- Data access ---- */
  async function searchParty(q) {
    q = (q || '').trim();
    if (q.length < 2) return [];
    if (sb) {
      var res = await sb.rpc('search_party', { q: q });
      if (res.error) { console.error(res.error); throw res.error; }
      return res.data || [];
    }
    var ql = q.toLowerCase();
    return DEMO.filter(function (p) {
      return p.members.some(function (m) { return m.name.toLowerCase().indexOf(ql) !== -1; });
    });
  }

  async function submitRsvp(partyKey, responses, email, phone, note) {
    if (sb) {
      var res = await sb.rpc('submit_rsvp', {
        p_party_key: partyKey, p_responses: responses,
        p_email: email || '', p_phone: phone || '', p_note: note || ''
      });
      if (res.error) { console.error(res.error); throw res.error; }
      return;
    }
    console.log('[DEMO] RSVP submitted:', { partyKey: partyKey, responses: responses, email: email, phone: phone, note: note });
    await new Promise(function (r) { setTimeout(r, 600); });
  }

  /* ---- DOM ---- */
  var stepSearch = document.getElementById('rsvpStepSearch');
  var stepRespond = document.getElementById('rsvpStepRespond');
  var stepDone = document.getElementById('rsvpStepDone');
  var nameInput = document.getElementById('rsvpName');
  var searchBtn = document.getElementById('rsvpSearchBtn');
  var searchMsg = document.getElementById('rsvpSearchMsg');

  if (!searchBtn) return; // RSVP section not on page

  function show(step) {
    [stepSearch, stepRespond, stepDone].forEach(function (s) { s.hidden = (s !== step); });
  }
  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- Step 1: search ---- */
  async function doSearch() {
    var q = nameInput.value;
    searchMsg.className = 'rsvp__msg';
    if ((q || '').trim().length < 2) {
      searchMsg.textContent = 'Please type your first and last name.';
      searchMsg.classList.add('rsvp__msg--err');
      return;
    }
    searchBtn.disabled = true;
    searchMsg.textContent = 'Searching...';
    try {
      var parties = await searchParty(q);
      if (!parties.length) {
        searchMsg.textContent = "We couldn't find that name. Try your partner's name, or reach out to us and we'll help.";
        searchMsg.classList.add('rsvp__msg--err');
      } else if (parties.length === 1) {
        renderRespond(parties[0]);
      } else {
        renderPartyChoice(parties);
      }
    } catch (e) {
      searchMsg.textContent = 'Something went wrong. Please try again in a moment.';
      searchMsg.classList.add('rsvp__msg--err');
    } finally {
      searchBtn.disabled = false;
    }
  }
  searchBtn.addEventListener('click', doSearch);
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

  /* ---- Disambiguation when more than one party matches ---- */
  function renderPartyChoice(parties) {
    var html = '<p class="rsvp__found">A few matches</p>' +
      '<p class="rsvp__sub">Choose your party</p><div class="party-choice">';
    parties.forEach(function (p, i) {
      var names = p.members.map(function (m) { return esc(m.name); }).join(' & ');
      html += '<button data-i="' + i + '">' + names + '</button>';
    });
    html += '</div>';
    stepRespond.innerHTML = html;
    stepRespond.querySelectorAll('.party-choice button').forEach(function (b) {
      b.addEventListener('click', function () { renderRespond(parties[+b.getAttribute('data-i')]); });
    });
    show(stepRespond);
  }

  /* ---- Step 2: respond ---- */
  function renderRespond(party) {
    var names = party.members.map(function (m) { return esc(m.name); }).join(' & ');
    var meals = Array.isArray(cfg.mealOptions) ? cfg.mealOptions : [];

    var html = '<p class="rsvp__found">We found you</p>' +
      '<p class="rsvp__sub">' + names + '</p>';

    party.members.forEach(function (m) {
      html += '<div class="guest-row" data-id="' + esc(m.id) + '">' +
        '<p class="guest-row__name">' + esc(m.name) + '</p>' +
        '<div class="attend">' +
        '<button type="button" data-v="yes">Joyfully accepts</button>' +
        '<button type="button" data-v="no">Regretfully declines</button>' +
        '</div>';
      if (meals.length) {
        html += '<div class="guest-meal field" hidden>' +
          '<label class="field__label">Meal preference</label><select>' +
          '<option value="">Select...</option>' +
          meals.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') +
          '</select></div>';
      }
      html += '</div>';
    });

    html += '<div class="field" style="margin-top:26px">' +
      '<label class="field__label" for="rsvpEmail">Email</label>' +
      '<input id="rsvpEmail" type="email" autocomplete="email" placeholder="you@email.com" />' +
      '<p class="field__hint">So we can send you wedding reminders and updates.</p></div>';

    html += '<div class="field">' +
      '<label class="field__label" for="rsvpPhone">Mobile number <span style="opacity:.6">(optional)</span></label>' +
      '<input id="rsvpPhone" type="tel" autocomplete="tel" placeholder="(555) 555-5555" /></div>';

    if (cfg.askNote) {
      html += '<div class="field">' +
        '<label class="field__label" for="rsvpNote">A note for us <span style="opacity:.6">(optional)</span></label>' +
        '<textarea id="rsvpNote" placeholder="Song requests, dietary needs, or just say hi..."></textarea></div>';
    }

    html += '<p class="rsvp__msg" id="rsvpRespondMsg" role="status"></p>' +
      '<div class="rsvp__actions">' +
      '<button class="btn btn--primary" id="rsvpSubmitBtn">Send RSVP</button>' +
      '<button class="rsvp__back" id="rsvpBackBtn">Start over</button></div>';

    stepRespond.innerHTML = html;

    // attend toggle behavior
    stepRespond.querySelectorAll('.guest-row').forEach(function (row) {
      var meal = row.querySelector('.guest-meal');
      row.querySelectorAll('.attend button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = btn.getAttribute('data-v');
          row.setAttribute('data-attending', v);
          row.querySelectorAll('.attend button').forEach(function (b) { b.classList.remove('is-yes', 'is-no'); });
          btn.classList.add(v === 'yes' ? 'is-yes' : 'is-no');
          if (meal) meal.hidden = (v !== 'yes');
        });
      });
    });

    document.getElementById('rsvpBackBtn').addEventListener('click', function () {
      searchMsg.textContent = ''; searchMsg.className = 'rsvp__msg';
      show(stepSearch);
    });
    document.getElementById('rsvpSubmitBtn').addEventListener('click', function () { doSubmit(party); });

    show(stepRespond);
  }

  /* ---- Submit ---- */
  async function doSubmit(party) {
    var msg = document.getElementById('rsvpRespondMsg');
    var btn = document.getElementById('rsvpSubmitBtn');
    msg.className = 'rsvp__msg';

    var rows = stepRespond.querySelectorAll('.guest-row');
    var responses = [];
    var allAnswered = true;
    rows.forEach(function (row) {
      var v = row.getAttribute('data-attending');
      if (!v) allAnswered = false;
      var mealSel = row.querySelector('.guest-meal select');
      responses.push({
        id: row.getAttribute('data-id'),
        attending: v === 'yes',
        meal: mealSel ? mealSel.value : ''
      });
    });

    if (!allAnswered) {
      msg.textContent = 'Please choose accepts or declines for each guest.';
      msg.classList.add('rsvp__msg--err');
      return;
    }

    var email = (document.getElementById('rsvpEmail') || {}).value || '';
    var phone = (document.getElementById('rsvpPhone') || {}).value || '';
    var noteEl = document.getElementById('rsvpNote');
    var note = noteEl ? noteEl.value : '';

    var anyYes = responses.some(function (r) { return r.attending; });
    if (anyYes && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      msg.textContent = 'Please add an email so we can send you reminders.';
      msg.classList.add('rsvp__msg--err');
      return;
    }

    btn.disabled = true;
    msg.textContent = 'Sending...';
    try {
      await submitRsvp(party.party_key, responses, email.trim(), phone.trim(), note.trim());
      renderDone(party, responses);
    } catch (e) {
      msg.textContent = 'Something went wrong sending your RSVP. Please try again.';
      msg.classList.add('rsvp__msg--err');
      btn.disabled = false;
    }
  }

  /* ---- Step 3: confirmation ---- */
  function renderDone(party, responses) {
    var byId = {};
    party.members.forEach(function (m) { byId[m.id] = m.name; });
    var coming = responses.filter(function (r) { return r.attending; }).map(function (r) { return esc(byId[r.id]); });

    var msg;
    if (coming.length) {
      msg = 'We are so happy you can join us, ' + coming.join(' & ') + '. ' +
        'Keep an eye on your inbox for details as the day gets closer.';
    } else {
      msg = "Thank you for letting us know. We'll miss you, and we're grateful you're in our lives.";
    }
    stepDone.innerHTML = '<div class="rsvp__done"><h3>Thank you</h3><p>' + msg + '</p>' +
      '<p style="margin-top:22px"><button class="rsvp__back" id="rsvpAgainBtn">Submit another RSVP</button></p></div>';
    document.getElementById('rsvpAgainBtn').addEventListener('click', function () {
      nameInput.value = ''; searchMsg.textContent = ''; searchMsg.className = 'rsvp__msg';
      show(stepSearch);
    });
    show(stepDone);
  }
})();
