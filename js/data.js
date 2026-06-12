(function () {
  const CSV_PATH = "./data/LEXI_Data_Mining_Summary.csv";

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '"' && inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i += 1;
        if (cell.length > 0 || row.length > 0) {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        }
      } else {
        cell += ch;
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    if (!rows.length) return [];
    const header = rows[0];
    return rows.slice(1).map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h.trim()] = (r[idx] || "").trim(); });
      return obj;
    });
  }

  function normalizeSuggestion(raw) {
    const value = (raw || "").trim().toLowerCase();
    if (!value || value.startsWith("n/a")) return "";
    return value;
  }

  function parseDatasetRows(rows) {
    const standardTerms = new Map();
    const typoMap = {};

    rows.forEach((r) => {
      const token = (r["Word/Token"] || "").toLowerCase();
      const freq = parseInt(r["Frequency Count"], 10) || 0;
      const type = (r["LEXI System Classification"] || "").toLowerCase();
      const suggestion = normalizeSuggestion(r["Target Suggestion"]);

      if (!token) return;

      if (type.includes("team standard term")) {
        standardTerms.set(token, freq);
      } else if (type.includes("pure typo candidate") && suggestion) {
        typoMap[token] = suggestion;
      }
    });

    return { standardTerms, typoMap, rows };
  }

  const SEMANTIC_DOMAINS = [
    {
      id: "auth",
      label: "Authentication",
      candidates: ["authentication", "login", "authorization", "session"]
    },
    {
      id: "error",
      label: "Error Handling",
      candidates: ["error", "exception", "issue", "problem", "failure", "warning", "validation"]
    },
    {
      id: "data",
      label: "Data",
      candidates: ["data", "record", "entry", "value", "information"]
    },
    {
      id: "file",
      label: "File Management",
      candidates: ["file", "document", "resource", "path", "directory"]
    },
    {
      id: "actor",
      label: "User / Client",
      candidates: ["user", "client", "account"]
    },
    {
      id: "retrieve",
      label: "Data Retrieval",
      candidates: ["fetch", "retrieve", "load"]
    },
    {
      id: "output",
      label: "Output",
      candidates: ["display", "show", "print"]
    },
    {
      id: "persist",
      label: "Persistence",
      candidates: ["store", "save"]
    },
    {
      id: "validate",
      label: "Validation",
      candidates: ["check", "validate", "verify"]
    }
  ];

  function buildSemanticClusters(standardTerms) {
    return SEMANTIC_DOMAINS.map((domain) => {
      const terms = domain.candidates
        .filter((term) => standardTerms.has(term))
        .sort((a, b) => standardTerms.get(b) - standardTerms.get(a));
      return {
        id: domain.id,
        label: domain.label,
        terms
      };
    }).filter((cluster) => cluster.terms.length >= 2);
  }

  function buildSynonymMap(clusters, teamPreferences, standardTerms) {
    const preferred = new Set(Object.values(teamPreferences));
    const synonymMap = {};

    clusters.forEach((cluster) => {
      const preferredTerm = teamPreferences[cluster.id];
      if (!preferredTerm) return;

      cluster.terms.forEach((term) => {
        if (term === preferredTerm) return;
        synonymMap[term] = [preferredTerm, ...cluster.terms.filter((item) => item !== term)];
      });
    });

    standardTerms.forEach((_, baseTerm) => {
      if (!preferred.has(baseTerm)) return;
      const ing = `${baseTerm}ing`;
      if (standardTerms.has(ing)) synonymMap[ing] = [baseTerm];
    });

    return synonymMap;
  }

  function pickAlternate(cluster, preferredTerm) {
    return cluster.find((term) => term !== preferredTerm) || preferredTerm;
  }

  function findTypoForTarget(typoMap, target) {
    const matches = Object.entries(typoMap).filter(([, suggestion]) => (
      suggestion === target || suggestion.replace(/-/g, "") === target.replace(/-/g, "")
    ));
    if (!matches.length) return null;
    matches.sort((a, b) => a[0].length - b[0].length);
    return matches[0][0];
  }

  function generateMemberCode(team) {
    const vocab = team.vocabulary;
    const auth = vocab.auth || "authentication";
    const e = vocab.error || "error";
    const f = vocab.file || "file";
    const d = vocab.data || "data";
    const u = vocab.actor || "user";
    const r = vocab.retrieve || "fetch";
    const o = vocab.output || "display";
    const v = vocab.validate || "check";

    return `// ─────────────────────────────────────────
// Member 1: ${auth.charAt(0).toUpperCase() + auth.slice(1)} module
// ─────────────────────────────────────────

const authenticate = (user, password) => {
  if (!user || !password) {
    console.error("Missing ${auth} credentials for ${u}");
    return null;
  }
  const token = generateToken(user);
  store.set("auth_token", token);
  return token;
};

const validateUser = (user) => {
  if (!user.name || !user.email) {
    console.error("Invalid ${u} ${d}");
    return false;
  }
  return true;
};

// ─────────────────────────────────────────
// Member 2: API and ${d} ${r}ing
// ─────────────────────────────────────────

const fetchData = async (endpoint, method = "GET") => {
  const response = await fetch(endpoint, { method });
  if (!response.ok) {
    throw new Error(\`Server ${e}: \${response.status}\`);
  }
  const data = await response.json();
  store.set("last_response", data);
  return data;
};

const fetchUserProfile = async (userId) => {
  const data = await fetchData(\`/api/users/\${userId}\`);
  store.set("current_${u}", data);
  return data;
};

// ─────────────────────────────────────────
// Member 3: ${o.charAt(0).toUpperCase() + o.slice(1)} and output utilities
// ─────────────────────────────────────────

const displayResult = (result) => {
  console.log("Result:", result);
  store.set("${o}_cache", result);
};

const displayError = (error) => {
  console.error("${e.charAt(0).toUpperCase() + e.slice(1)} occurred:", error.message);
  store.set("last_${e}", error);
};

const fetchConfig = async () => {
  const config = await fetchData("/api/config");
  store.set("app_config", config);
  return config;
};

const readProjectFile = async (path) => {
  // ${v.charAt(0).toUpperCase() + v.slice(1)} the ${f} path before reading ${d}
  const ${f}Data = await fetchData(\`/api/${f}s/\${path}\`);
  store.set("active_${f}", ${f}Data);
  return ${f}Data;
};`;
  }

  function typoOrWord(typoMap, target) {
    return findTypoForTarget(typoMap, target) || target;
  }

  function generateMember4Starter(team, typoMap) {
    const alt = team.alternates;
    const typoResponse = typoOrWord(typoMap, "response");
    const typoReceived = typoOrWord(typoMap, "received");
    const typoMemory = typoOrWord(typoMap, "memory");
    const typoSession = typoOrWord(typoMap, "session");
    const typoExplanatory = typoOrWord(typoMap, "self-explanatory");

    return `// Load ${alt.actor} info and show output on screen
// Get the ${typoResponse} from the server for the current ${alt.actor}
// This block should be ${typoExplanatory} for reviewers

const getUserInfo = async (userId) => {
  // ${alt.retrieve.charAt(0).toUpperCase() + alt.retrieve.slice(1)} the ${alt.data} from the server using a network call
  const result = await fetchData(\`/api/users/\${userId}\`);

  // Look at the ${typoReceived} ${alt.data} to make sure its valid
  if (!result || result.length === 0) {
    console.warn("No ${alt.data} ${typoReceived}");
    return null;
  }

  // Save the ${alt.data} in ${typoMemory} for later use
  const userRecord = result.data;

  // Show the output to confirm the ${alt.actor} info was loaded
  console.log("Loaded:", userRecord);

  return userRecord;
};

const removeUserSession = (userId) => {
  // Grab the current ${alt.actor} ${alt.file} from the server
  const session = store.get(\`session_\${userId}\`);

  // Make sure the ${alt.actor} is not already gone before deleting
  if (!session) {
    console.warn("No ${typoSession} found for ${alt.actor}");
    return false;
  }

  store.delete(\`session_\${userId}\`);
  return true;
};`;
  }

  function buildTeamProfile(definition, clusters, standardTerms, typoMap) {
    const preferences = {};
    clusters.forEach((cluster) => {
      const pickIndex = Math.min(definition.rank, cluster.terms.length - 1);
      const pick = cluster.terms[pickIndex];
      if (pick) preferences[cluster.id] = pick;
    });

    const alternates = {};
    clusters.forEach((cluster) => {
      alternates[cluster.id] = pickAlternate(cluster.terms, preferences[cluster.id]);
    });

    const vocabulary = { ...preferences };
    const preferredTerms = Object.values(preferences);
    const highlightTerms = [
      preferences.auth,
      preferences.error,
      preferences.data,
      preferences.file,
      preferences.actor
    ].filter(Boolean);

    const team = {
      id: definition.id,
      label: definition.label,
      rank: definition.rank,
      preferences,
      vocabulary,
      preferredTerms,
      alternates,
      highlightTerms,
      clusters: clusters.map((cluster) => ({
        id: cluster.id,
        label: cluster.label,
        terms: cluster.terms,
        preferred: preferences[cluster.id] || cluster.terms[0]
      })),
      datasetSource: CSV_PATH
    };

    team.synonymMap = buildSynonymMap(clusters, preferences, standardTerms);
    team.memberCode = generateMemberCode(team);
    team.member4Starter = generateMember4Starter(team, typoMap);

    return team;
  }

  function generateTeams(standardTerms, clusters, typoMap) {
    const teamDefs = [
      { id: "team-a", label: "Team A Simulation", rank: 0 },
      { id: "team-b", label: "Team B Simulation", rank: 1 },
      { id: "team-c", label: "Team C Simulation", rank: 2 }
    ];

    return teamDefs.map((def) => buildTeamProfile(def, clusters, standardTerms, typoMap));
  }

  async function loadLexiData() {
    const response = await fetch(CSV_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load dataset from ${CSV_PATH}`);
    }

    const csvRaw = await response.text();
    const rows = parseCsv(csvRaw);
    const { standardTerms, typoMap } = parseDatasetRows(rows);
    const clusters = buildSemanticClusters(standardTerms);
    const teams = generateTeams(standardTerms, clusters, typoMap);

    return {
      teams,
      typoMap,
      standardTerms,
      clusters,
      datasetSize: rows.length,
      datasetPath: CSV_PATH,
      typoCount: Object.keys(typoMap).length,
      standardTermCount: standardTerms.size
    };
  }

  window.LEXI_DATA = {
    loadLexiData,
    CSV_PATH
  };
})();
