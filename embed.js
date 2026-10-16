/*
 * embed.js — OPTIONAL host-page helper. Include it on the site that embeds the quiz
 * to auto-size the iframe to the quiz height. The iframe works without it (it just
 * keeps its CSS min-height).
 *
 *   <iframe data-quiz-widget src="https://quiz.example.com/" ...></iframe>
 *   <script src="embed.js" defer></script>
 *
 * Security: a message is only used if it comes from that iframe's own window AND from
 * the origin of the iframe's src. Heights are clamped. Nothing from the message is
 * ever inserted as HTML. Optional: listen for "quiz-widget:event" on the iframe.
 */
(function () {
  'use strict';
  var NS = 'quiz-widget';
  var MIN = 320, MAX = 6000;

  function originOf(iframe) {
    try { return new URL(iframe.getAttribute('src'), document.baseURI).origin; } catch (e) { return null; }
  }

  function frames() { return Array.prototype.slice.call(document.querySelectorAll('iframe[data-quiz-widget]')); }

  function requestHeight(iframe) {
    var origin = originOf(iframe);
    if (origin && origin !== 'null' && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ source: NS, version: 1, type: 'quiz:request-height' }, origin);
    }
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || d.source !== NS || typeof d.type !== 'string') return;
    frames().forEach(function (iframe) {
      if (e.source !== iframe.contentWindow || e.origin !== originOf(iframe)) return;
      if (d.type === 'quiz:height' && d.payload && typeof d.payload.height === 'number' && isFinite(d.payload.height)) {
        // Once the quiz reports its real height, drop the CSS min-height fallback.
        iframe.style.minHeight = '0';
        iframe.style.height = Math.min(MAX, Math.max(MIN, Math.ceil(d.payload.height))) + 'px';
      }
      iframe.dispatchEvent(new CustomEvent('quiz-widget:event', { detail: d, bubbles: true }));
    });
  });

  function init() {
    frames().forEach(function (iframe) {
      iframe.addEventListener('load', function () { requestHeight(iframe); });
      requestHeight(iframe);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
