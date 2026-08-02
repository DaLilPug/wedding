/* =========================================================
   site.js — v2 experience
   Envelope entry → hero entrance → scroll reveals → countdown
   ========================================================= */
(function () {
  var cfg = window.WEDDING_CONFIG || {};
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- catch placeholder images that errored before handlers ran ---- */
  function sweepPhotos() {
    document.querySelectorAll('[data-photo] img').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) {
        var box = img.closest('[data-photo]');
        if (box) box.classList.add('photo--missing');
      }
    });
  }

  /* ---- envelope ---- */
  var envelope = document.getElementById('envelope');
  var opened = false;
  function openEnvelope() {
    if (opened) return;
    opened = true;
    if (reduced) {
      envelope.classList.add('is-open');
      document.body.classList.remove('is-sealed');
      document.body.classList.add('is-entered');
      return;
    }
    envelope.classList.add('is-opening');
    setTimeout(function () {
      envelope.classList.add('is-open');
      document.body.classList.remove('is-sealed');
    }, 2250);
    setTimeout(function () {
      document.body.classList.add('is-entered');
    }, 2500);
  }
  if (envelope) {
    envelope.addEventListener('click', openEnvelope);
    envelope.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnvelope(); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    sweepPhotos();

    /* ---- nav ---- */
    var nav = document.getElementById('nav');
    function onScroll() {
      if (window.scrollY > 40) nav.classList.add('nav--solid');
      else nav.classList.remove('nav--solid');
      railProgress();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var toggle = document.getElementById('navToggle');
    var links = document.getElementById('navLinks');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = document.body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          document.body.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    /* ---- countdown ---- */
    var target = cfg.weddingDateISO ? new Date(cfg.weddingDateISO).getTime() : null;
    var elD = document.getElementById('cdDays'), elH = document.getElementById('cdHours'),
        elM = document.getElementById('cdMins'), elS = document.getElementById('cdSecs');
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function tick() {
      if (!target || !elD) return;
      var diff = target - Date.now();
      if (diff <= 0) {
        var cd = document.getElementById('countdown');
        if (cd) cd.innerHTML = '<p style="font-family:var(--serif);font-size:28px;margin:0">Today we celebrate.</p>';
        return;
      }
      var s = Math.floor(diff / 1000);
      elD.textContent = Math.floor(s / 86400);
      elH.textContent = pad(Math.floor((s % 86400) / 3600));
      elM.textContent = pad(Math.floor((s % 3600) / 60));
      elS.textContent = pad(s % 60);
    }
    tick();
    setInterval(tick, 1000);

    /* ---- scroll reveals ---- */
    var reveals = document.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window && !reduced) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
        });
      }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
      reveals.forEach(function (r) { io.observe(r); });
    } else {
      reveals.forEach(function (r) { r.classList.add('in-view'); });
    }

    /* ---- timeline rail fill ---- */
    var rail = document.getElementById('railFill');
    var tl = document.getElementById('timeline');
    function railProgress() {
      if (!rail || !tl) return;
      var rect = tl.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var progress = (vh * 0.78 - rect.top) / rect.height;
      rail.style.height = Math.max(0, Math.min(1, progress)) * 100 + '%';
    }
    railProgress();
  });

  /* late image errors (slow networks) */
  window.addEventListener('load', sweepPhotos);
})();
