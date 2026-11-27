/*
 * Shangri La - Lottery experience
 *
 * Replaces the wheel presentation on the lottery page with a responsive
 * lottery dashboard. The available ticket count starts from the existing
 * "N Spin" value and can be refreshed by calling:
 *
 *   window.__shangrilaLotteryTickets.setTickets(12)
 *
 * Remove the enhancement with:
 *   window.__shangrilaLotteryTickets.destroy()
 */
(function shangrilaLotteryTickets() {
  'use strict';

  var VERSION = '2026-11-27-v3-overlay-fix';
  var STYLE_ID = 'shangrila-lottery-experience-style';
  var ROOT_SELECTOR = '[class*="wheelWrapper_content"]';
  var COUNT_SELECTOR = '[class*="spinCount"]';
  var ROOT_MARKER = 'data-shangrila-lottery-root';
  var SOURCE_HIDDEN_MARKER = 'data-shangrila-lottery-source-hidden';

  if (window.__shangrilaLotteryTickets) {
    if (window.__shangrilaLotteryTickets.version === VERSION) return;
    window.__shangrilaLotteryTickets.destroy();
  }

  var state = {
    observer: null,
    retryTimer: null,
    root: null,
    overlay: null,
    ticketCount: null
  };

  window.__shangrilaLotteryTickets = {
    version: VERSION,
    mount: mount,
    setTickets: setTickets,
    getTickets: function () { return state.ticketCount; },
    destroy: destroy
  };

  injectStyles();
  mount();

  state.observer = new MutationObserver(function (mutations) {
    // Ignore mutations caused by updating our own overlay. React changes in
    // the hidden source tree still pass through and refresh the balance.
    if (state.overlay && mutations.every(function (mutation) {
      return state.overlay.contains(mutation.target);
    })) return;
    mount();
  });
  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  var attempts = 0;
  state.retryTimer = window.setInterval(function () {
    mount();
    attempts += 1;
    if (attempts >= 30) window.clearInterval(state.retryTimer);
  }, 500);

  function mount() {
    var root = document.querySelector(ROOT_SELECTOR);
    if (!root) return false;

    if (state.root !== root) {
      restorePreviousRoot();
      state.root = root;
      state.ticketCount = readNumber(root.querySelector(COUNT_SELECTOR));
    } else {
      // React can update the original counter after the route mounts. Re-read
      // it without ever touching the React-owned markup.
      var liveCount = readNumber(root.querySelector(COUNT_SELECTOR));
      if (liveCount !== null && liveCount !== state.ticketCount) state.ticketCount = liveCount;
    }

    hideSource(root);
    if (!state.overlay || !document.body.contains(state.overlay)) render(root);
    updateTicketCount();
    return true;
  }

  function setTickets(value) {
    var count = normalizeCount(value);
    if (count === null) throw new TypeError('Lottery ticket count must be a non-negative number.');
    state.ticketCount = count;
    if (!state.root) mount();
    updateTicketCount();
    return count;
  }

  function render(root) {
    hideSource(root);
    var overlay = document.createElement('div');
    overlay.className = 'shangrila-lottery-root shangrila-lottery-overlay';
    overlay.setAttribute(ROOT_MARKER, 'true');
    overlay.innerHTML = [
      '<main class="shangrila-lottery-page" aria-label="Lottery dashboard">',
        '<section class="shangrila-lottery-hero">',
          '<div class="shangrila-lottery-orbit shangrila-lottery-orbit-one" aria-hidden="true"></div>',
          '<div class="shangrila-lottery-orbit shangrila-lottery-orbit-two" aria-hidden="true"></div>',
          '<div class="shangrila-lottery-hero-copy">',
            '<p class="shangrila-lottery-eyebrow">SHANGRI LA LOTTERY</p>',
            '<h1>Every ticket brings you closer to the win.</h1>',
            '<p class="shangrila-lottery-hero-text">Use your earned entries in the next draw and keep your lucky streak moving.</p>',
            '<div class="shangrila-lottery-draw-meta">',
              '<span class="shangrila-lottery-live-dot" aria-hidden="true"></span>',
              '<span>Next draw is coming soon</span>',
            '</div>',
          '</div>',
          '<div class="shangrila-lottery-ticket-panel">',
            '<div class="shangrila-lottery-ticket-panel-top">',
              '<span>AVAILABLE TICKETS</span>',
              '<span class="shangrila-lottery-ticket-mark" aria-hidden="true">#</span>',
            '</div>',
            '<strong class="shangrila-lottery-ticket-count-value">0</strong>',
            '<span class="shangrila-lottery-ticket-label">Lottery tickets</span>',
            '<div class="shangrila-lottery-ticket-panel-foot">',
              '<span class="shangrila-lottery-ticket-status-dot" aria-hidden="true"></span>',
              '<span>Ready for the next draw</span>',
            '</div>',
          '</div>',
        '</section>',
        '<section class="shangrila-lottery-summary" aria-label="Lottery summary">',
          '<div class="shangrila-lottery-summary-item">',
            '<span class="shangrila-lottery-summary-label">DRAW STATUS</span>',
            '<strong>Open for entries</strong>',
            '<span>Tickets are counted automatically</span>',
          '</div>',
          '<div class="shangrila-lottery-summary-divider" aria-hidden="true"></div>',
          '<div class="shangrila-lottery-summary-item">',
            '<span class="shangrila-lottery-summary-label">YOUR CHANCE</span>',
            '<strong>More tickets, more chances</strong>',
            '<span>Every entry has the same odds</span>',
          '</div>',
          '<div class="shangrila-lottery-summary-divider" aria-hidden="true"></div>',
          '<div class="shangrila-lottery-summary-item">',
            '<span class="shangrila-lottery-summary-label">REWARDS</span>',
            '<strong>Exclusive prizes</strong>',
            '<span>Reward details appear after the draw</span>',
          '</div>',
        '</section>',
        '<section class="shangrila-lottery-section">',
          '<div class="shangrila-lottery-section-heading">',
            '<div>',
              '<p class="shangrila-lottery-eyebrow">REWARD BOARD</p>',
              '<h2>What you could win</h2>',
            '</div>',
            '<span class="shangrila-lottery-section-note">Updated for the next draw</span>',
          '</div>',
          '<div class="shangrila-lottery-prize-grid">',
            prizeCard('01', 'Grand draw', 'The headline reward', 'Top-tier prize for the lucky ticket'),
            prizeCard('02', 'Lucky draw', 'A surprise reward', 'A second chance to take home a win'),
            prizeCard('03', 'Daily reward', 'Instant bonus', 'Small wins that keep the fun going'),
          '</div>',
        '</section>',
        '<section class="shangrila-lottery-how-it-works">',
          '<div class="shangrila-lottery-section-heading">',
            '<div>',
              '<p class="shangrila-lottery-eyebrow">HOW IT WORKS</p>',
              '<h2>Your path to the draw</h2>',
            '</div>',
          '</div>',
          '<div class="shangrila-lottery-steps">',
            stepCard('01', 'Earn tickets', 'Play eligible games and collect entries automatically.'),
            stepCard('02', 'Check your balance', 'Your available ticket count stays visible at the top.'),
            stepCard('03', 'Wait for the draw', 'Keep an eye on the next draw and reward updates.'),
          '</div>',
        '</section>',
        '<footer class="shangrila-lottery-footer">',
          '<span>Play responsibly. Terms and conditions apply.</span>',
          '<a href="/en/terms" target="_blank" rel="noopener">Terms and conditions</a>',
        '</footer>',
      '</main>'
    ].join('');
    document.body.appendChild(overlay);
    state.overlay = overlay;
  }

  function prizeCard(number, title, reward, detail) {
    return [
      '<article class="shangrila-lottery-prize-card">',
        '<div class="shangrila-lottery-prize-glow" aria-hidden="true"></div>',
        '<span class="shangrila-lottery-prize-number">', number, '</span>',
        '<div class="shangrila-lottery-prize-badge">', title, '</div>',
        '<h3>', reward, '</h3>',
        '<p>', detail, '</p>',
        '<span class="shangrila-lottery-prize-arrow" aria-hidden="true">→</span>',
      '</article>'
    ].join('');
  }

  function stepCard(number, title, detail) {
    return [
      '<article class="shangrila-lottery-step">',
        '<span class="shangrila-lottery-step-number">', number, '</span>',
        '<h3>', title, '</h3>',
        '<p>', detail, '</p>',
      '</article>'
    ].join('');
  }

  function updateTicketCount() {
    if (!state.overlay || state.ticketCount === null) return;
    var formatted = formatCount(state.ticketCount);
    state.overlay.querySelectorAll('.shangrila-lottery-ticket-count-value').forEach(function (element) {
      element.textContent = String(state.ticketCount);
      element.setAttribute('aria-label', formatted);
    });
    state.overlay.querySelectorAll('.shangrila-lottery-ticket-label').forEach(function (element) {
      element.textContent = state.ticketCount === 1 ? 'Lottery ticket' : 'Lottery tickets';
    });
    state.root.setAttribute('data-shangrila-lottery-tickets', String(state.ticketCount));
  }

  function formatCount(count) {
    return count + ' ' + (count === 1 ? 'Lottery ticket' : 'Lottery tickets');
  }

  function readNumber(element) {
    if (!element) return null;
    var match = String(element.textContent || '').match(/\d[\d,.]*/);
    if (!match) return null;
    return normalizeCount(match[0].replace(/,/g, ''));
  }

  function normalizeCount(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    return Math.floor(number);
  }

  function injectStyles() {
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '\
      [' + SOURCE_HIDDEN_MARKER + '="true"] {\
        display: none !important;\
      }\
\
      .shangrila-lottery-overlay {\
        position: fixed !important;\
        z-index: 1000 !important;\
        top: 56px;\
        right: 0;\
        bottom: 56px;\
        left: 0;\
        overflow: auto !important;\
        overscroll-behavior: contain;\
      }\
\
      .shangrila-lottery-root {\
        position: relative !important;\
        overflow: hidden !important;\
        min-height: 100vh !important;\
        background: #100b26 !important;\
        color: #f8f6ff !important;\
        isolation: isolate;\
      }\
\
      .shangrila-lottery-root::before {\
        content: "";\
        position: absolute;\
        inset: 0;\
        z-index: -2;\
        background: radial-gradient(circle at 12% 8%, rgba(166, 97, 255, .36), transparent 28%),\
          radial-gradient(circle at 88% 18%, rgba(61, 192, 255, .18), transparent 26%),\
          linear-gradient(145deg, #100b26 2%, #1b1040 54%, #110b28 100%);\
      }\
\
      .shangrila-lottery-root::after {\
        content: "";\
        position: absolute;\
        inset: 0;\
        z-index: -1;\
        opacity: .24;\
        pointer-events: none;\
        background-image: radial-gradient(rgba(255,255,255,.7) .7px, transparent .7px);\
        background-size: 22px 22px;\
        mask-image: linear-gradient(to bottom, black, transparent 82%);\
      }\
\
      .shangrila-lottery-page {\
        box-sizing: border-box;\
        width: min(1180px, 100%);\
        margin: 0 auto;\
        padding: clamp(20px, 4vw, 52px) clamp(16px, 4vw, 54px) 28px;\
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\
      }\
\
      .shangrila-lottery-hero {\
        position: relative;\
        display: grid;\
        grid-template-columns: minmax(0, 1fr) minmax(245px, 330px);\
        gap: 30px;\
        align-items: center;\
        min-height: 330px;\
        padding: clamp(28px, 5vw, 60px);\
        overflow: hidden;\
        border: 1px solid rgba(221, 199, 255, .18);\
        border-radius: 28px;\
        background: linear-gradient(118deg, rgba(117, 64, 220, .32), rgba(28, 18, 74, .72) 58%, rgba(15, 11, 39, .88));\
        box-shadow: 0 24px 80px rgba(5, 2, 22, .42), inset 0 1px rgba(255,255,255,.08);\
      }\
\
      .shangrila-lottery-hero-copy { position: relative; z-index: 2; max-width: 590px; }\
      .shangrila-lottery-eyebrow {\
        margin: 0 0 12px;\
        color: #d8b5ff;\
        font-size: 11px;\
        font-weight: 800;\
        letter-spacing: .19em;\
        text-transform: uppercase;\
      }\
      .shangrila-lottery-hero h1 {\
        max-width: 580px;\
        margin: 0;\
        font-size: clamp(34px, 5vw, 64px);\
        line-height: .98;\
        letter-spacing: -.055em;\
      }\
      .shangrila-lottery-hero-text {\
        max-width: 500px;\
        margin: 20px 0 0;\
        color: rgba(247, 242, 255, .72);\
        font-size: 15px;\
        line-height: 1.7;\
      }\
      .shangrila-lottery-draw-meta {\
        display: inline-flex;\
        align-items: center;\
        gap: 9px;\
        margin-top: 25px;\
        padding: 9px 13px;\
        border: 1px solid rgba(255,255,255,.12);\
        border-radius: 999px;\
        background: rgba(10, 7, 29, .28);\
        color: rgba(255,255,255,.78);\
        font-size: 12px;\
      }\
      .shangrila-lottery-live-dot, .shangrila-lottery-ticket-status-dot {\
        width: 7px;\
        height: 7px;\
        border-radius: 50%;\
        background: #55e8af;\
        box-shadow: 0 0 0 5px rgba(85, 232, 175, .12), 0 0 18px rgba(85, 232, 175, .85);\
      }\
      .shangrila-lottery-ticket-panel {\
        position: relative;\
        z-index: 2;\
        min-height: 225px;\
        padding: 24px;\
        border: 1px solid rgba(255,255,255,.2);\
        border-radius: 22px;\
        background: linear-gradient(145deg, rgba(255,255,255,.16), rgba(255,255,255,.04));\
        box-shadow: 0 18px 44px rgba(3, 1, 16, .3), inset 0 1px rgba(255,255,255,.14);\
        backdrop-filter: blur(16px);\
      }\
      .shangrila-lottery-ticket-panel-top, .shangrila-lottery-ticket-panel-foot {\
        display: flex;\
        align-items: center;\
        justify-content: space-between;\
        color: rgba(255,255,255,.68);\
        font-size: 10px;\
        font-weight: 800;\
        letter-spacing: .15em;\
      }\
      .shangrila-lottery-ticket-mark {\
        display: grid;\
        width: 26px;\
        height: 26px;\
        place-items: center;\
        border-radius: 50%;\
        background: rgba(255,255,255,.14);\
        color: #e6c9ff;\
        font-size: 14px;\
      }\
      .shangrila-lottery-ticket-count-value {\
        display: block;\
        margin-top: 26px;\
        color: #fff;\
        font-size: clamp(56px, 8vw, 86px);\
        line-height: .85;\
        letter-spacing: -.075em;\
        text-shadow: 0 0 28px rgba(216, 181, 255, .42);\
      }\
      .shangrila-lottery-ticket-label {\
        display: block;\
        margin-top: 12px;\
        color: #dcbaff;\
        font-size: 16px;\
        font-weight: 700;\
      }\
      .shangrila-lottery-ticket-panel-foot {\
        justify-content: flex-start;\
        gap: 10px;\
        margin-top: 31px;\
        color: rgba(255,255,255,.66);\
        font-size: 11px;\
        letter-spacing: .02em;\
        text-transform: none;\
      }\
      .shangrila-lottery-orbit {\
        position: absolute;\
        border: 1px solid rgba(224, 191, 255, .16);\
        border-radius: 50%;\
        pointer-events: none;\
      }\
      .shangrila-lottery-orbit-one { width: 470px; height: 470px; right: 80px; top: -210px; }\
      .shangrila-lottery-orbit-two { width: 690px; height: 690px; right: -50px; top: -315px; border-color: rgba(91, 213, 255, .11); }\
\
      .shangrila-lottery-summary {\
        display: grid;\
        grid-template-columns: 1fr auto 1fr auto 1fr;\
        align-items: center;\
        gap: 25px;\
        margin-top: 18px;\
        padding: 22px 26px;\
        border: 1px solid rgba(255,255,255,.1);\
        border-radius: 18px;\
        background: rgba(17, 11, 45, .66);\
      }\
      .shangrila-lottery-summary-item { display: grid; gap: 6px; }\
      .shangrila-lottery-summary-label { color: #af8bd7; font-size: 9px; font-weight: 800; letter-spacing: .16em; }\
      .shangrila-lottery-summary-item strong { color: rgba(255,255,255,.94); font-size: 14px; }\
      .shangrila-lottery-summary-item span:last-child { color: rgba(255,255,255,.47); font-size: 11px; }\
      .shangrila-lottery-summary-divider { width: 1px; height: 42px; background: rgba(255,255,255,.11); }\
\
      .shangrila-lottery-section, .shangrila-lottery-how-it-works { margin-top: 46px; }\
      .shangrila-lottery-section-heading {\
        display: flex;\
        align-items: end;\
        justify-content: space-between;\
        gap: 18px;\
        margin-bottom: 18px;\
      }\
      .shangrila-lottery-section-heading .shangrila-lottery-eyebrow { margin-bottom: 8px; }\
      .shangrila-lottery-section-heading h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); letter-spacing: -.04em; }\
      .shangrila-lottery-section-note { color: rgba(255,255,255,.46); font-size: 12px; }\
      .shangrila-lottery-prize-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }\
      .shangrila-lottery-prize-card {\
        position: relative;\
        min-height: 190px;\
        padding: 24px;\
        overflow: hidden;\
        border: 1px solid rgba(255,255,255,.1);\
        border-radius: 20px;\
        background: linear-gradient(145deg, rgba(93, 52, 163, .5), rgba(22, 15, 54, .85));\
        transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;\
      }\
      .shangrila-lottery-prize-card:hover {\
        transform: translateY(-4px);\
        border-color: rgba(218, 182, 255, .36);\
        box-shadow: 0 16px 32px rgba(5, 1, 18, .25);\
      }\
      .shangrila-lottery-prize-glow {\
        position: absolute;\
        width: 140px; height: 140px; right: -40px; top: -40px;\
        border-radius: 50%;\
        background: rgba(211, 169, 255, .17);\
        filter: blur(3px);\
      }\
      .shangrila-lottery-prize-number { position: relative; color: #b997df; font-size: 11px; font-weight: 800; letter-spacing: .14em; }\
      .shangrila-lottery-prize-badge { position: relative; margin-top: 24px; color: #e3c9ff; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }\
      .shangrila-lottery-prize-card h3 { position: relative; margin: 9px 0 0; font-size: 21px; letter-spacing: -.03em; }\
      .shangrila-lottery-prize-card p { position: relative; max-width: 230px; margin: 10px 0 0; color: rgba(255,255,255,.55); font-size: 12px; line-height: 1.55; }\
      .shangrila-lottery-prize-arrow { position: absolute; right: 23px; bottom: 19px; color: #dfbdff; font-size: 20px; }\
\
      .shangrila-lottery-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }\
      .shangrila-lottery-step { padding: 22px; border-top: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.025); }\
      .shangrila-lottery-step-number { color: #65d8ff; font-size: 11px; font-weight: 800; letter-spacing: .16em; }\
      .shangrila-lottery-step h3 { margin: 19px 0 8px; font-size: 17px; }\
      .shangrila-lottery-step p { margin: 0; color: rgba(255,255,255,.5); font-size: 12px; line-height: 1.6; }\
      .shangrila-lottery-footer { display: flex; justify-content: space-between; gap: 15px; margin-top: 52px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.38); font-size: 11px; }\
      .shangrila-lottery-footer a { color: #dcbaff; text-decoration: none; }\
      .shangrila-lottery-footer a:hover { text-decoration: underline; }\
\
      @media (max-width: 760px) {\
        .shangrila-lottery-hero { grid-template-columns: 1fr; min-height: auto; padding: 28px 22px; }\
        .shangrila-lottery-ticket-panel { min-height: 190px; }\
        .shangrila-lottery-summary { grid-template-columns: 1fr; gap: 16px; }\
        .shangrila-lottery-summary-divider { width: 100%; height: 1px; }\
        .shangrila-lottery-prize-grid, .shangrila-lottery-steps { grid-template-columns: 1fr; }\
        .shangrila-lottery-section-heading { align-items: start; flex-direction: column; }\
        .shangrila-lottery-footer { flex-direction: column; }\
      }\
\
      @media (min-width: 761px) {\
        .shangrila-lottery-overlay { top: 72px; bottom: 0; }\
      }\
\
      @media (prefers-reduced-motion: reduce) {\
        .shangrila-lottery-prize-card { transition: none; }\
      }\
    ';
    document.head.appendChild(style);
  }

  function hideSource(root) {
    root.setAttribute(SOURCE_HIDDEN_MARKER, 'true');
  }

  function restorePreviousRoot() {
    if (state.root) state.root.removeAttribute(SOURCE_HIDDEN_MARKER);
    if (state.overlay) state.overlay.remove();
    state.overlay = null;
  }

  function destroy() {
    if (state.observer) state.observer.disconnect();
    if (state.retryTimer) window.clearInterval(state.retryTimer);
    restorePreviousRoot();
    var style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    delete window.__shangrilaLotteryTickets;
  }
})();
