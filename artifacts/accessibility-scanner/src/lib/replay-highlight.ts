// Only this trusted controller runs in the opaque-origin replay sandbox.
// Captured page scripts remain stripped; selection changes are data messages.
export const REPLAY_HIGHLIGHT_CONTROLLER = `
  (() => {
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (event.source !== window.parent || !message ||
          message.type !== 'ampera:replay-highlight' ||
          (message.selector !== null && typeof message.selector !== 'string') ||
          typeof message.showHighlight !== 'boolean') return;
      document.querySelectorAll('[data-a11y-replay-highlight]').forEach((element) => {
        element.removeAttribute('data-a11y-replay-highlight');
      });
      if (!message.selector) return;
      let target;
      try { target = document.querySelector(message.selector); } catch { return; }
      if (!target) return;
      if (message.showHighlight) target.setAttribute('data-a11y-replay-highlight', 'true');
      if (message.focus === true) {
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      }
    });
  })();
`;
