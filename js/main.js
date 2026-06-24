/* =========================================================
   main.js  -  nav, countdown, scroll reveals, photo fallback
   ========================================================= */

/* photoMissing() is defined inline in <head> so it exists before any image
   finishes loading. This file only handles the rest of the page behavior. */

document.addEventListener('DOMContentLoaded', function () {
  var cfg = window.WEDDING_CONFIG || {};

  /* Catch any placeholder images that already errored before their handler ran */
  document.querySelectorAll('[data-photo] img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && typeof photoMissing === 'function') photoMissing(img);
  });

  /* ---- Formatted dates from the config date ---- */
  if (cfg.weddingDateISO) {
    var d = new Date(cfg.weddingDateISO);
    if (!isNaN(d)) {
      var full = d.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      ['heroDate', 'detailsDate'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = full;
      });
    }
  }

  /* ---- Nav: solid on scroll ---- */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (window.scrollY > 60) nav.classList.add('nav--solid');
    else nav.classList.remove('nav--solid');
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- Mobile nav toggle ---- */
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

  /* ---- Countdown ---- */
  var target = cfg.weddingDateISO ? new Date(cfg.weddingDateISO).getTime() : null;
  var elDays = document.getElementById('cdDays');
  var elHours = document.getElementById('cdHours');
  var elMins = document.getElementById('cdMins');
  var elSecs = document.getElementById('cdSecs');

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function tick() {
    if (!target || !elDays) return;
    var diff = target - Date.now();
    var cd = document.getElementById('countdown');
    if (diff <= 0) {
      if (cd) cd.innerHTML = '<p style="font-family:var(--serif);font-size:30px;margin:0">Today we celebrate.</p>';
      return;
    }
    var s = Math.floor(diff / 1000);
    elDays.textContent = Math.floor(s / 86400);
    elHours.textContent = pad(Math.floor((s % 86400) / 3600));
    elMins.textContent = pad(Math.floor((s % 3600) / 60));
    elSecs.textContent = pad(s % 60);
  }
  tick();
  setInterval(tick, 1000);

  /* ---- Reveal on scroll ---- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add('in-view'); });
  }
});
