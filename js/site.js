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

  document.addEventListener('DOMContentLoaded', function () {
    sweepPhotos();

    /* entrance choreography plays right after first paint */
    setTimeout(function () { document.body.classList.add('is-entered'); }, reduced ? 0 : 180);

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

    /* ---- parallax paintings ---- */
    var plxEls = [].slice.call(document.querySelectorAll('[data-plx]'));
    var plxTick = false;
    function plx() {
      plxTick = false;
      if (reduced) return;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      plxEls.forEach(function (el) {
        var host = el.parentNode; // measure the untransformed figure
        var r = host.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) return;
        var speed = parseFloat(el.getAttribute('data-plx')) || 0.08;
        var y;
        if (el.hasAttribute('data-plx-top')) {
          /* first-fold art: rest at 0 on load, recede as the page scrolls */
          y = (window.scrollY || document.documentElement.scrollTop || 0) * speed;
        } else {
          var mid = r.top + r.height / 2 - vh / 2;
          y = -mid * speed;
        }
        el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
      });
    }
    function plxQueue() {
      if (!plxTick) { plxTick = true; requestAnimationFrame(plx); }
    }
    if (plxEls.length && !reduced) {
      window.addEventListener('scroll', plxQueue, { passive: true });
      window.addEventListener('resize', plxQueue, { passive: true });
      plx();
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
