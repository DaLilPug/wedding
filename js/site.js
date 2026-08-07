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

    /* ---- Call Austin (a joke) ---- */
    var jokeLink = document.getElementById('navCallAustin');
    var jokeBox = document.getElementById('jokeBox');
    if (jokeLink && jokeBox) {
      function jokeOpen(e) {
        e.preventDefault();
        document.body.classList.remove('nav-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        jokeBox.hidden = false;
        document.body.classList.add('joke-open');
        var c = document.getElementById('jokeClose');
        if (c) c.focus();
      }
      function jokeClose() {
        jokeBox.hidden = true;
        document.body.classList.remove('joke-open');
      }
      jokeLink.addEventListener('click', jokeOpen);
      document.getElementById('jokeClose').addEventListener('click', jokeClose);
      document.getElementById('jokeToFaq').addEventListener('click', jokeClose);
      jokeBox.addEventListener('click', function (e) { if (e.target === jokeBox) jokeClose(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !jokeBox.hidden) jokeClose();
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

    /* ---- hero sky wash ends exactly under the painting ---- */
    var heroSec = document.querySelector('.hero--painted');
    var heroArt = document.querySelector('.hero__art');
    function sizeSky() {
      if (!heroSec || !heroArt) return;
      var top = heroArt.getBoundingClientRect().top - heroSec.getBoundingClientRect().top;
      var skyOv = window.matchMedia('(min-width:861px)').matches ? 470 : 200;
      heroSec.style.setProperty('--sky-h', Math.round(top + skyOv) + 'px');
    }
    sizeSky();
    window.addEventListener('resize', sizeSky, { passive: true });
    window.addEventListener('load', sizeSky);

    /* ---- story video: play only in view, honor reduced motion ---- */
    var vid = document.getElementById('storyVideo');
    if (vid) {
      vid.muted = true;
      vid.defaultPlaybackRate = 0.5;
      vid.playbackRate = 0.5;
      if (reduced) {
        vid.removeAttribute('autoplay');
        vid.pause();
      } else if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
            else vid.pause();
          });
        }, { threshold: 0.15 }).observe(vid);
      }
    }

    /* ---- gallery lightbox ---- */
    var gphotos = [].slice.call(document.querySelectorAll('.gallery__grid .photo img'));
    if (gphotos.length) {
      var lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-label', 'Photo viewer');
      lb.innerHTML = '<button class="lightbox__close" aria-label="Close">&times;</button>' +
        '<button class="lightbox__nav lightbox__nav--prev" aria-label="Previous photo">&#8249;</button>' +
        '<img class="lightbox__img" alt="" />' +
        '<button class="lightbox__nav lightbox__nav--next" aria-label="Next photo">&#8250;</button>';
      document.body.appendChild(lb);
      var lbImg = lb.querySelector('.lightbox__img');
      var lbCur = 0;
      function lbShow(i) {
        lbCur = (i + gphotos.length) % gphotos.length;
        lbImg.src = gphotos[lbCur].src;
        lbImg.alt = gphotos[lbCur].alt || '';
      }
      function lbClose() {
        lb.classList.remove('is-open');
        document.body.classList.remove('lightbox-open');
      }
      gphotos.forEach(function (img, i) {
        img.closest('.photo').addEventListener('click', function () {
          lbShow(i);
          document.body.classList.add('lightbox-open');
          lb.classList.add('is-open');
          lb.querySelector('.lightbox__close').focus();
        });
      });
      lb.querySelector('.lightbox__close').addEventListener('click', lbClose);
      lb.querySelector('.lightbox__nav--prev').addEventListener('click', function (e) { e.stopPropagation(); lbShow(lbCur - 1); });
      lb.querySelector('.lightbox__nav--next').addEventListener('click', function (e) { e.stopPropagation(); lbShow(lbCur + 1); });
      lb.addEventListener('click', function (e) { if (e.target === lb) lbClose(); });
      document.addEventListener('keydown', function (e) {
        if (!lb.classList.contains('is-open')) return;
        if (e.key === 'Escape') lbClose();
        if (e.key === 'ArrowLeft') lbShow(lbCur - 1);
        if (e.key === 'ArrowRight') lbShow(lbCur + 1);
      });
    }

    /* ---- map: swap in an address card if the embed is blocked ----
       An aborted iframe still fires `load`, so we probe whether Google
       Maps is reachable at all (ad/tracker blockers reject the request).
       Probed on load so it never depends on scroll or observer timing. */
    var vmap = document.getElementById('venueMap');
    var vfall = document.getElementById('venueMapFallback');
    if (vmap && vfall && window.fetch) {
      fetch('https://www.google.com/maps?output=embed', { mode: 'no-cors', cache: 'no-store' })
        .catch(function () {
          var box = vmap.closest('.venue__map');
          if (box) box.classList.add('venue__map--failed');
          vfall.hidden = false;
        });
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
