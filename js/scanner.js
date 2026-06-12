(function () {
  const stopWords = new Set([
    "if", "else", "return", "const", "let", "var", "new", "true", "false", "null",
    "undefined", "async", "await", "function", "throw", "for", "while", "do", "switch",
    "case", "break", "continue", "this", "typeof", "instanceof", "import", "export",
    "default", "class", "extends", "super", "try", "catch", "finally", "the", "a", "an",
    "is", "in", "of", "to", "and", "or", "not", "with", "from", "by", "at", "on", "be",
    "it", "that", "for", "using", "make", "sure", "its", "was", "before", "after",
    "missing", "invalid", "server", "occurred", "result", "loaded", "path", "reading"
  ]);

  const keywords = new Set([
    "const", "let", "var", "if", "else", "return", "async", "await", "throw",
    "new", "null", "true", "false", "function", "for", "while", "class", "try",
    "catch", "switch", "case", "break", "continue"
  ]);

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
    if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
    return token;
  }

  function collectTextContentRegions(text) {
    const regions = [];
    let i = 0;
    let mode = "code";
    let quote = "";
    let regionStart = 0;

    function closeRegion(end) {
      if (end > regionStart) regions.push([regionStart, end]);
    }

    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];

      if (mode === "code") {
        if (ch === "/" && next === "/") {
          regionStart = i + 2;
          mode = "linecomment";
          i += 2;
          continue;
        }
        if (ch === "/" && next === "*") {
          regionStart = i + 2;
          mode = "blockcomment";
          i += 2;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          quote = ch;
          regionStart = i + 1;
          mode = "string";
          i += 1;
          continue;
        }
        i += 1;
        continue;
      }

      if (mode === "linecomment") {
        if (ch === "\n") {
          closeRegion(i);
          mode = "code";
        }
        i += 1;
        continue;
      }

      if (mode === "blockcomment") {
        if (ch === "*" && next === "/") {
          closeRegion(i);
          mode = "code";
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }

      if (mode === "string") {
        if (ch === "\\" && i + 1 < text.length) {
          i += 2;
          continue;
        }
        if (ch === quote) {
          closeRegion(i);
          mode = "code";
          quote = "";
        }
        i += 1;
      }
    }

    if (mode === "linecomment" || mode === "blockcomment" || mode === "string") {
      closeRegion(text.length);
    }

    return regions;
  }

  function isOffsetInRegions(offset, regions) {
    return regions.some(([start, end]) => offset >= start && offset < end);
  }

  function extractWordsFromRegions(text, regions) {
    const frequency = new Map();
    const terms = new Set();

    regions.forEach(([start, end]) => {
      const slice = text.slice(start, end);
      const wordRegex = /[A-Za-z][A-Za-z']*/g;
      let match;
      while ((match = wordRegex.exec(slice)) !== null) {
        const normalized = normalizeTeamTerm(match[0]);
        if (!normalized || stopWords.has(normalized)) continue;
        terms.add(normalized);
        frequency.set(normalized, (frequency.get(normalized) || 0) + 1);
      }
    });

    return { terms, frequency };
  }

  function extractLearnedVocabulary(memberCode) {
    const regions = collectTextContentRegions(memberCode || "");
    return extractWordsFromRegions(memberCode || "", regions);
  }

  function createScannerContext(team) {
    const memberCode = team.memberCode || "";
    const learned = extractLearnedVocabulary(memberCode);
    return {
      teamTerms: learned.terms,
      teamTermFrequency: learned.frequency,
      synonymMap: team.synonymMap || {},
      learnedTerms: [...learned.terms].sort((a, b) => (
        (learned.frequency.get(b) || 0) - (learned.frequency.get(a) || 0)
      ))
    };
  }

  function getRankLabel(rank) {
    if (rank === 0) return "Team standard";
    if (rank <= 2) return "Learned term";
    return "Team usage";
  }

  function rankLearnedRecommendations(candidates, teamTerms, teamTermFrequency) {
    const unique = [];
    const seen = new Set();

    candidates.forEach((candidate) => {
      const normalized = normalizeLookupWord(candidate);
      if (!normalized || seen.has(normalized)) return;
      if (!teamTerms.has(normalized)) return;
      if ((teamTermFrequency.get(normalized) || 0) <= 0) return;
      seen.add(normalized);
      unique.push(normalized);
    });

    unique.sort((a, b) => {
      const fb = teamTermFrequency.get(b) || 0;
      const fa = teamTermFrequency.get(a) || 0;
      if (fb !== fa) return fb - fa;
      return candidates.indexOf(a) - candidates.indexOf(b);
    });

    return unique.slice(0, 5).map((term, idx) => ({
      term,
      label: getRankLabel(idx),
      rank: idx + 1,
      frequency: teamTermFrequency.get(term) || 0
    }));
  }

  function resolveTypoSuggestion(normalized, typoMap) {
    if (Object.prototype.hasOwnProperty.call(typoMap, normalized)) {
      return typoMap[normalized] || "No suggestion available";
    }

    const compact = normalized.replace(/-/g, "");
    const typoEntry = Object.entries(typoMap).find(([typo]) => (
      typo.replace(/-/g, "") === compact
    ));
    if (typoEntry) return typoEntry[1] || "No suggestion available";
    return null;
  }

  function getSuggestionForToken(rawWord, termEligible, typoMap, scannerContext) {
    const normalized = normalizeLookupWord(rawWord);
    if (!normalized) return null;

    const typoSuggestion = resolveTypoSuggestion(normalized, typoMap);
    if (typoSuggestion) {
      return {
        type: "typo",
        suggestion: typoSuggestion,
        normalized
      };
    }

    if (!termEligible) return null;

    const { teamTerms, teamTermFrequency, synonymMap } = scannerContext;
    if (teamTerms.has(normalized)) return null;

    const mappedCandidates = synonymMap[normalized];
    if (!mappedCandidates) return null;

    const candidates = Array.isArray(mappedCandidates) ? mappedCandidates : [mappedCandidates];
    const ranked = rankLearnedRecommendations(candidates, teamTerms, teamTermFrequency);
    if (!ranked.length) return null;

    return {
      type: "term",
      suggestion: ranked[0].term,
      normalized,
      recommendations: ranked
    };
  }

  function tokenizeFlags(text, typoMap, scannerContext, dismissedSet) {
    const flags = [];
    const textRegions = collectTextContentRegions(text);
    const lines = text.split("\n");
    let offset = 0;

    lines.forEach((line, lineIndex) => {
      const wordRegex = /[A-Za-z][A-Za-z']*/g;
      let match;
      while ((match = wordRegex.exec(line)) !== null) {
        const rawWord = match[0];
        const word = rawWord.toLowerCase();
        const start = offset + match.index;
        const end = start + rawWord.length;
        const termEligible = isOffsetInRegions(start, textRegions);
        const resolution = getSuggestionForToken(rawWord, termEligible, typoMap, scannerContext);
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
            out += `<span class="str">${escapeHtml(quote)}`;
            let p = j + 1;
            while (p < k - 1) {
              const innerFlag = flagByStart.get(p);
              if (innerFlag && innerFlag.end <= k) {
                out += `<span class="${innerFlag.type === "typo" ? "lexi-typo" : "lexi-term"}" data-flag-id="${innerFlag.id}">${escapeHtml(text.slice(innerFlag.start, innerFlag.end))}</span>`;
                p = innerFlag.end;
              } else {
                out += escapeHtml(text[p]);
                p += 1;
              }
            }
            out += `${escapeHtml(quote)}</span>`;
            j = k;
            continue;
          }
          if (text.startsWith("/*", j)) {
            let k = line.indexOf("*/", j + 2);
            if (k === -1) k = lineStop;
            else k += 2;
            out += `<span class="com">${escapeHtml(text.slice(j, k))}</span>`;
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
    extractLearnedVocabulary,
    createScannerContext
  };
})();
