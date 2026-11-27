/*
 * Shangri La - Lottery ticket counter
 *
 * Browser-injected enhancement for the lottery page. It keeps the number that
 * the wheel currently exposes as "N Spin" and presents that same value as the
 * player's available lottery tickets.
 *
 * Run while the lottery page is open. The script is safe to run repeatedly and
 * can be removed with:
 *   window.__shangrilaLotteryTickets.destroy()
 *
 * To update the count from an authenticated API response or another script:
 *   window.__shangrilaLotteryTickets.setTickets(12)
 */
(function shangrilaLotteryTickets() {
  'use strict';

  var VERSION = '2026-11-27-v1';
  var STYLE_ID = 'shangrila-lottery-ticket-count-style';
  var COUNT_SELECTOR = '[class*="spinCount"]';
  var TICKET_COUNT_ATTRIBUTE = 'data-shangrila-lottery-tickets';

  if (window.__shangrilaLotteryTickets) {
    if (window.__shangrilaLotteryTickets.version === VERSION) return;
    window.__shangrilaLotteryTickets.destroy();
  }

  var state = {
    observer: null,
    retryTimer: null,
    countElement: null,
    originalText: null,
    originalAttribute: null,
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

  state.observer = new MutationObserver(function () {
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
    var element = document.querySelector(COUNT_SELECTOR);
    if (!element) return false;

    if (state.countElement !== element) {
      restorePreviousElement();
      state.countElement = element;
      state.originalText = element.textContent;
      state.originalAttribute = element.getAttribute(TICKET_COUNT_ATTRIBUTE);
      state.ticketCount = readNumber(element.textContent);
    }

    // If the site's React tree writes the original "N Spin" label back into
    // the same node, treat that as the new live count. Otherwise keep a value
    // supplied through setTickets() and avoid parsing our own rendered label.
    if (!/lottery tickets?/i.test(element.textContent)) {
      var liveCount = readNumber(element.textContent);
      if (liveCount !== null) state.ticketCount = liveCount;
    }
    render();
    return true;
  }

  function setTickets(value) {
    var count = normalizeCount(value);
    if (count === null) throw new TypeError('Lottery ticket count must be a non-negative number.');
    state.ticketCount = count;
    if (!state.countElement) mount();
    render();
    return count;
  }

  function render() {
    if (!state.countElement || state.ticketCount === null) return;
    var label = formatTicketCount(state.ticketCount);
    var countAttribute = String(state.ticketCount);
    if (state.countElement.textContent !== label) state.countElement.textContent = label;
    if (state.countElement.getAttribute(TICKET_COUNT_ATTRIBUTE) !== countAttribute) {
      state.countElement.setAttribute(TICKET_COUNT_ATTRIBUTE, countAttribute);
    }
    if (state.countElement.getAttribute('aria-label') !== label) {
      state.countElement.setAttribute('aria-label', label);
    }
    state.countElement.classList.add('shangrila-lottery-ticket-count');
  }

  function formatTicketCount(count) {
    return count + ' ' + (count === 1 ? 'Lottery ticket' : 'Lottery tickets');
  }

  function readNumber(value) {
    if (value == null) return null;
    var match = String(value).match(/\d[\d,.]*/);
    if (!match) return null;
    return normalizeCount(match[0].replace(/,/g, ''));
  }

  function normalizeCount(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    return Math.floor(number);
  }

  function restorePreviousElement() {
    if (!state.countElement) return;
    if (state.originalText !== null) state.countElement.textContent = state.originalText;
    if (state.originalAttribute === null) {
      state.countElement.removeAttribute(TICKET_COUNT_ATTRIBUTE);
    } else {
      state.countElement.setAttribute(TICKET_COUNT_ATTRIBUTE, state.originalAttribute);
    }
    state.countElement.removeAttribute('aria-label');
    state.countElement.classList.remove('shangrila-lottery-ticket-count');
  }

  function injectStyles() {
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.shangrila-lottery-ticket-count {' +
      '  white-space: nowrap;' +
      '}' +
      '.shangrila-lottery-ticket-count::first-letter {' +
      '  font-variant-numeric: tabular-nums;' +
      '}';
    document.head.appendChild(style);
  }

  function destroy() {
    if (state.observer) state.observer.disconnect();
    if (state.retryTimer) window.clearInterval(state.retryTimer);
    restorePreviousElement();
    var style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    delete window.__shangrilaLotteryTickets;
  }
})();
