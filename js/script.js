(function () {
  const state = {
    teams: [],
    currentTeam: null,
    scannerContext: null,
    readOnlyCode: "",
    activeText: "",
    typoMap: {},
    flags: [],
    dismissed: new Set(),
    openFlagId: null,
    datasetSize: 0
  };

  const readonlyCodeEl = document.getElementById("readonlyCode");
  const activeZone = document.getElementById("activeZone");
  const lineNumbers = document.getElementById("lineNumbers");
  const popup = document.getElementById("popup");
  const cursorPos = document.getElementById("cursorPos");
  const tabSuggestions = document.getElementById("tabSuggestions");
  const tabVocabulary = document.getElementById("tabVocabulary");
  const suggestionCount = document.getElementById("suggestionCount");
  const assistantPanel = document.getElementById("assistantPanel");
  const assistantClose = document.getElementById("assistantClose");
  const assistantReopen = document.getElementById("assistantReopen");
  const editorShell = document.querySelector(".editor-shell");
  const workbench = document.getElementById("workbench");
  const teamList = document.getElementById("teamList");
  const teamVocabList = document.getElementById("teamVocabList");
  const datasetInfo = document.getElementById("datasetInfo");
  const teamStatus = document.getElementById("teamStatus");

  const TEAM_DISPLAY_NAMES = {
    "team-a": "Team A Simulation",
    "team-b": "Team B Simulation",
    "team-c": "Team C Simulation"
  };

  let debounceTimer = null;

  function setAssistantPanelOpen(isOpen) {
    workbench.classList.toggle("panel-closed", !isOpen);
    assistantPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (editorShell) editorShell.classList.toggle("assistant-closed", !isOpen);
    if (assistantReopen) assistantReopen.hidden = isOpen;
  }

  function closePopup() {
    popup.hidden = true;
    popup.innerHTML = "";
    state.openFlagId = null;
  }

  function replaceRange(text, start, end, value) {
    return text.slice(0, start) + value + text.slice(end);
  }

  function renderTeamVocabulary(team) {
    if (!teamVocabList || !team) return;
    const learned = state.scannerContext?.learnedTerms || [];
    const chips = learned.slice(0, 12).map((term) => (
      `<span class="term-chip" title="Used in Members 1–3 comments and strings">${term}</span>`
    )).join("");
    const sampleAlternates = ["error", "file", "data", "actor"]
      .map((key) => team.alternates[key])
      .filter((alt) => alt && !learned.includes(alt))
      .slice(0, 3);

    teamVocabList.innerHTML = `
      <div class="assistant-desc" style="margin-bottom:8px;">
        Terms LEXI learned from Members 1–3 comments and string literals:
      </div>
      <div>${chips || '<span class="assistant-desc">No learned terms yet.</span>'}</div>
      <div class="assistant-desc" style="margin-top:12px;">
        ${sampleAlternates.length
    ? `Try typing alternate terms like "${sampleAlternates.join('", "')}" in comments or strings.`
    : "Type a non-team term in a comment or string to see suggestions."}
      </div>
    `;
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
      state.scannerContext,
      state.dismissed
    );
    activeZone.innerHTML = window.LEXI_SCANNER.paintWithSyntaxAndFlags(state.activeText, state.flags);
    if (keepCaret) window.LEXI_UI.setCaretOffset(activeZone, caret);
    window.LEXI_UI.updateLineNumbers(lineNumbers, state.readOnlyCode, state.activeText);
    window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, state.readOnlyCode, activeZone);
    refreshPanel();
    closePopup();
  }

  function applyTeam(team, resetEditor) {
    state.currentTeam = team;
    state.readOnlyCode = `${team.memberCode}

// ──────────────────────────────────────────────────────
// Member 4 starts here ↓ (LEXI is active — you are the new contributor)
// ──────────────────────────────────────────────────────
`;
    state.scannerContext = window.LEXI_SCANNER.createScannerContext(team);
    readonlyCodeEl.textContent = state.readOnlyCode;
    team.learnedTerms = state.scannerContext.learnedTerms;

    if (resetEditor) {
      state.activeText = team.member4Starter;
      state.dismissed.clear();
      activeZone.innerText = state.activeText;
    }

    updateTeamListSelection(team.id);
    if (teamStatus) {
      teamStatus.textContent = TEAM_DISPLAY_NAMES[team.id] || team.label;
    }
    renderTeamVocabulary(team);
    scanAndRender(false);
  }

  function switchTeam(teamId) {
    const team = state.teams.find((t) => t.id === teamId);
    if (!team || team.id === state.currentTeam?.id) return;
    applyTeam(team, true);
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
          state.scannerContext
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
          state.scannerContext
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
      const liveText = activeZone.innerText.replace(/\r/g, "");
      const liveActive = liveText.endsWith("\n") ? liveText.slice(0, -1) : liveText;
      window.LEXI_UI.updateLineNumbers(lineNumbers, state.readOnlyCode, liveActive);
      window.LEXI_UI.updateCursorPosition(cursorPos, liveActive, state.readOnlyCode, activeZone);
    });

    activeZone.addEventListener("keyup", () => {
      window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, state.readOnlyCode, activeZone);
    });

    activeZone.addEventListener("mouseup", () => {
      window.LEXI_UI.updateCursorPosition(cursorPos, state.activeText, state.readOnlyCode, activeZone);
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

    if (teamList) {
      teamList.addEventListener("click", (e) => {
        const option = e.target.closest(".team-option");
        if (!option) return;
        switchTeam(option.dataset.teamId);
      });
    }

    if (assistantClose) {
      assistantClose.addEventListener("click", () => {
        setAssistantPanelOpen(false);
      });
    }

    if (assistantReopen) {
      assistantReopen.addEventListener("click", () => {
        setAssistantPanelOpen(true);
      });
    }

    document.querySelectorAll(".assistant-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll(".assistant-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
        document.querySelectorAll(".assistant-tab-content").forEach((panel) => {
          panel.classList.toggle("active", panel.id === `tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
        });
      });
    });

    document.addEventListener("click", (e) => {
      if (!popup.hidden && !popup.contains(e.target) && !e.target.closest("[data-flag-id]")) {
        closePopup();
      }
    });
  }

  function populateTeamList(teams) {
    if (!teamList) return;
    teamList.innerHTML = teams.map((team) => (
      `<li role="option">
        <button type="button" class="team-option" data-team-id="${team.id}">
          ${TEAM_DISPLAY_NAMES[team.id] || team.label}
        </button>
      </li>`
    )).join("");
  }

  function updateTeamListSelection(teamId) {
    if (!teamList) return;
    teamList.querySelectorAll(".team-option").forEach((btn) => {
      const isActive = btn.dataset.teamId === teamId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  async function init() {
    try {
      const data = await window.LEXI_DATA.loadLexiData();
      state.teams = data.teams;
      state.typoMap = data.typoMap;
      state.datasetSize = data.datasetSize;

      if (datasetInfo) {
        datasetInfo.textContent = [
          `${data.datasetSize.toLocaleString()} CSV rows`,
          `${data.standardTermCount.toLocaleString()} standard terms`,
          `${data.typoCount.toLocaleString()} typo candidates`
        ].join(" · ");
      }

      populateTeamList(data.teams);
      bindEvents();
      setAssistantPanelOpen(true);
      applyTeam(data.teams[0], true);
    } catch (err) {
      if (datasetInfo) {
        datasetInfo.textContent = `Dataset load failed: ${err.message}. Serve via Live Server to load LEXI_Data_Mining_Summary.csv.`;
      }
      bindEvents();
      setAssistantPanelOpen(true);
    }
  }

  init();
})();
