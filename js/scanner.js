(function () {
  const PREWRITTEN_MEMBERS_CODE = `// ─────────────────────────────────────────
// Member 1: User authentication module
// ─────────────────────────────────────────

const authenticate = (user, password) => {
  if (!user || !password) {
    console.error("Missing credentials");
    return null;
  }
  const token = generateToken(user);
  store.set("auth_token", token);
  return token;
};

const validateUser = (user) => {
  if (!user.name || !user.email) {
    console.error("Invalid user data");
    return false;
  }
  return true;
};

// ─────────────────────────────────────────
// Member 2: API and data fetching
// ─────────────────────────────────────────

const fetchData = async (endpoint, method = "GET") => {
  const response = await fetch(endpoint, { method });
  if (!response.ok) {
    throw new Error(\`Server error: \${response.status}\`);
  }
  const data = await response.json();
  return data;
};

  store.set("last_response", data);
  return data;
};

const fetchUserProfile = async (userId) => {
  const data = await fetchData(\`/api/users/\${userId}\`);
  store.set("current_user", data);
  return data;
};

// ─────────────────────────────────────────
// Member 3: Display and output utilities
// ─────────────────────────────────────────

const displayResult = (result) => {
  console.log("Result:", result);
  store.set("display_cache", result);
};

const displayError = (error) => {
  console.error("Error occurred:", error.message);
  store.set("last_error", error);
};

const fetchConfig = async () => {
  const config = await fetchData("/api/config");
  store.set("app_config", config);
  return config;
};`;

  const synonymMap = {
    // Information / data related
    info: ["data", "information"],
    infos: ["data", "information"],
    details: ["data", "information"],
    detail: ["data", "information"],
    metadata: ["data", "information"],

    // Retrieve / get / fetch related
    get: ["fetch", "load", "get", "retrieve", "obtain"],
    getting: ["fetch"],
    grab: ["fetch", "load", "get", "retrieve", "obtain"],
    grabbing: ["fetch"],
    pull: ["fetch", "load", "get", "retrieve", "obtain"],
    pulling: ["fetch"],
    obtain: ["fetch", "load", "get", "retrieve", "obtain"],
    obtaining: ["fetch"],
    load: ["fetch", "load", "get", "retrieve", "obtain"],
    loading: ["fetch"],
    retrieve: ["fetch", "load", "get", "retrieve", "obtain"],
    retrieving: ["fetch", "load", "get", "retrieve", "obtain"],
    read: ["fetch", "load", "get", "retrieve", "obtain"],

    // Display / show / print related
    display: ["print", "send"],
    displaying: ["print", "send"],
    show: ["send", "print"],
    showing: ["send", "print"],
    output: ["print", "send"],
    render: ["print", "send"],
    rendering: ["print", "send"],
    log: ["print", "send"],
    logging: ["print", "send"],

    // Store / save related
    save: ["store"],
    saving: ["store"],
    persist: ["store"],
    persisting: ["store"],
    write: ["store"],
    cache: ["store"],

    // Error / issue related
    issue: ["error"],
    bug: ["error"],
    fault: ["error"],
    problem: ["error"],
    exception: ["error"],

    // Send / request related
    post: ["send"],
    posting: ["send"],
    emit: ["send"],
    emitting: ["send"],
    dispatch: ["send"],
    transmit: ["send"],

    // Check / validate related
    validate: ["check"],
    validating: ["check"],
    verify: ["check"],
    verifying: ["check"],
    ensure: ["check"],
    look: ["check"],

    // Delete / remove related
    remove: ["delete"],
    removing: ["delete"],
    clear: ["delete"],
    clearing: ["delete"],
    erase: ["delete"],

    // Build / create related
    create: ["build"],
    creating: ["build"],
    make: ["validate", "build"],
    making: ["validate", "build"],
    generate: ["build"],
    generating: ["build"],
    initialize: ["build"],
    init: ["build"],

    // Update / modify related
    modify: ["update"],
    modifying: ["update"],
    edit: ["update"],
    editing: ["update"],
    change: ["update"],
    changing: ["update"],
    alter: ["update"],

    // User related
    client: ["user"],
    member: ["user"],
    account: ["user"],

    // Execute / run related
    run: ["execute"],
    running: ["execute"],
    call: ["execute"],
    calling: ["execute"],
    invoke: ["execute"],
    trigger: ["execute"],

    // Connect related
    link: ["connect"],
    linking: ["connect"],
    attach: ["connect"],
    attaching: ["connect"],
    bind: ["connect"]
  };

  const stopWords = new Set([
    "if", "else", "return", "const", "let", "var", "new", "true", "false", "null",
    "undefined", "async", "await", "function", "throw", "for", "while", "do", "switch",
    "case", "break", "continue", "this", "typeof", "instanceof", "import", "export",
    "default", "class", "extends", "super", "try", "catch", "finally", "the", "a", "an",
    "is", "in", "of", "to", "and", "or", "not", "with", "from", "by", "at", "on", "be",
    "it", "that"
  ]);

  const keywords = new Set([
    "const", "let", "var", "if", "else", "return", "async", "await", "throw",
    "new", "null", "true", "false", "function", "for", "while", "class", "try",
    "catch", "switch", "case", "break", "continue"
  ]);

  function lineStartsWithComment(line) {
    return /^\s*\/\//.test(line);
  }

  function dismissKey(word, type, suggestion) {
    return `${word.toLowerCase()}|${type}|${(suggestion || "").toLowerCase()}`;
  }

  function normalizeLookupWord(word) {
    return (word || "")
      .toLowerCase()
      .replace(/^[^a-z]+|[^a-z]+$/g, "");
  }

  function normalizeTeamTerm(word) {
    const token = normalizeLookupWord(word);
    if (!token) return "";
    if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
    if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
    return token;
  }

  function splitIdentifierParts(token) {
    return token
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function extractTeamTermsFromCode() {
    const freq = new Map();
    const wordRegex = /[A-Za-z][A-Za-z0-9_]*/g;
    let match;
    while ((match = wordRegex.exec(PREWRITTEN_MEMBERS_CODE)) !== null) {
      const parts = splitIdentifierParts(match[0]);
      parts.forEach((part) => {
        const normalized = normalizeTeamTerm(part);
        if (!normalized || stopWords.has(normalized)) return;
        freq.set(normalized, (freq.get(normalized) || 0) + 1);
      });
    }
    const terms = new Set();
    freq.forEach((count, term) => {
      if (count >= 2) terms.add(term);
    });
    return terms;
  }

  const TEAM_TERM_FREQUENCY = (() => {
    const freq = new Map();
    const wordRegex = /[A-Za-z][A-Za-z0-9_]*/g;
    let match;
    while ((match = wordRegex.exec(PREWRITTEN_MEMBERS_CODE)) !== null) {
      const parts = splitIdentifierParts(match[0]);
      parts.forEach((part) => {
        const normalized = normalizeTeamTerm(part);
        if (!normalized || stopWords.has(normalized)) return;
        freq.set(normalized, (freq.get(normalized) || 0) + 1);
      });
    }
    return freq;
  })();

  function getRankLabel(rank) {
    if (rank === 0) return "Most appropriate";
    if (rank <= 2) return "Good alternative";
    return "Domain term";
  }

  function rankRecommendations(candidates) {
    const unique = [];
    const seen = new Set();
    candidates.forEach((c) => {
      const n = normalizeLookupWord(c);
      if (n && !seen.has(n)) {
        seen.add(n);
        unique.push(n);
      }
    });
    unique.sort((a, b) => {
      const fb = TEAM_TERM_FREQUENCY.get(b) || 0;
      const fa = TEAM_TERM_FREQUENCY.get(a) || 0;
      if (fb !== fa) return fb - fa;
      return candidates.indexOf(a) - candidates.indexOf(b);
    });
    return unique.slice(0, 5).map((term, idx) => ({
      term,
      label: getRankLabel(idx),
      rank: idx + 1,
      frequency: TEAM_TERM_FREQUENCY.get(term) || 0
    }));
  }

  function getSuggestionForToken(rawWord, isComment, typoMap, teamTerms) {
    const normalized = normalizeLookupWord(rawWord);
    if (!normalized) return null;

    if (Object.prototype.hasOwnProperty.call(typoMap, normalized)) {
      return {
        type: "typo",
        suggestion: typoMap[normalized] || "No suggestion available",
        normalized
      };
    }

    if (!isComment) return null;
    const mappedCandidates = synonymMap[normalized];
    if (!mappedCandidates) return null;
    if (teamTerms.has(normalized)) return null;
    const candidates = Array.isArray(mappedCandidates) ? mappedCandidates : [mappedCandidates];
    const ranked = rankRecommendations(candidates);
    const mapped = ranked.find((candidate) => teamTerms.has(candidate.term));
    if (!mapped) return null;

    return {
      type: "term",
      suggestion: mapped.term,
      normalized,
      recommendations: ranked
    };
  }

  function tokenizeFlags(text, typoMap, teamTerms, dismissedSet) {
    const flags = [];
    const lines = text.split("\n");
    let offset = 0;
    lines.forEach((line, lineIndex) => {
      const isComment = lineStartsWithComment(line);
      const wordRegex = /[A-Za-z][A-Za-z']*/g;
      let match;
      while ((match = wordRegex.exec(line)) !== null) {
        const rawWord = match[0];
        const word = rawWord.toLowerCase();
        const start = offset + match.index;
        const end = start + rawWord.length;
        const resolution = getSuggestionForToken(rawWord, isComment, typoMap, teamTerms);
        if (!resolution) continue;
        const type = resolution.type;
        const suggestion = resolution.suggestion;
        const key = dismissKey(rawWord, type, suggestion);
        if (dismissedSet.has(key)) continue;

        flags.push({
          id: `${lineIndex}-${match.index}-${word}-${type}`,
          word: rawWord,
          line: lineIndex,
          col: match.index,
          start,
          end,
          type,
          suggestion,
          recommendations: resolution.recommendations || []
        });
      }
      offset += line.length + 1;
    });
    return flags;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function paintWithSyntaxAndFlags(text, flags) {
    const flagByStart = new Map(flags.map((f) => [f.start, f]));
    let out = "";
    let i = 0;
    while (i < text.length) {
      const lineEnd = text.indexOf("\n", i);
      const lineStop = lineEnd === -1 ? text.length : lineEnd;
      const line = text.slice(i, lineStop);
      const isCommentLine = /^\s*\/\//.test(line);
      if (isCommentLine) {
        let j = i;
        while (j < lineStop) {
          const flag = flagByStart.get(j);
          if (flag) {
            out += `<span class="${flag.type === "typo" ? "lexi-typo" : "lexi-term"}" data-flag-id="${flag.id}">${escapeHtml(text.slice(flag.start, flag.end))}</span>`;
            j = flag.end;
          } else {
            out += `<span class="com">${escapeHtml(text[j])}</span>`;
            j += 1;
          }
        }
      } else {
        let j = i;
        while (j < lineStop) {
          const flag = flagByStart.get(j);
          if (flag) {
            out += `<span class="${flag.type === "typo" ? "lexi-typo" : "lexi-term"}" data-flag-id="${flag.id}">${escapeHtml(text.slice(flag.start, flag.end))}</span>`;
            j = flag.end;
            continue;
          }
          const ch = text[j];
          if (ch === '"' || ch === "'" || ch === "`") {
            const quote = ch;
            let k = j + 1;
            while (k < lineStop) {
              if (text[k] === "\\" && k + 1 < lineStop) {
                k += 2;
                continue;
              }
              if (text[k] === quote) {
                k += 1;
                break;
              }
              k += 1;
            }
            out += `<span class="str">${escapeHtml(text.slice(j, k))}</span>`;
            j = k;
            continue;
          }
          const num = text.slice(j).match(/^\d+(\.\d+)?/);
          if (num) {
            out += `<span class="num">${num[0]}</span>`;
            j += num[0].length;
            continue;
          }
          const word = text.slice(j).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
          if (word) {
            const token = word[0];
            const next = text.slice(j + token.length).match(/^\s*\(/);
            if (keywords.has(token)) out += `<span class="kw">${token}</span>`;
            else if (next) out += `<span class="fn">${token}</span>`;
            else out += escapeHtml(token);
            j += token.length;
            continue;
          }
          out += escapeHtml(ch);
          j += 1;
        }
      }
      if (lineEnd !== -1) {
        out += "\n";
        i = lineEnd + 1;
      } else {
        i = lineStop;
      }
    }
    return out;
  }

  window.LEXI_SCANNER = {
    tokenizeFlags,
    paintWithSyntaxAndFlags,
    dismissKey,
    getSuggestionForToken,
    extractTeamTermsFromCode
  };
})();
