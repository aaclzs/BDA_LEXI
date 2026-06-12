(function () {
  function getCaretOffset(el) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;
    const range = selection.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  function setCaretOffset(el, offset) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    let current = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent.length;
      if (current + len >= offset) {
        range.setStart(node, Math.max(0, offset - current));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      current += len;
      node = walker.nextNode();
    }
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function countTextLines(text) {
    if (!text) return 0;
    return text.split("\n").length;
  }

  function updateLineNumbers(lineNumbersEl, readonly, active) {
    const total = countTextLines(readonly) + countTextLines(active);
    const lineCount = Math.max(total, 1);
    const lines = Array.from({ length: lineCount }, (_, i) => String(i + 1));
    lineNumbersEl.textContent = lines.join("\n");
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderSuggestionCards(container, flags) {
    container.innerHTML = flags.map((f) => {
      const cat = f.type === "typo" ? "Spelling" : "Terminology";
      const resolvedSuggestion = f.suggestion || "No suggestion available";
      const desc = f.type === "typo"
        ? `${resolvedSuggestion} is the correct spelling.`
        : `Use "${resolvedSuggestion}" — this team's preferred term from learned vocabulary.`;
      return `<article class="assistant-card" data-jump-id="${f.id}">
        <div class="assistant-row">
          <span class="bullet ${f.type}"></span>
          <span>${cat}</span>
        </div>
        <div class="assistant-main">
          <span class="assistant-word ${f.type}">${escapeHtml(f.word)}</span>
          <span> → </span>
          <span class="assistant-suggest">${escapeHtml(resolvedSuggestion)}</span>
        </div>
        <div class="assistant-desc">${escapeHtml(desc)}</div>
      </article>`;
    }).join("") || `<div class="assistant-desc">No current suggestions.</div>`;
  }

  function createPopupHtml(flag) {
    const resolvedSuggestion = flag.suggestion || "No suggestion available";
    if (flag.type === "term") {
      const rows = (flag.recommendations || []).map((item, idx) => `
        <button class="term-row ${idx === 0 ? "rank-1" : ""}" data-action="accept-term" data-term="${escapeHtml(item.term)}">
          <span class="term-row-left">${escapeHtml(item.term)}</span>
          <span class="term-row-right">${escapeHtml(item.label)}</span>
        </button>
      `).join("");
      return `
        <div class="popup-top">
          <span class="popup-label term">Recommended terms</span>
          <button class="popup-close" data-action="close" aria-label="Close suggestion popup">✕</button>
        </div>
        <div class="term-list terms-scroll-list">
          ${rows}
        </div>
        <button class="term-dismiss-btn" data-action="dismiss-term">Dismiss</button>
      `;
    }
    return `
      <div class="popup-top">
        <span class="popup-label typo">Possible Typo</span>
        <button class="popup-close" data-action="close" aria-label="Close suggestion popup">✕</button>
      </div>
      <div class="popup-suggest"><strong>${escapeHtml(resolvedSuggestion)}</strong></div>
      <button class="popup-accept" data-action="accept">Accept</button>
      <button class="term-dismiss-btn" data-action="dismiss">Dismiss</button>
    `;
  }

  function placePopupAtFlag(popup, targetEl) {
    const rect = targetEl.getBoundingClientRect();
    popup.style.position = "fixed";
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.top - popup.offsetHeight - 5}px`;

    if (popup.offsetLeft + popup.offsetWidth > window.innerWidth) {
      popup.style.left = `${Math.max(0, window.innerWidth - popup.offsetWidth - 8)}px`;
    }
    if (parseFloat(popup.style.top) < 0) {
      popup.style.top = `${rect.bottom + 5}px`;
    }
  }

  function updateCursorPosition(cursorPosEl, activeText, readOnlyCode, activeZone) {
    const offset = getCaretOffset(activeZone);
    const lines = activeText.slice(0, offset).split("\n");
    const line = readOnlyCode.split("\n").length + lines.length;
    const col = lines[lines.length - 1].length + 1;
    cursorPosEl.textContent = `Ln ${line}, Col ${col}`;
  }

  window.LEXI_UI = {
    getCaretOffset,
    setCaretOffset,
    updateLineNumbers,
    renderSuggestionCards,
    createPopupHtml,
    placePopupAtFlag,
    updateCursorPosition
  };
})();
