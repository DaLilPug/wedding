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
      { id: 'demo-1', name: 'Austin Sabella', attending: null, role: 'Groom', phone_hint: '5396', has_email: false, has_address: false },
      { id: 'demo-2', name: 'Anastasiia Oliinyk', attending: null, role: null, phone_hint: null, has_email: false, has_address: false }
    ]},
    { party_key: 'demo-smith', members: [
      { id: 'demo-3', name: 'Jordan Smith', attending: true, role: null, phone_hint: '1234', has_email: true, has_address: false, responded_at: '2026-08-01T18:00:00Z' },
      { id: 'demo-4', name: 'Guest of Jordan Smith', attending: false, role: null, phone_hint: null, has_email: true, has_address: false, responded_at: '2026-08-01T18:00:00Z' }
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

  async function submitRsvp(partyKey, responses, email, phone, note, address) {
    if (sb) {
      var res = await sb.rpc('submit_rsvp', {
        p_party_key: partyKey, p_responses: responses,
        p_email: email || '', p_phone: phone || '', p_note: note || '',
        p_address: address || ''
      });
      if (res.error && res.error.code === 'PGRST202') {
        // database not migrated yet: fall back to the older signature
        res = await sb.rpc('submit_rsvp', {
          p_party_key: partyKey, p_responses: responses,
          p_email: email || '', p_phone: phone || '', p_note: note || ''
        });
      }
      if (res.error) { console.error(res.error); throw res.error; }
      return;
    }
    console.log('[DEMO] RSVP submitted:', { partyKey: partyKey, responses: responses, email: email, phone: phone, note: note, address: address });
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
        if (hasResponded(parties[0])) renderAlready(parties[0]); else renderRespond(parties[0]);
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
      b.addEventListener('click', function () {
        var p = parties[+b.getAttribute('data-i')];
        if (hasResponded(p)) renderAlready(p); else renderRespond(p);
      });
    });
    show(stepRespond);
  }

  function phoneHintPresent(party) {
    return (party.members || []).some(function (m) { return !!m.phone_hint; });
  }

  /* ---- Step 2: respond ---- */
  var ROLE_LINES = {
    'default': "You're not just a guest - you're on the crew running this thing.",
    'Officiant': 'No pressure, but the whole "married" part runs through you.',
    'Master of Ceremony': 'The microphone will find you. Be ready.',
    'Man of Honor': 'Chief of staff, hype captain, keeper of the rings vibe.',
    'Mother of the Groom': 'VIP seating, first hugs, zero chores that day.',
    'Father of the Groom': 'VIP seating, first hugs, zero chores that day.',
    'Mother of the Bride': 'VIP seating, first hugs, zero chores that day.',
    'Father of the Bride': 'VIP seating, first hugs, zero chores that day.',
    'Sister of the Bride': 'Front row, on call for happy tears.',
    'Brother of the Groom': 'Front row, on call for high fives.'
  };

  function hasResponded(party) {
    return (party.members || []).some(function (m) { return m.attending === true || m.attending === false; });
  }

  function respondedOn(party) {
    var stamps = (party.members || []).map(function (m) { return m.responded_at; }).filter(Boolean).sort();
    if (!stamps.length) return '';
    var d = new Date(stamps[stamps.length - 1]);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* ---- Already answered: show it plainly, offer an edit ---- */
  function renderAlready(party) {
    var when = respondedOn(party);
    var anyYes = party.members.some(function (m) { return m.attending === true; });
    var html = '<p class="rsvp__found">You already RSVP&#39;d</p>' +
      '<p class="rsvp__sub">' + (when ? 'Received ' + esc(when) : 'Thank you') + '</p>' +
      '<div class="rsvp__already">';
    party.members.forEach(function (m) {
      var yes = m.attending === true, no = m.attending === false;
      html += '<div class="rsvp__already-row">' +
        '<span class="rsvp__already-name">' + esc(m.name) + '</span>' +
        '<span class="rsvp__already-pill' + (yes ? ' is-yes' : (no ? ' is-no' : '')) + '">' +
        (yes ? 'Attending' : (no ? 'Not attending' : 'No answer yet')) + '</span>' +
        '</div>';
    });
    html += '</div>' +
      '<p class="rsvp__already-note">' +
      (anyYes ? 'We have you down and we cannot wait. Plans change - you can update this any time.'
              : 'We have your answer. If anything changes, you can update it here.') +
      '</p>' +
      '<div class="rsvp__actions">' +
      '<button class="btn btn--primary" id="rsvpEditBtn">Edit our RSVP</button>' +
      '<button class="rsvp__back" id="rsvpBackBtn2">Search a different name</button></div>';
    stepRespond.innerHTML = html;
    document.getElementById('rsvpEditBtn').addEventListener('click', function () { renderRespond(party, true); });
    document.getElementById('rsvpBackBtn2').addEventListener('click', function () {
      nameInput.value = ''; searchMsg.textContent = ''; searchMsg.className = 'rsvp__msg';
      show(stepSearch);
    });
    show(stepRespond);
  }

  function renderRespond(party, isEdit) {
    var names = party.members.map(function (m) { return esc(m.name); }).join(' & ');
    var meals = Array.isArray(cfg.mealOptions) ? cfg.mealOptions : [];
    var roles = party.members.filter(function (m) { return m.role; });
    var phoneHint = null, emailHint = null, hasEmail = false, hasAddress = false;
    party.members.forEach(function (m) {
      if (m.phone_hint && !phoneHint) phoneHint = m.phone_hint;
      if (m.email_hint && !emailHint) emailHint = m.email_hint;
      if (m.has_email) hasEmail = true;
      if (m.has_address) hasAddress = true;
    });

    var html = '<p class="rsvp__found">We found you</p>' +
      '<p class="rsvp__sub">' + names + '</p>';

    party.members.forEach(function (m) {
      html += '<div class="guest-row" data-id="' + esc(m.id) + '">' +
        '<p class="guest-row__name">' + esc(m.name) +
        (m.role ? ' <span class="guest-row__role">' + esc(m.role) + '</span>' : '') +
        '</p>';
      if (m.role) {
        var line = ROLE_LINES[m.role] || ROLE_LINES['default'];
        html += '<p class="guest-row__roleline">' + esc(line) + '</p>';
      }
      html += '<div class="attend">' +
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

    /* contact details reveal once everyone has answered */
    html += '<div class="rsvp__contact" id="rsvpContact" hidden>' +
      '<p class="rsvp__contact-head">One last thing - where do we reach you?</p>';

    var phoneMask = phoneHint ? '(•••) •••-' + phoneHint : '';
    html += '<div class="field">' +
      '<label class="field__label" for="rsvpPhone">Mobile number</label>' +
      '<input id="rsvpPhone" type="tel" autocomplete="tel"' +
        (phoneMask
          ? ' value="' + esc(phoneMask) + '" data-masked="1" placeholder="(555) 555-5555"'
          : ' placeholder="(555) 555-5555"') +
      ' />' +
      (phoneMask
        ? '<p class="field__hint">We have a phone on file - only fill this in to update it.</p>'
        : '<p class="field__hint">So wedding-day updates can reach you by text.</p>') +
      '</div>';

    var emailMask = emailHint || '';
    html += '<div class="field">' +
      '<label class="field__label" for="rsvpEmail">Email</label>' +
      '<input id="rsvpEmail" type="' + (emailMask ? 'text' : 'email') + '" autocomplete="email"' +
        (emailMask
          ? ' value="' + esc(emailMask) + '" data-masked="1" placeholder="you@email.com"'
          : ' placeholder="you@email.com"') +
      ' />' +
      (emailMask
        ? '<p class="field__hint">We have an email on file - only fill this in to update it.</p>'
        : '<p class="field__hint">For reminders and details as the day gets closer.</p>') +
      '</div>';

    if (cfg.askNote) {
      html += '<div class="field">' +
        '<label class="field__label" for="rsvpNote">A note for us <span style="opacity:.6">(optional)</span></label>' +
        '<textarea id="rsvpNote" placeholder="Song requests, dietary needs, or just say hi..."></textarea></div>';
    }
    html += '</div>';

    html += '<p class="rsvp__msg" id="rsvpRespondMsg" role="status"></p>' +
      '<div class="rsvp__actions">' +
      '<button class="btn btn--primary" id="rsvpSubmitBtn">' + (isEdit ? 'Update RSVP' : 'Send RSVP') + '</button>' +
      '<button class="rsvp__back" id="rsvpBackBtn">Start over</button></div>';

    stepRespond.innerHTML = html;

    party._hasEmail = hasEmail;
    party._hasAddress = hasAddress;

    // attend toggle behavior + progressive contact reveal
    function wireMask(el, mask, restoreType) {
      if (!el || !el.getAttribute('data-masked')) return;
      el.addEventListener('focus', function () {
        if (el.getAttribute('data-masked')) {
          el.value = '';
          el.removeAttribute('data-masked');
          el.classList.add('is-editing');
          if (restoreType) el.type = restoreType;
        }
      });
      el.addEventListener('blur', function () {
        if (!el.value.trim()) {
          if (restoreType) el.type = 'text';
          el.value = mask;
          el.setAttribute('data-masked', '1');
          el.classList.remove('is-editing');
        }
      });
    }
    wireMask(document.getElementById('rsvpPhone'), phoneMask);
    wireMask(document.getElementById('rsvpEmail'), emailMask, 'email');

    var contact = document.getElementById('rsvpContact');
    function maybeReveal() {
      var rows = stepRespond.querySelectorAll('.guest-row');
      var all = true;
      rows.forEach(function (r) { if (!r.getAttribute('data-attending')) all = false; });
      if (all && contact.hidden) {
        contact.hidden = false;
        contact.classList.add('is-in');
        contact.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    stepRespond.querySelectorAll('.guest-row').forEach(function (row) {
      var meal = row.querySelector('.guest-meal');
      row.querySelectorAll('.attend button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = btn.getAttribute('data-v');
          row.setAttribute('data-attending', v);
          row.querySelectorAll('.attend button').forEach(function (b) { b.classList.remove('is-yes', 'is-no'); });
          btn.classList.add(v === 'yes' ? 'is-yes' : 'is-no');
          if (meal) meal.hidden = (v !== 'yes');
          maybeReveal();
        });
      });
    });

    if (isEdit) {
      party.members.forEach(function (m) {
        if (m.attending === true || m.attending === false) {
          var row = stepRespond.querySelector('.guest-row[data-id="' + m.id + '"]');
          if (!row) return;
          var v = m.attending ? 'yes' : 'no';
          var btn = row.querySelector('.attend button[data-v="' + v + '"]');
          if (btn) btn.click();
        }
      });
    }

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

    var emailField = document.getElementById('rsvpEmail');
    var email = (emailField && !emailField.getAttribute('data-masked')) ? emailField.value : '';
    var phoneField = document.getElementById('rsvpPhone');
    var phone = (phoneField && !phoneField.getAttribute('data-masked')) ? phoneField.value : '';
    var noteEl = document.getElementById('rsvpNote');
    var note = noteEl ? noteEl.value : '';

    var anyYes = responses.some(function (r) { return r.attending; });
    if (anyYes && !party._hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      msg.textContent = 'Please add an email so we can send you reminders.';
      msg.classList.add('rsvp__msg--err');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      msg.textContent = 'That email does not look quite right - mind checking it?';
      msg.classList.add('rsvp__msg--err');
      return;
    }
    if (anyYes && !phoneHintPresent(party) && phone.replace(/\D/g, '').length < 10) {
      msg.textContent = 'Please add a mobile number so wedding-day updates can reach you.';
      msg.classList.add('rsvp__msg--err');
      return;
    }

    btn.disabled = true;
    msg.textContent = 'Sending...';
    try {
      await submitRsvp(party.party_key, responses, email.trim(), phone.trim(), note.trim(), '');
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
    var toRegistry = coming.length > 0;
    stepDone.innerHTML = '<div class="rsvp__done"><h3>Thank you</h3><p>' + msg + '</p>' +
      (toRegistry
        ? '<p class="rsvp__done-next">One more thing: our registry is a house fund, and your gift also votes on which state we end up in. Taking you there now.</p>' +
          '<p style="margin-top:18px"><a class="btn btn--primary" href="/registry/">See the house fund</a></p>'
        : '') +
      '<p style="margin-top:22px"><button class="rsvp__back" id="rsvpAgainBtn">Submit another RSVP</button></p></div>';
    document.getElementById('rsvpAgainBtn').addEventListener('click', function () {
      nameInput.value = ''; searchMsg.textContent = ''; searchMsg.className = 'rsvp__msg';
      show(stepSearch);
    });
    show(stepDone);
    if (toRegistry) {
      setTimeout(function () {
        if (!stepDone.hidden) window.location.href = '/registry/?from=rsvp';
      }, 3200);
    }
  }
})();
