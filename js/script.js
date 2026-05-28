(function () {
  const state = {
    activeText: window.LEXI_DATA.initialActiveCode,
    typoMap: {},
    teamTerms: window.LEXI_SCANNER.extractTeamTermsFromCode(),
    flags: [],
    dismissed: new Set(),
    openFlagId: null
  };

  const readonlyCodeEl = document.getElementById("readonlyCode");
  const activeZone = document.getElementById("activeZone");
  const lineNumbers = document.getElementById("lineNumbers");
  const popup = document.getElementById("popup");
  const cursorPos = document.getElementById("cursorPos");
  const tabSuggestions = document.getElementById("tabSuggestions");
  const suggestionCount = document.getElementById("suggestionCount");
  const assistantPanel = document.getElementById("assistantPanel");
  const assistantToggle = document.getElementById("assistantToggle");
  const workbench = document.getElementById("workbench");

  let debounceTimer = null;

  function closePopup() {
    popup.hidden = true;
    popup.innerHTML = "";
    state.openFlagId = null;
  }

  function replaceRange(text, start, end, value) {
    return text.slice(0, start) + value + text.slice(end);
  }

  function refreshPanel() {
    const spans = Array.from(activeZone.querySelectorAll(".lexi-typo, .lexi-term"));
    const flagsById = new Map(state.flags.map((flag) => [flag.id, flag]));
    const panelFlags = spans.map((span) => {
      const id = span.dataset.flagId || "";
      const type = span.classList.contains("lexi-typo") ? "typo" : "term";
      const fallbackSuggestion = "No suggestion available";
      const matched = flagsById.get(id);
      return {
        id,
        word: span.textContent || "",
        type,
        suggestion: matched ? matched.suggestion : fallbackSuggestion
      };
    });

    suggestionCount.textContent = String(spans.length);
    if (!panelFlags.length) {
      tabSuggestions.innerHTML = `<div class="assistant-desc" style="text-align:center;color:#8b8fa8;">No issues found.</div>`;
      return;
    }
    window.LEXI_UI.renderSuggestionCards(tabSuggestions, panelFlags);
  }

  function scanAndRender(keepCaret) {
    const caret = keepCaret ? window.LEXI_UI.getCaretOffset(activeZone) : 0;
    state.flags = window.LEXI_SCANNER.tokenizeFlags(
      state.activeText,
      state.typoMap,
      state.teamTerms,
      state.dismissed
    );
    activeZone.innerHTML = window.LEXI_SCANNER.paintWithSyntaxAndFlags(state.activeText, state.flags);
    if (keepCaret) window.LEXI_UI.setCaretOffset(activeZone, caret);
    window.LEXI_UI.updateLineNumbers(lineNumbers, window.LEXI_DATA.readOnlyCode, state.activeText);
    window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, window.LEXI_DATA.readOnlyCode, activeZone);
    refreshPanel();
    closePopup();
  }

  function openPopup(flag, targetEl) {
    state.openFlagId = flag.id;
    popup.classList.toggle("term-popup", flag.type === "term");
    popup.innerHTML = window.LEXI_UI.createPopupHtml(flag);
    popup.hidden = false;
    window.LEXI_UI.placePopupAtFlag(popup, targetEl);
    popup.onclick = (e) => {
      const termRow = e.target.closest(".term-row");
      if (termRow) {
        const selectedTerm = termRow.dataset.term;
        if (!selectedTerm) return;
        const selectedResolution = window.LEXI_SCANNER.getSuggestionForToken(
          selectedTerm,
          true,
          state.typoMap,
          state.teamTerms
        );
        if (selectedResolution && selectedResolution.type === "term") {
          state.dismissed.add(
            window.LEXI_SCANNER.dismissKey(
              selectedTerm,
              "term",
              selectedResolution.suggestion
            )
          );
        }
        state.activeText = replaceRange(state.activeText, flag.start, flag.end, selectedTerm);
        scanAndRender(true);
        return;
      }

      const actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === "accept") {
        state.activeText = replaceRange(state.activeText, flag.start, flag.end, flag.suggestion);
        scanAndRender(true);
      } else if (action === "accept-term") {
        const chosenTerm = actionEl.dataset.term || flag.suggestion;
        const chosenResolution = window.LEXI_SCANNER.getSuggestionForToken(
          chosenTerm,
          true,
          state.typoMap,
          state.teamTerms
        );
        if (chosenResolution && chosenResolution.type === "term") {
          state.dismissed.add(
            window.LEXI_SCANNER.dismissKey(
              chosenTerm,
              "term",
              chosenResolution.suggestion
            )
          );
        }
        state.activeText = replaceRange(state.activeText, flag.start, flag.end, chosenTerm);
        scanAndRender(true);
      } else if (action === "dismiss-term") {
        state.dismissed.add(window.LEXI_SCANNER.dismissKey(flag.word, "term", flag.suggestion));
        scanAndRender(true);
      } else if (action === "close") {
        closePopup();
      } else if (action === "dismiss") {
        state.dismissed.add(window.LEXI_SCANNER.dismissKey(flag.word, flag.type, flag.suggestion));
        scanAndRender(true);
      }
    };
  }

  function syncFromEditor() {
    const text = activeZone.innerText.replace(/\r/g, "");
    state.activeText = text.endsWith("\n") ? text.slice(0, -1) : text;
    scanAndRender(true);
  }

  function bindEvents() {
    activeZone.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncFromEditor, 500);
      window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, window.LEXI_DATA.readOnlyCode, activeZone);
    });

    activeZone.addEventListener("keyup", () => {
      window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, window.LEXI_DATA.readOnlyCode, activeZone);
    });

    activeZone.addEventListener("mouseup", () => {
      window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, window.LEXI_DATA.readOnlyCode, activeZone);
    });

    activeZone.addEventListener("click", (e) => {
      const flagged = e.target.closest("[data-flag-id]");
      if (!flagged) {
        closePopup();
        return;
      }
      const flag = state.flags.find((f) => f.id === flagged.dataset.flagId);
      if (!flag) return;
      if (state.openFlagId === flag.id) closePopup();
      else openPopup(flag, flagged);
    });

    tabSuggestions.addEventListener("click", (e) => {
      const card = e.target.closest("[data-jump-id]");
      if (!card) return;
      const id = card.dataset.jumpId;
      const target = activeZone.querySelector(`[data-flag-id="${CSS.escape(id)}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.style.background = "rgba(123, 128, 255, 0.2)";
      setTimeout(() => { target.style.background = ""; }, 750);
    });

    assistantToggle.addEventListener("click", () => {
      const closed = workbench.classList.toggle("panel-closed");
      assistantPanel.setAttribute("aria-hidden", closed ? "true" : "false");
      assistantToggle.textContent = closed ? "›" : "‹";
    });

    document.addEventListener("click", (e) => {
      if (!popup.hidden && !popup.contains(e.target) && !e.target.closest("[data-flag-id]")) {
        closePopup();
      }
    });
  }

  async function init() {
    readonlyCodeEl.textContent = window.LEXI_DATA.readOnlyCode;
    activeZone.innerText = state.activeText;
    const data = await window.LEXI_DATA.loadLexiData();
    state.typoMap = data.typoMap;
    bindEvents();
    scanAndRender(false);
  }

  init();
})();
