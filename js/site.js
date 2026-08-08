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
    var navSolid = null;
    function onScroll() {
      var solid = (window.scrollY || document.documentElement.scrollTop) > 40;
      if (solid !== navSolid) {          /* only touch the DOM when it changes */
        navSolid = solid;
        nav.classList.toggle('nav--solid', solid);
      }
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

    /* ---- in-page anchors: land below the fixed nav, after layout settles ---- */
    function navHeight() {
      var n = document.getElementById('nav');
      return n ? n.getBoundingClientRect().height : 60;
    }
    function scrollToTarget(el, smooth) {
      if (!el) return;
      var wanted = function () {
        return Math.max(0, el.getBoundingClientRect().top +
          (window.scrollY || document.documentElement.scrollTop) - navHeight() - 14);
      };
      var go = function (behavior) {
        window.scrollTo({ top: wanted(), behavior: behavior });
      };
      requestAnimationFrame(function () {
        go(smooth === false ? 'auto' : 'smooth');
        /* lazy images and fonts can grow the page mid-scroll, which used to
           leave the target short - re-aim until it settles */
        var tries = 0;
        var fix = setInterval(function () {
          tries++;
          var y = wanted();
          var now = window.scrollY || document.documentElement.scrollTop;
          if (Math.abs(y - now) > 6) go(tries > 4 ? 'auto' : 'smooth');
          if (tries >= 10) clearInterval(fix);
        }, 220);
      });
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      document.body.classList.remove('nav-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      scrollToTarget(el);
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
    /* arriving with a hash (or from another page) lands correctly too */
    if (location.hash.length > 1) {
      var deep = document.getElementById(location.hash.slice(1));
      if (deep) {
        scrollToTarget(deep, false);
        window.addEventListener('load', function () { setTimeout(function () { scrollToTarget(deep, false); }, 120); });
      }
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
    function wideScreen() { return window.matchMedia('(min-width:861px)').matches; }
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
        /* the anchored mode only applies where the art is pinned to the
           viewport (mobile hero); in normal flow use the same drift as
           the story painting so scrolling reads the same everywhere */
        if (el.hasAttribute('data-plx-top')) {
          /* hero art: starts exactly where it sits and eases upward as the
             page scrolls, at both sizes, so nothing jumps on first paint */
          var sc = window.scrollY || document.documentElement.scrollTop || 0;
          y = -Math.min(sc * speed, wideScreen() ? 70 : 90);
        } else {
          var mid = r.top + r.height / 2 - vh / 2;
          y = -mid * speed;
        }
        el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
      });
    }
    /* a single scroll listener drives everything, batched into one frame */
    var frameQueued = false;
    function onFrame() {
      frameQueued = false;
      if (!reduced) { plx(); }   /* blooms drift via CSS keyframes, not per-frame JS */
      railProgress();
    }
    function queueFrame() {
      if (!frameQueued) { frameQueued = true; requestAnimationFrame(onFrame); }
    }
    window.addEventListener('scroll', queueFrame, { passive: true });
    window.addEventListener('resize', queueFrame, { passive: true });
    if (plxEls.length && !reduced) plx();

    /* ---- colour blooms drift with the scroll ---- */
    var bloomHosts = [].slice.call(document.querySelectorAll('.section, .band, .hero--painted'));
    var bloomEls = [].slice.call(document.querySelectorAll('.hero--painted .wash-blob'));
    function blooms() {
      if (reduced) return;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      bloomHosts.forEach(function (host) {
        var r = host.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var mid = r.top + r.height / 2 - vh / 2;
        host.style.setProperty('--bloom-y', (-mid * 0.06).toFixed(1) + 'px');
      });
      bloomEls.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var mid = r.top + r.height / 2 - vh / 2;
        el.style.setProperty('--bloom-y', (-mid * 0.05).toFixed(1) + 'px');
      });
    }
    /* blurred, blended layers are expensive to move; drift them on
       desktop only and let mobile keep the cheap CSS keyframes */
    if (!reduced && window.matchMedia('(min-width:861px)').matches) {
      blooms();
    } else {
      bloomHosts = []; bloomEls = [];
    }

    /* ---- hero sky wash ends exactly under the painting ---- */
    var heroSec = document.querySelector('.hero--painted');
    var heroArt = document.querySelector('.hero__art');
    function sizeSky() {
      if (!heroSec || !heroArt) return;
      var top = heroArt.getBoundingClientRect().top - heroSec.getBoundingClientRect().top;
      var skyOv = window.matchMedia('(min-width:861px)').matches ? 470 : 200;
      heroSec.style.setProperty('--sky-h', Math.round(top + skyOv) + 'px');
      /* colour washes stop where the painting begins */
      heroSec.style.setProperty('--wash-h', Math.max(0, Math.round(top)) + 'px');
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
