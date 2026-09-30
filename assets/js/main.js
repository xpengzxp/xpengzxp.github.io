/* Xiaopeng Zhang — site motion.
   One requestAnimationFrame loop drives everything: Lenis smooth scroll, the hero
   scatter, velocity "jelly" on cards, the marquee, the timeline line, and the
   cat & dog scrollbar. Without JS (or with reduced motion) the page is static. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  /* ---------- smooth scroll ---------- */
  const lenis = !reduce && typeof window.Lenis === 'function'
    ? new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95, touchMultiplier: 1.3 })
    : null;

  const getScroll = () => (lenis ? lenis.scroll : window.scrollY);
  const getLimit = () => Math.max(1, lenis ? lenis.limit : root.scrollHeight - window.innerHeight);

  function scrollToY(y, { lerpTo } = {}) {
    if (lenis) {
      if (lerpTo) lenis.scrollTo(y, { lerp: lerpTo });
      else lenis.scrollTo(y, { duration: 1.4, easing: easeOutQuart });
    } else {
      window.scrollTo({ top: y, behavior: reduce || lerpTo ? 'auto' : 'smooth' });
    }
  }

  document.querySelectorAll('a[href^="#"]:not(.skip)').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href');
      const target = hash === '#top' ? null : document.querySelector(hash);
      if (hash !== '#top' && !target) return;
      e.preventDefault();
      const anchor = target && (target.querySelector('.sec-head') || target);
      scrollToY(anchor ? anchor.getBoundingClientRect().top + window.scrollY - 96 : 0);
      history.replaceState(null, '', target ? hash : location.pathname);
    });
  });

  /* ---------- split hero name into letters ---------- */
  const chars = [];
  document.querySelectorAll('[data-split]').forEach((line) => {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      s.style.setProperty('--i', chars.length);
      s.addEventListener('animationend', () => {
        s.classList.remove('boing');
        s.classList.add('landed');
      });
      s.addEventListener('pointerenter', () => {
        if (s.classList.contains('landed')) s.classList.add('boing');
      });
      line.appendChild(s);
      chars.push({ el: s, a: Math.random(), b: Math.random() });
    }
  });

  /* ---------- split section headings into words ---------- */
  document.querySelectorAll('[data-words]').forEach((h) => {
    const words = h.textContent.trim().split(/\s+/);
    h.textContent = '';
    words.forEach((w, i) => {
      const outer = document.createElement('span');
      const inner = document.createElement('span');
      outer.className = 'w';
      inner.textContent = w;
      inner.style.setProperty('--i', i);
      outer.appendChild(inner);
      h.appendChild(outer);
      if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
    });
  });

  document.querySelectorAll('[data-stagger]').forEach((list) => {
    [...list.children].forEach((li) => li.setAttribute('data-reveal', ''));
  });

  /* ---------- reveal on scroll ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    let k = 0;
    entries
      .filter((en) => en.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      .forEach((en) => {
        const el = en.target;
        if (el.hasAttribute('data-reveal') && !el.style.getPropertyValue('--d')) {
          el.style.setProperty('--d', `${k++ * 80}ms`);
          setTimeout(() => el.style.removeProperty('--d'), 1800);
        }
        el.classList.add('in');
        revealIO.unobserve(el);
      });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal], .sec-head').forEach((el) => revealIO.observe(el));

  // illustrations replay each time they come back into view
  const playIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.intersectionRatio >= 0.3) en.target.classList.add('play');
      else if (!en.isIntersecting) en.target.classList.remove('play');
    });
  }, { threshold: [0, 0.3] });
  document.querySelectorAll('[data-replay]').forEach((el) => playIO.observe(el));

  /* ---------- things that only animate while on screen ---------- */
  const onScreen = new Set();
  const jellies = [...document.querySelectorAll('[data-jelly]')];
  const marquee = document.querySelector('.marquee');
  const track = marquee && marquee.querySelector('.marquee-track');
  const timeline = document.querySelector('.timeline');
  const visIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) onScreen.add(en.target);
      else {
        onScreen.delete(en.target);
        if (en.target.hasAttribute('data-jelly')) en.target.style.transform = '';
      }
    });
  }, { rootMargin: '15% 0px' });
  [...jellies, marquee, timeline].forEach((el) => el && visIO.observe(el));

  const nav = document.getElementById('nav');
  const hero = document.querySelector('.hero');
  const heroCopy = document.querySelector('.hero-copy');
  const portrait = document.querySelector('.portrait');

  /* ==========================================================================
     Cat & dog scrollbar
     The cat marks the scroll position; the dog chases it. Both ride springs, so
     they lag, overshoot, stretch when fast and squash when they stop.
     ========================================================================== */
  const Pets = (() => {
    const box = document.getElementById('pets');
    if (!box) return null;
    root.classList.add('has-pets');

    const trail = box.querySelector('.pets-trail');
    const bubble = box.querySelector('.pets-bubble');
    const make = (node) => ({
      node,
      pb: node.querySelector('.pb'),
      hd: node.querySelector('.hd'),
      earL: node.querySelector('.el'),
      earR: node.querySelector('.er'),
      tail: node.querySelector('.tl'),
      wl: node.querySelector('.wl'),
      wr: node.querySelector('.wr'),
      h: 1, y: 0, v: 0,
      s: 1, sv: 0,            // vertical scale (squash & stretch)
      ear: 0, earV: 0,
      tailA: 0, tailV: 0,
      phase: Math.random() * 6, wag: 0,
      zoom: false,
      nextBlink: 1.5 + Math.random() * 3,
    });
    const cat = make(box.querySelector('.pet-cat'));
    const dog = make(box.querySelector('.pet-dog'));

    let H = 1, gap = 1, L = 1, dir = 1, time = 0;
    let dragging = false, grabOffset = 0, idle = 10, atBottom = false;
    let bubbleOn = false, bubbleText = '';

    function spring(o, key, vkey, target, k, c, dt) {
      o[vkey] += (k * (target - o[key]) - c * o[vkey]) * dt;
      o[key] += o[vkey] * dt;
    }

    function measure() {
      H = box.clientHeight;
      cat.h = cat.node.offsetHeight || 1;
      dog.h = dog.node.offsetHeight || 1;
      gap = dog.h * 0.9;
      L = Math.max(1, H - cat.h - gap);
    }

    function heart(y) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('class', 'pets-heart');
      s.innerHTML = '<path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2A5.4 5.4 0 0 1 12 5.6a5.4 5.4 0 0 1 9.6 6.2C19.5 16.4 12 21 12 21Z"/>';
      s.style.top = `${y}px`;
      s.addEventListener('animationend', () => s.remove());
      box.appendChild(s);
    }

    function update(dt, p, vel) {
      time += dt;
      const catT = gap + p * L;
      const dogT = catT - gap;

      if (vel > 25) dir = 1;
      else if (vel < -25) dir = -1;

      if (reduce) {
        cat.y = catT; dog.y = dogT; cat.v = dog.v = 0;
      } else {
        // whoever leads the chase is stiff; the follower is floppy
        const stiff = [440, 32], soft = [150, 15];
        const [ck, cc] = dir > 0 ? stiff : soft;
        const [dk, dc] = dir > 0 ? soft : stiff;
        spring(cat, 'y', 'v', catT, ck, cc, dt);
        spring(dog, 'y', 'v', dogT, dk, dc, dt);
      }

      // they bump instead of overlapping
      const minGap = gap * 0.8;
      if (cat.y - dog.y < minGap) {
        if (dir > 0) {
          const hit = dog.v - cat.v;
          dog.y = cat.y - minGap;
          dog.v = Math.min(dog.v, cat.v);
          if (hit > 120) dog.sv -= clamp(hit / 400, 0, 2.5);
        } else {
          const hit = dog.v - cat.v;
          cat.y = dog.y + minGap;
          cat.v = Math.max(cat.v, dog.v);
          if (hit > 120) cat.sv -= clamp(hit / 400, 0, 2.5);
        }
      }
      cat.y = clamp(cat.y, 0, H - cat.h);
      dog.y = clamp(dog.y, 0, H - dog.h);

      for (const o of [cat, dog]) {
        const sp = Math.abs(o.v);
        spring(o, 's', 'sv', reduce ? 1 : 1 + clamp(sp / 1300, 0, 0.45), 320, 11, dt);
        const sy = o.s;
        const sx = 1 - (sy - 1) * 0.55;
        o.phase += dt * (5 + sp / 18);
        const wobble = reduce ? 0 : Math.sin(o.phase) * clamp(sp / 40, 0, 12);
        const bob = reduce ? 0 : Math.sin(o.phase * 2) * clamp(sp / 150, 0, 2.4);
        o.node.style.transform = `translate3d(0, ${o.y.toFixed(2)}px, 0) rotate(${wobble.toFixed(2)}deg)`;
        o.pb.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        o.hd.style.transform = `translate(0px, ${bob.toFixed(2)}px)`;

        const z = o.zoom ? sp > 110 : sp > 280;
        if (z !== o.zoom) { o.zoom = z; o.node.classList.toggle('zoom', z); }

        o.nextBlink -= dt;
        if (o.nextBlink <= 0) {
          o.nextBlink = 2.2 + Math.random() * 4;
          if (!o.zoom) {
            o.node.classList.add('blink');
            setTimeout(() => o.node.classList.remove('blink'), 130);
          }
        }
      }

      // dog: floppy ears fly up when falling, tail wags faster the faster it runs
      spring(dog, 'ear', 'earV', reduce ? 0 : clamp(dog.v / 650, -0.3, 1) * 130, 190, 8, dt);
      const flap = reduce ? 0 : Math.sin(time * 26) * clamp(Math.abs(dog.v) / 90, 0, 7);
      dog.earL.style.transform = `rotate(${(dog.ear + flap).toFixed(2)}deg)`;
      dog.earR.style.transform = `rotate(${(-dog.ear - flap).toFixed(2)}deg)`;
      dog.wag += dt * (reduce ? 0 : 7 + Math.abs(dog.v) / 30);
      dog.tail.style.transform = `rotate(${(Math.sin(dog.wag) * (16 + clamp(Math.abs(dog.v) / 25, 0, 22))).toFixed(2)}deg)`;

      // cat: airplane ears, whiskers bend in the wind, tail swishes when idle
      const cs = reduce ? 0 : clamp(cat.v / 600, -1, 1);
      cat.earL.style.transform = `rotate(${(-Math.abs(cs) * 24).toFixed(2)}deg)`;
      cat.earR.style.transform = `rotate(${(Math.abs(cs) * 24).toFixed(2)}deg)`;
      cat.wl.style.transform = `rotate(${(cs * 24).toFixed(2)}deg)`;
      cat.wr.style.transform = `rotate(${(-cs * 24).toFixed(2)}deg)`;
      const tailT = (reduce ? 0 : Math.sin(time * 2.1) * 10 * (1 - Math.abs(cs))) - cs * 34;
      spring(cat, 'tailA', 'tailV', tailT, 160, 9, dt);
      cat.tail.style.transform = `rotate(${cat.tailA.toFixed(2)}deg)`;

      trail.style.transform = `scaleY(${clamp((cat.y + cat.h * 0.55) / H, 0, 1).toFixed(4)})`;

      // percentage bubble while moving
      idle = Math.abs(vel) > 6 || dragging ? 0 : idle + dt;
      const show = idle < 0.9;
      if (show !== bubbleOn) { bubbleOn = show; bubble.classList.toggle('show', show); }
      if (show) {
        const txt = `${Math.round(p * 100)}%`;
        if (txt !== bubbleText) { bubbleText = txt; bubble.textContent = txt; }
        bubble.style.transform = `translate3d(0, ${(cat.y + cat.h * 0.3).toFixed(1)}px, 0)`;
      }

      // a little heart when they reach the bottom together
      if (p > 0.995 && !atBottom && Math.abs(cat.v) < 80) { atBottom = true; heart(cat.y - 6); }
      else if (p < 0.95) atBottom = false;
    }

    /* drag the pets (or click the rail) to scroll */
    function pointerToScroll(clientY, smooth) {
      const r = box.getBoundingClientRect();
      const p = clamp((clientY - grabOffset - r.top - gap - cat.h * 0.5) / L, 0, 1);
      scrollToY(p * getLimit(), smooth ? {} : { lerpTo: 0.22 });
    }
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      box.classList.add('dragging');
      box.setPointerCapture(e.pointerId);
      if (e.target.closest('.pet')) {
        grabOffset = e.clientY - (box.getBoundingClientRect().top + cat.y + cat.h * 0.5);
      } else {
        grabOffset = 0;
        pointerToScroll(e.clientY, true);
      }
    });
    box.addEventListener('pointermove', (e) => { if (dragging) pointerToScroll(e.clientY, false); });
    const stop = () => { dragging = false; box.classList.remove('dragging'); };
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
    box.addEventListener('lostpointercapture', stop);

    measure();
    const p0 = clamp(getScroll() / getLimit(), 0, 1);
    cat.y = gap + p0 * L;
    dog.y = cat.y - gap;

    return { measure, update };
  })();

  /* ---------- measurements ---------- */
  let heroH = 1, mqHalf = 0;
  function measure() {
    heroH = hero ? Math.max(1, hero.offsetHeight) : 1;
    if (track) {
      const g = parseFloat(getComputedStyle(track).columnGap) || 0;
      mqHalf = (track.scrollWidth + g) / 2;
    }
    if (Pets) Pets.measure();
  }
  measure();
  window.addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

  /* ---------- the loop ---------- */
  let lastT = performance.now();
  let lastY = getScroll();
  let vel = 0, skew = 0, lastSkew = 0, lastHeroP = -1;
  let mqX = 0, mqDir = 1;
  let navHidden = false, navScrolled = false;

  function frame(t) {
    if (lenis) lenis.raf(t);
    const dt = clamp((t - lastT) / 1000, 1 / 240, 1 / 20);
    lastT = t;
    const y = getScroll();
    vel = lerp(vel, (y - lastY) / dt, clamp(dt * 14, 0, 1));
    if (Math.abs(vel) < 0.5) vel = 0;
    lastY = y;

    // nav: tucks away while reading down, returns on the way up
    const scrolled = y > 24;
    if (scrolled !== navScrolled) { navScrolled = scrolled; nav.classList.toggle('is-scrolled', scrolled); }
    const hide = y > 160 && vel > 40 ? true : (vel < -40 || y <= 160 ? false : navHidden);
    if (hide !== navHidden) { navHidden = hide; nav.classList.toggle('is-hidden', hide); }

    // hero: letters scatter upward, portrait tumbles away
    if (!reduce && hero) {
      const p = clamp(y / heroH, 0, 1);
      if (Math.abs(p - lastHeroP) > 0.0005) {
        lastHeroP = p;
        for (const c of chars) {
          c.el.style.transform = p === 0 ? '' :
            `translate3d(0, ${(-p * (30 + c.a * 190)).toFixed(1)}px, 0) rotate(${((c.b - 0.5) * 70 * p).toFixed(2)}deg)`;
        }
        heroCopy.style.opacity = String(1 - clamp((p - 0.15) * 1.5, 0, 1));
        heroCopy.style.transform = p === 0 ? '' : `translate3d(0, ${(-p * 40).toFixed(1)}px, 0)`;
        portrait.style.transform = p === 0 ? '' :
          `translate3d(0, ${(p * 90).toFixed(1)}px, 0) scale(${(1 - p * 0.28).toFixed(3)}) rotate(${(-p * 16).toFixed(2)}deg)`;
      }
    }

    // jelly: cards lean with scroll speed and spring back
    skew = lerp(skew, reduce ? 0 : clamp(vel * 0.0024, -8, 8), clamp(dt * 10, 0, 1));
    if (Math.abs(skew) < 0.01) skew = 0;
    if (skew !== lastSkew) {
      lastSkew = skew;
      for (const el of jellies) {
        if (onScreen.has(el)) el.style.transform = skew ? `skewY(${skew.toFixed(3)}deg)` : '';
      }
    }

    // marquee: drifts with the scroll direction and speeds up with it
    if (track && mqHalf && !reduce && onScreen.has(marquee)) {
      if (vel > 5) mqDir = 1;
      else if (vel < -5) mqDir = -1;
      mqX -= mqDir * (45 + Math.min(Math.abs(vel), 5000) * 0.16) * dt;
      if (mqX <= -mqHalf) mqX += mqHalf;
      else if (mqX > 0) mqX -= mqHalf;
      track.style.transform = `translate3d(${mqX.toFixed(2)}px, 0, 0) skewX(${clamp(-vel * 0.005, -16, 16).toFixed(2)}deg)`;
    }

    // education: accent line grows as you read down the timeline
    if (timeline && onScreen.has(timeline)) {
      const r = timeline.getBoundingClientRect();
      timeline.style.setProperty('--p', clamp((window.innerHeight * 0.62 - r.top) / r.height, 0, 1).toFixed(4));
    }

    if (Pets) Pets.update(dt, clamp(y / getLimit(), 0, 1), vel);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
