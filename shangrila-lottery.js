/*
 * Shangri La - Lottery experience
 *
 * Replaces the wheel presentation on the lottery page with a responsive
 * lottery dashboard. The available ticket count starts from the existing
 * "N Spin" value and can be refreshed by calling:
 *
 *   window.__shangrilaLotteryTickets.setTickets(12)
 *   window.__shangrilaLotteryTickets.setDrawDate('2026-12-31T20:00:00Z')
 *
 * Remove the enhancement with:
 *   window.__shangrilaLotteryTickets.destroy()
 */
(function shangrilaLotteryTickets() {
  'use strict';

  var VERSION = '2026-11-27-v8-route-image';
  var STYLE_ID = 'shangrila-lottery-experience-style';
  var LOTTERY_ROUTE = '/lottery';
  var LOTTERY_IMAGE_URL = 'https://shangrilavip.com/cms/uploads/2027_NY_Lottery_Thumbnail_20553e12e1.webp';
  var PAGE_CONTENT_SELECTOR = '[data-mj="page-content"]';
  var ROOT_SELECTOR = '[class*="wheelWrapper_content"]';
  var COUNT_SELECTOR = '[class*="spinCount"]';
  var SPINS_ENDPOINT = '/api/wheel/api/v1/UserSpinsSite/wheels/635/get-spins';
  var WHEEL_META_ENDPOINT = '/api/wheel/api/v1/WheelsSite/wheels/635';
  var ROOT_MARKER = 'data-shangrila-lottery-root';

  if (window.__shangrilaLotteryTickets) {
    if (window.__shangrilaLotteryTickets.version === VERSION) return;
    window.__shangrilaLotteryTickets.destroy();
  }

  var state = {
    observer: null,
    retryTimer: null,
    pageContent: null,
    root: null,
    sourceRoot: null,
    overlay: null,
    ticketCount: null,
    drawAt: null,
    drawTimer: null,
    spinsTimer: null,
    spinsRequestId: 0,
    metaTimer: null,
    metaRequestId: 0,
    originalPushState: null,
    originalReplaceState: null
  };

  window.__shangrilaLotteryTickets = {
    version: VERSION,
    mount: mount,
    setTickets: setTickets,
    setDrawDate: setDrawDate,
    getTickets: function () { return state.ticketCount; },
    destroy: destroy
  };

  injectStyles();
  installRouteListeners();
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
  state.spinsTimer = window.setInterval(refreshSpins, 30000);
  state.metaTimer = window.setInterval(refreshWheelMetadata, 30000);

  function installRouteListeners() {
    state.originalPushState = history.pushState;
    state.originalReplaceState = history.replaceState;
    history.pushState = function () {
      var result = state.originalPushState.apply(this, arguments);
      window.dispatchEvent(new Event('shangrila-lottery-route-change'));
      return result;
    };
    history.replaceState = function () {
      var result = state.originalReplaceState.apply(this, arguments);
      window.dispatchEvent(new Event('shangrila-lottery-route-change'));
      return result;
    };
    window.addEventListener('popstate', mount);
    window.addEventListener('shangrila-lottery-route-change', mount);
  }

  function mount() {
    if (!isLotteryRoute()) {
      restorePreviousRoot();
      return false;
    }

    var pageContent = document.querySelector(PAGE_CONTENT_SELECTOR);
    var firstLevel = pageContent && pageContent.firstElementChild;
    var sourceRoot = firstLevel && firstLevel.querySelector(ROOT_SELECTOR);

    if (!sourceRoot) {
      if (state.overlay && pageContent && pageContent.contains(state.overlay)) {
        updateTicketCount();
        updateCountdown();
        return true;
      }
      return false;
    }

    if (state.root !== firstLevel || state.pageContent !== pageContent) {
      restorePreviousRoot();
      state.pageContent = pageContent;
      state.root = firstLevel;
      state.sourceRoot = sourceRoot;
      state.ticketCount = readNumber(sourceRoot.querySelector(COUNT_SELECTOR));
      refreshSpins();
      refreshWheelMetadata();
    } else {
      // React can update the original counter before the first-level node is
      // replaced. Re-read it without modifying the React-owned source tree.
      var liveCount = readNumber(sourceRoot.querySelector(COUNT_SELECTOR));
      if (liveCount !== null && liveCount !== state.ticketCount) state.ticketCount = liveCount;
    }

    if (!state.overlay || !pageContent.contains(state.overlay)) render(firstLevel, sourceRoot, pageContent);
    updateTicketCount();
    updateCountdown();
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

  function setDrawDate(value) {
    var date = value == null || value === '' ? null : new Date(value);
    if (date && Number.isNaN(date.getTime())) throw new TypeError('Draw date must be a valid date.');
    state.drawAt = date;
    updateCountdown();
    if (state.drawTimer) window.clearInterval(state.drawTimer);
    state.drawTimer = date ? window.setInterval(updateCountdown, 1000) : null;
    return date;
  }

  function isLotteryRoute() {
    var pathname = window.location.pathname.replace(/\/+$/, '');
    return pathname === LOTTERY_ROUTE || pathname.slice(-LOTTERY_ROUTE.length) === LOTTERY_ROUTE;
  }

  function refreshSpins() {
    var requestId = ++state.spinsRequestId;
    fetch(SPINS_ENDPOINT, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load lottery ticket count.');
      return response.json();
    }).then(function (payload) {
      if (requestId !== state.spinsRequestId) return;
      var count = extractTicketCount(payload);
      if (count === null) return;
      state.ticketCount = count;
      updateTicketCount();
    }).catch(function () {
      // Keep the last known count or the value rendered by the wheel when the
      // endpoint is unavailable or the player is not authenticated.
    });
  }

  function refreshWheelMetadata() {
    var requestId = ++state.metaRequestId;
    fetch(WHEEL_META_ENDPOINT, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load lottery metadata.');
      return response.json();
    }).then(function (payload) {
      if (requestId !== state.metaRequestId) return;
      var termsTitle = extractTermsTitle(payload);
      var endDate = extractDateFromTitle(termsTitle);
      if (endDate) setDrawDate(endDate);
    }).catch(function () {
      // Keep the placeholder countdown when metadata is unavailable.
    });
  }

  function extractTermsTitle(payload) {
    if (!payload || typeof payload !== 'object') return '';
    var terms = payload.termsAndConditions;
    if (typeof terms === 'string') return terms;
    if (terms && typeof terms.title === 'string') return terms.title;
    if (Array.isArray(terms)) {
      for (var i = 0; i < terms.length; i += 1) {
        if (terms[i] && typeof terms[i].title === 'string') return terms[i].title;
      }
    }
    var nestedKeys = ['data', 'result', 'wheel'];
    for (var j = 0; j < nestedKeys.length; j += 1) {
      var nestedTitle = extractTermsTitle(payload[nestedKeys[j]]);
      if (nestedTitle) return nestedTitle;
    }
    return '';
  }

  function extractDateFromTitle(title) {
    if (!title) return null;
    var text = String(title);
    var isoMatch = text.match(/\b20\d{2}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/);
    if (isoMatch) {
      var isoDate = new Date(isoMatch[0]);
      if (!Number.isNaN(isoDate.getTime())) return isoDate;
    }

    var dmyMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?:[ T](\d{1,2}):?(\d{2})?(?::(\d{2}))?)?\b/);
    if (dmyMatch) {
      var dmyDate = new Date(
        Number(dmyMatch[3]),
        Number(dmyMatch[2]) - 1,
        Number(dmyMatch[1]),
        dmyMatch[4] ? Number(dmyMatch[4]) : 23,
        dmyMatch[5] ? Number(dmyMatch[5]) : 59,
        dmyMatch[6] ? Number(dmyMatch[6]) : 59
      );
      if (!Number.isNaN(dmyDate.getTime())) return dmyDate;
    }

    var parsedDate = new Date(text);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  function extractTicketCount(payload) {
    if (typeof payload === 'number') return normalizeCount(payload);
    if (!payload || typeof payload !== 'object') return null;

    var preferredKeys = [
      'availableTickets', 'lotteryTickets', 'tickets', 'availableSpins',
      'spinCount', 'spins', 'count', 'total'
    ];
    for (var i = 0; i < preferredKeys.length; i += 1) {
      var value = payload[preferredKeys[i]];
      if (typeof value === 'number' || typeof value === 'string') {
        var normalized = normalizeCount(value);
        if (normalized !== null) return normalized;
      }
    }

    var nestedKeys = ['data', 'result', 'userSpins', 'wheelSpins'];
    for (var j = 0; j < nestedKeys.length; j += 1) {
      var nested = payload[nestedKeys[j]];
      var nestedCount = extractTicketCount(nested);
      if (nestedCount !== null) return nestedCount;
    }
    return null;
  }

  function render(host, sourceRoot, pageContent) {
    host.setAttribute('data-shangrila-lottery-source-hidden', 'true');
    var overlay = document.createElement('div');
    overlay.className = 'shangrila-lottery-root shangrila-lottery-reference shangrila-lottery-overlay';
    overlay.setAttribute(ROOT_MARKER, 'true');
    overlay.innerHTML = [
      '<main class="shangrila-lottery-page" aria-label="Lottery dashboard">',
        '<section class="shangrila-lottery-reference-hero">',
          '<div class="shangrila-lottery-reference-art" role="img" aria-label="Shangri La lottery artwork">',
            '<img class="shangrila-lottery-reference-art-image" src="', LOTTERY_IMAGE_URL, '" alt="Shangri La VIP New Year Lottery">',
            '<span class="shangrila-lottery-reference-art-kicker">SHANGRI LA VIP</span>',
            '<strong>LOTTERY</strong>',
            '<div class="shangrila-lottery-reference-art-orb orb-one" aria-hidden="true">1</div>',
            '<div class="shangrila-lottery-reference-art-orb orb-two" aria-hidden="true">9</div>',
            '<div class="shangrila-lottery-reference-art-orb orb-three" aria-hidden="true">3</div>',
            '<span class="shangrila-lottery-reference-art-note">YOUR LUCKY NUMBERS</span>',
          '</div>',
          '<div class="shangrila-lottery-reference-content">',
            '<p class="shangrila-lottery-reference-eyebrow">SHANGRI LA VIP LOTTERY</p>',
            '<h1>Shangri La Lottery</h1>',
            '<div class="shangrila-lottery-reference-balance">',
              '<div class="shangrila-lottery-reference-balance-copy">',
                '<span>You have earned</span>',
                '<strong class="shangrila-lottery-ticket-count-value">0</strong>',
                '<span class="shangrila-lottery-ticket-label">lottery tickets</span>',
              '</div>',
              '<div class="shangrila-lottery-reference-countdown">',
                '<span class="shangrila-lottery-reference-countdown-title">Countdown to lottery draw</span>',
                '<div class="shangrila-lottery-reference-countdown-grid">',
                  countdownUnit('days', 'Days'),
                  countdownUnit('hours', 'Hours'),
                  countdownUnit('minutes', 'Mins'),
                  countdownUnit('seconds', 'Secs'),
                '</div>',
              '</div>',
            '</div>',
            '<div class="shangrila-lottery-reference-copy">',
              '<p>Keep playing your favourite games to collect lottery tickets automatically.</p>',
              '<p>Your ticket balance is updated from the current lottery count on the wheel page.</p>',
              '<p>When the draw opens, every ticket gives you another chance to win.</p>',
            '</div>',
          '</div>',
        '</section>',
        '<section class="shangrila-lottery-reference-info-grid">',
          '<article class="shangrila-lottery-reference-info-card">',
            '<p class="shangrila-lottery-reference-eyebrow">HOW TO EARN TICKETS</p>',
            '<h2>Play. Collect. Enter.</h2>',
            '<div class="shangrila-lottery-reference-steps">',
              stepCard('01', 'Play games', 'Play eligible casino or sportsbook games.'),
              stepCard('02', 'Collect tickets', 'Your ticket count updates automatically.'),
              stepCard('03', 'Join the draw', 'Keep your tickets ready for the next draw.'),
            '</div>',
          '</article>',
          '<article class="shangrila-lottery-reference-info-card shangrila-lottery-reference-prize-card">',
            '<p class="shangrila-lottery-reference-eyebrow">LOTTERY STATUS</p>',
            '<h2>Details for the next draw</h2>',
            '<ul>',
              '<li>Ticket balance is shown above.</li>',
              '<li>Draw information will appear here when available.</li>',
              '<li>Terms and eligibility rules apply.</li>',
            '</ul>',
          '</article>',
        '</section>',
        termsContent(),
        '<section class="shangrila-lottery-reference-rules">',
          '<div>',
            '<p class="shangrila-lottery-reference-eyebrow">GOOD TO KNOW</p>',
            '<h2>More tickets, more chances.</h2>',
          '</div>',
          '<a href="/en/terms" target="_blank" rel="noopener">View terms and conditions</a>',
        '</section>',
      '</main>'
    ].join('');
    pageContent.appendChild(overlay);
    state.overlay = overlay;
    updateCountdown();
  }

  function countdownUnit(key, label) {
    return [
      '<div class="shangrila-lottery-reference-countdown-unit">',
        '<strong data-countdown="', key, '">--</strong>',
        '<span>', label, '</span>',
      '</div>'
    ].join('');
  }

  function termsContent() {
    return [
      '<section class="shangrila-lottery-terms" aria-labelledby="shangrila-lottery-terms-title">',
        '<p class="shangrila-lottery-reference-eyebrow">LOTTERY TERMS</p>',
        '<h2 id="shangrila-lottery-terms-title">Shangri La VIP New Year Lottery</h2>',
        '<p>Don’t miss out on the Shangri La VIP New Year Lottery with the total prize pool of €100,000!</p>',
        '<p>To participate in the lottery you need to earn tickets.</p>',
        '<p>Earning tickets is very easy. All you have to do is play your favorite games.</p>',
        '<p>Tickets will be awarded for every €1,000 or currency equivalent of real money bets played in any casino game or sportsbook.</p>',
        '<p>Only Players who have made a deposit within the lottery period are eligible to participate.</p>',
        '<h3>Prize pools</h3>',
        '<p>The €100,000 prize pool will be divided in two parts.</p>',
        '<h4>First draw — €80,000 for players with 300 or more tickets</h4>',
        prizeList(['€30,000', '€15,000', '€15,000', '€7,000', '€7,000', '€2,000', '€2,000', '€1,000', '€1,000']),
        '<h4>Second part — €20,000 for players with up to 299 lottery tickets</h4>',
        prizeList(['€5,000', '€2,500', '€2,500', '€1,000', '€1,000', '€1,000', '€1,000', '€500', '€500', '€500', '€500', '€500', '€500', '€500', '€500', '€250', '€250', '€250', '€250', '€250', '€250', '€250', '€250']),
        '<p>So the more you play the more tickets you can earn and the more chances you have to win a big prize.</p>',
        '<h3>Lottery period and draw</h3>',
        '<p>Lottery tickets can be achieved from 00:01 GMT 21/11/2026 to 23:59 GMT 02/01/2027.</p>',
        '<p>Lottery draws will take place on 08/01/2027.</p>',
        '<p>The link for the lottery streaming and time will be announced two days before the lottery drawing and will be provided to all qualified players by their managers.</p>',
        '<h3>Prize conditions</h3>',
        '<p>Only one lottery prize can be won per player.</p>',
        '<p>Prizes will be issued as a bonus with x5 wagering and valid for 30 days and can be played in any live casino or slot games.</p>',
        '<h3>General conditions</h3>',
        '<p>Shangri La reserves the right to refuse this bonus to any player or impose higher wagering requirements.</p>',
        '<p>Shangri La reserves the right to cancel this promotion or to change the terms and conditions of this promotion at any time and it is the customer’s responsibility to periodically check this page for changes and updates.</p>',
        '<p>Casino management reserves the right to void any bonuses and/or winnings obtained by fraudulent behaviour.</p>',
        '<p>In the event of any dispute, the Casino management’s decision is final and binding in all cases.</p>',
      '</section>'
    ].join('');
  }

  function prizeList(items) {
    return '<ol>' + items.map(function (item) { return '<li>' + item + '</li>'; }).join('') + '</ol>';
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
    state.overlay.setAttribute('data-shangrila-lottery-tickets', String(state.ticketCount));
  }

  function updateCountdown() {
    if (!state.overlay) return;
    var values = { days: '--', hours: '--', minutes: '--', seconds: '--' };
    if (state.drawAt) {
      var remaining = Math.max(0, state.drawAt.getTime() - Date.now());
      var totalSeconds = Math.floor(remaining / 1000);
      values.days = String(Math.floor(totalSeconds / 86400));
      values.hours = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, '0');
      values.minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      values.seconds = String(totalSeconds % 60).padStart(2, '0');
    }
    Object.keys(values).forEach(function (key) {
      var element = state.overlay.querySelector('[data-countdown="' + key + '"]');
      if (element) element.textContent = values[key];
    });
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
      [data-shangrila-lottery-source-hidden="true"] {\
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
\
      /* Screenshot-led Shangri La lottery treatment. */\
      .shangrila-lottery-reference {\
        --shangrila-lottery-green: #5dcc00;\
        --shangrila-lottery-gold: #ddb86a;\
        --shangrila-lottery-cream: #f4e6bf;\
        --shangrila-lottery-purple: #191925;\
        --shangrila-lottery-card: #1e1e2c;\
        --shangrila-lottery-border: #36364e;\
        background: var(--shangrila-lottery-purple) !important;\
        color: #f5f5f7 !important;\
      }\
      .shangrila-lottery-reference::before {\
        background: radial-gradient(circle at 16% 12%, rgba(85, 196, 0, .08), transparent 25%),\
          radial-gradient(circle at 90% 10%, rgba(221, 184, 106, .08), transparent 28%),\
          linear-gradient(145deg, #15151f 0%, #1b1b2a 58%, #15151f 100%);\
      }\
      .shangrila-lottery-reference::after { opacity: .08; background-size: 30px 30px; }\
      .shangrila-lottery-reference .shangrila-lottery-page {\
        width: min(1120px, 100%);\
        padding: 28px clamp(16px, 4vw, 42px) 38px;\
      }\
      .shangrila-lottery-reference-hero {\
        display: grid;\
        grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);\
        gap: 12px;\
        align-items: stretch;\
      }\
      .shangrila-lottery-reference-art {\
        position: relative;\
        min-height: 0;\
        aspect-ratio: 1 / 1;\
        overflow: hidden;\
        display: flex;\
        flex-direction: column;\
        justify-content: flex-end;\
        padding: 30px 28px;\
        border: 1px solid rgba(221, 184, 106, .34);\
        border-radius: 14px;\
        background-image: linear-gradient(145deg, rgba(5, 12, 9, .1), rgba(5, 8, 14, .82));\
        background-color: #0d1b16;\
        background-position: center;\
        background-size: cover;\
        box-shadow: inset 0 0 80px rgba(0, 0, 0, .48);\
      }\
      .shangrila-lottery-reference-art-image {\
        position: absolute;\
        z-index: 0;\
        inset: 0;\
        width: 100%;\
        height: 100%;\
        object-fit: cover;\
        object-position: center;\
      }\
      .shangrila-lottery-reference-art::before {\
        content: "";\
        position: absolute;\
        inset: 0;\
        background: radial-gradient(circle at 28% 26%, rgba(221, 184, 106, .55) 0 3px, transparent 4px),\
          radial-gradient(circle at 78% 18%, rgba(221, 184, 106, .4) 0 2px, transparent 3px),\
          radial-gradient(circle at 62% 42%, rgba(93, 204, 0, .35) 0 4px, transparent 5px),\
          linear-gradient(180deg, transparent 35%, rgba(3, 5, 4, .8) 100%);\
        pointer-events: none;\
      }\
      .shangrila-lottery-reference-art-kicker, .shangrila-lottery-reference-art strong, .shangrila-lottery-reference-art-note { position: relative; z-index: 2; }\
      .shangrila-lottery-reference-art-kicker { color: var(--shangrila-lottery-cream); font-size: 10px; font-weight: 800; letter-spacing: .18em; }\
      .shangrila-lottery-reference-art strong { margin-top: 10px; color: var(--shangrila-lottery-gold); font-family: Georgia, serif; font-size: clamp(34px, 5vw, 58px); line-height: .9; letter-spacing: .04em; text-shadow: 0 4px 24px rgba(0, 0, 0, .6); }\
      .shangrila-lottery-reference-art-note { margin-top: 15px; color: rgba(255,255,255,.68); font-size: 9px; letter-spacing: .2em; }\
      .shangrila-lottery-reference-art-orb {\
        position: absolute;\
        z-index: 1;\
        display: grid;\
        place-items: center;\
        width: 58px;\
        height: 58px;\
        border: 2px solid var(--shangrila-lottery-gold);\
        border-radius: 50%;\
        background: radial-gradient(circle at 32% 28%, #fff2bf, #dbac45 42%, #774c18 100%);\
        color: #15151f;\
        font-family: Georgia, serif;\
        font-size: 26px;\
        box-shadow: 0 8px 28px rgba(0,0,0,.42);\
      }\
      .shangrila-lottery-reference-art-orb::after { content: ""; position: absolute; inset: 7px; border: 1px solid rgba(255,255,255,.55); border-radius: 50%; }\
      .shangrila-lottery-reference-art .orb-one { top: 62px; left: 54px; }\
      .shangrila-lottery-reference-art .orb-two { top: 124px; right: 44px; transform: scale(.82); }\
      .shangrila-lottery-reference-art .orb-three { top: 184px; left: 125px; transform: scale(.66); }\
      .shangrila-lottery-reference-content {\
        padding: 17px 17px 24px;\
        border: 1px solid var(--shangrila-lottery-border);\
        border-radius: 14px;\
        background: rgba(30, 30, 44, .94);\
      }\
      .shangrila-lottery-reference-eyebrow { margin: 0 0 10px; color: var(--shangrila-lottery-gold); font-size: 10px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }\
      .shangrila-lottery-reference-content h1 { margin: 0 0 25px; color: var(--shangrila-lottery-green); font-size: clamp(25px, 3vw, 38px); line-height: 1.1; letter-spacing: -.045em; }\
      .shangrila-lottery-reference-balance {\
        display: grid;\
        grid-template-columns: minmax(150px, .85fr) minmax(0, 1.15fr);\
        gap: 18px;\
        align-items: center;\
        padding: 22px 25px;\
        border: 1px solid #37374f;\
        border-radius: 15px;\
        background: #161621;\
      }\
      .shangrila-lottery-reference-balance-copy { display: flex; flex-direction: column; align-items: center; text-align: center; color: #f8f8fb; font-size: 16px; }\
      .shangrila-lottery-reference-balance-copy strong { margin-top: 12px; color: var(--shangrila-lottery-green); font-size: 60px; font-weight: 400; line-height: .8; }\
      .shangrila-lottery-reference-balance-copy .shangrila-lottery-ticket-label { margin-top: 14px; color: #f8f8fb; font-size: 17px; font-weight: 400; }\
      .shangrila-lottery-reference-countdown { display: flex; flex-direction: column; align-items: center; gap: 15px; }\
      .shangrila-lottery-reference-countdown-title { color: #f8f8fb; font-size: 16px; }\
      .shangrila-lottery-reference-countdown-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; width: 100%; }\
      .shangrila-lottery-reference-countdown-unit { display: grid; place-items: center; min-width: 54px; aspect-ratio: 1; padding: 6px; border: 2px solid #2c2c48; border-radius: 50%; background: #161621; }\
      .shangrila-lottery-reference-countdown-unit strong { color: var(--shangrila-lottery-green); font-size: 19px; font-weight: 400; }\
      .shangrila-lottery-reference-countdown-unit span { margin-top: 2px; color: #f4f4f7; font-size: 10px; }\
      .shangrila-lottery-reference-copy { margin-top: 18px; color: #f3f3f6; font-size: 13px; line-height: 1.55; }\
      .shangrila-lottery-reference-copy p { margin: 0 0 12px; }\
      .shangrila-lottery-reference-info-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-top: 12px; }\
      .shangrila-lottery-reference-info-card { padding: 23px; border: 1px solid var(--shangrila-lottery-border); border-radius: 14px; background: rgba(30,30,44,.94); }\
      .shangrila-lottery-reference-info-card h2 { margin: 0 0 19px; color: #f2f2f5; font-size: 23px; font-weight: 500; letter-spacing: -.03em; }\
      .shangrila-lottery-reference-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }\
      .shangrila-lottery-reference-steps .shangrila-lottery-step { min-height: 120px; padding: 15px; border: 1px solid #313148; border-radius: 10px; background: #181823; }\
      .shangrila-lottery-reference-steps .shangrila-lottery-step-number { color: var(--shangrila-lottery-green); }\
      .shangrila-lottery-reference-steps .shangrila-lottery-step h3 { margin: 16px 0 7px; color: #f4f4f7; font-size: 14px; }\
      .shangrila-lottery-reference-steps .shangrila-lottery-step p { color: #a9a9b7; font-size: 11px; line-height: 1.45; }\
      .shangrila-lottery-reference-prize-card ul { display: grid; gap: 13px; margin: 0; padding: 0 0 0 18px; color: #d5d5dc; font-size: 13px; line-height: 1.45; }\
      .shangrila-lottery-reference-prize-card li::marker { color: var(--shangrila-lottery-green); }\
      .shangrila-lottery-reference-rules { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-top: 12px; padding: 22px 23px; border: 1px solid rgba(221,184,106,.25); border-radius: 14px; background: rgba(13, 26, 20, .55); }\
      .shangrila-lottery-reference-rules h2 { margin: 0; color: var(--shangrila-lottery-cream); font-family: Georgia, serif; font-size: 26px; font-weight: 400; }\
      .shangrila-lottery-reference-rules a { padding: 11px 15px; border: 1px solid rgba(93,204,0,.5); border-radius: 7px; color: var(--shangrila-lottery-green); font-size: 12px; text-decoration: none; }\
      .shangrila-lottery-reference-rules a:hover { background: rgba(93,204,0,.1); }\
      .shangrila-lottery-terms {\
        margin-top: 12px;\
        padding: 24px;\
        border: 1px solid var(--shangrila-lottery-border);\
        border-radius: 14px;\
        background: rgba(10, 29, 19, .95);\
        color: #e7e0cf;\
        font-size: 13px;\
        line-height: 1.6;\
      }\
      .shangrila-lottery-terms h2 { margin: 0 0 18px; color: var(--shangrila-lottery-cream); font-size: 25px; font-weight: 500; }\
      .shangrila-lottery-terms h3 { margin: 28px 0 9px; color: var(--shangrila-lottery-gold); font-size: 16px; }\
      .shangrila-lottery-terms h4 { margin: 20px 0 8px; color: var(--shangrila-lottery-cream); font-size: 14px; font-weight: 600; }\
      .shangrila-lottery-terms p { margin: 0 0 12px; }\
      .shangrila-lottery-terms ol { columns: 3; column-gap: 32px; margin: 0 0 16px; padding-left: 24px; color: var(--shangrila-lottery-green); }\
      .shangrila-lottery-terms li { break-inside: avoid; padding-left: 4px; color: #e7e0cf; }\
      .shangrila-lottery-reference .shangrila-lottery-footer { margin-top: 22px; color: #858594; }\
      .shangrila-lottery-reference .shangrila-lottery-footer a { color: var(--shangrila-lottery-gold); }\
\
      @media (max-width: 760px) {\
        .shangrila-lottery-reference .shangrila-lottery-page { padding: 18px 12px 28px; }\
        .shangrila-lottery-reference-hero, .shangrila-lottery-reference-info-grid { grid-template-columns: 1fr; }\
        .shangrila-lottery-reference-art { min-height: 0; aspect-ratio: 16 / 10; }\
        .shangrila-lottery-reference-art-image { object-fit: contain; background: #0a1b12; }\
        .shangrila-lottery-reference-balance { grid-template-columns: 1fr; padding: 19px 15px; }\
        .shangrila-lottery-reference-countdown-grid { max-width: 320px; }\
        .shangrila-lottery-reference-steps { grid-template-columns: 1fr; }\
        .shangrila-lottery-reference-rules { align-items: flex-start; flex-direction: column; }\
        .shangrila-lottery-terms { padding: 20px 17px; font-size: 12px; }\
        .shangrila-lottery-terms ol { columns: 1; }\
        .shangrila-lottery-reference .shangrila-lottery-page { padding-bottom: 88px; }\
      }\
\
      /* Keep the lottery surface inside the page-content flow. */\
      .shangrila-lottery-reference.shangrila-lottery-overlay {\
        position: relative !important;\
        inset: auto !important;\
        z-index: auto !important;\
        width: 100% !important;\
        min-height: 100% !important;\
        overflow: visible !important;\
      }\
\
      /* Live vipshangrila.com palette: forest green, cream and champagne gold. */\
      .shangrila-lottery-reference {\
        --shangrila-lottery-green: #75c928;\
        --shangrila-lottery-gold: #d9b267;\
        --shangrila-lottery-cream: #f3e5bd;\
        --shangrila-lottery-purple: #07140e;\
        --shangrila-lottery-card: #0d2117;\
        --shangrila-lottery-border: #294535;\
        background: #07140e !important;\
        color: #f7f1df !important;\
      }\
      .shangrila-lottery-reference::before {\
        background: radial-gradient(circle at 16% 12%, rgba(117, 201, 40, .13), transparent 25%),\
          radial-gradient(circle at 90% 10%, rgba(217, 178, 103, .12), transparent 28%),\
          linear-gradient(145deg, #06120c 0%, #0a1c13 58%, #06120c 100%);\
      }\
      .shangrila-lottery-reference::after { opacity: .14; }\
      .shangrila-lottery-reference-content, .shangrila-lottery-reference-info-card {\
        border-color: var(--shangrila-lottery-border);\
        background: rgba(10, 29, 19, .95);\
      }\
      .shangrila-lottery-reference-eyebrow { color: var(--shangrila-lottery-gold); }\
      .shangrila-lottery-reference-content h1 { color: var(--shangrila-lottery-cream); }\
      .shangrila-lottery-reference-art {\
        border-color: rgba(217, 178, 103, .42);\
        background-color: #0a1b12;\
      }\
      .shangrila-lottery-reference-balance {\
        border-color: #2d4b39;\
        background: #07170e;\
      }\
      .shangrila-lottery-reference-balance-copy strong, .shangrila-lottery-reference-countdown-unit strong { color: var(--shangrila-lottery-green); }\
      .shangrila-lottery-reference-countdown-unit { border-color: #35533e; background: #07170e; }\
      .shangrila-lottery-reference-steps .shangrila-lottery-step { border-color: #294535; background: #0a1a11; }\
      .shangrila-lottery-reference-info-card h2 { color: var(--shangrila-lottery-cream); }\
      .shangrila-lottery-reference-prize-card ul { color: #e7e0cf; }\
      .shangrila-lottery-reference-rules { border-color: rgba(217,178,103,.3); background: rgba(8, 29, 17, .82); }\
      .shangrila-lottery-reference-rules h2 { color: var(--shangrila-lottery-cream); }\
      .shangrila-lottery-reference-rules a { border-color: rgba(117,201,40,.58); color: var(--shangrila-lottery-green); }\
      .shangrila-lottery-reference .shangrila-lottery-footer a { color: var(--shangrila-lottery-gold); }\
      @media (min-width: 761px) {\
        .shangrila-lottery-reference .shangrila-lottery-page { padding-top: 20px; }\
      }\
    ';
    document.head.appendChild(style);
