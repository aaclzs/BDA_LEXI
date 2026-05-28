(function () {
  const readOnlyCode = `// ─────────────────────────────────────────
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
};

// ──────────────────────────────────────────────────────
// Member 4 starts here ↓ (LEXI is active)
// ──────────────────────────────────────────────────────
`;

  const initialActiveCode = `// Load user info and show output on scren
// Get the responce from the databse for the current usr

const getUserInfo = async (userId) => {
  // Retrieve the data from the server using a network call
  const result = await fetchData(\`/api/users/\${userId}\`);

  // Look at the recieved data to make sure its valid
  if (!result || result.lenght === 0) {
    console.warn("No data recieved");
    return null;
  }

  // Save the retreived information in memmory for later use
  const userRecord = result.data;

  // Show the output to confirm the info was loaded
  console.log("Loaded:", userRecord);

  return userRecord;
};

const removeUserSession = (userId) => {
  // Grab the current user account from the databse
  const session = store.get(\`session_\${userId}\`);

  // Make sure the account is not already gone before deleting
  if (!session) {
    console.warn("No sesion found for user");
    return false;
  }

  store.delete(\`session_\${userId}\`);
  return true;
};`;

  const fallbackCsv = `Word/Token,Frequency Count,LEXI System Classification,Target Suggestion
check,341,Team Standard Term,N/A (Valid Domain Keyword)
show,325,Team Standard Term,N/A (Valid Domain Keyword)
display,298,Team Standard Term,N/A (Valid Domain Keyword)
store,290,Team Standard Term,N/A (Valid Domain Keyword)
send,285,Team Standard Term,N/A (Valid Domain Keyword)
information,271,Team Standard Term,N/A (Valid Domain Keyword)
fetch,265,Team Standard Term,N/A (Valid Domain Keyword)
retrieve,251,Team Standard Term,N/A (Valid Domain Keyword)
screen,230,Team Standard Term,N/A (Valid Domain Keyword)
query,229,Team Standard Term,N/A (Valid Domain Keyword)
database,221,Team Standard Term,N/A (Valid Domain Keyword)
details,219,Team Standard Term,N/A (Valid Domain Keyword)
response,214,Team Standard Term,N/A (Valid Domain Keyword)
received,212,Team Standard Term,N/A (Valid Domain Keyword)
length,200,Team Standard Term,N/A (Valid Domain Keyword)
retrieved,187,Team Standard Term,N/A (Valid Domain Keyword)
memory,172,Team Standard Term,N/A (Valid Domain Keyword)
scren,23,Pure Typo Candidate,screen
querry,30,Pure Typo Candidate,query
databse,26,Pure Typo Candidate,database
detials,27,Pure Typo Candidate,details
responce,22,Pure Typo Candidate,response
recieved,29,Pure Typo Candidate,received
lenght,18,Pure Typo Candidate,length
retreived,15,Pure Typo Candidate,retrieved
memmory,14,Pure Typo Candidate,memory`;

  const fallbackTypos = {
    usr: "user",
    scren: "screen",
    querry: "query",
    databse: "database",
    detials: "details",
    responce: "response",
    recieved: "received",
    lenght: "length",
    retreived: "retrieved",
    memmory: "memory",
    sesion: "session"
  };

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

  async function loadLexiData() {
    let csvRaw = "";
    try {
      const response = await fetch("./data/LEXI_Data_Mining_Summary.csv");
      if (!response.ok) throw new Error("fetch failed");
      csvRaw = await response.text();
    } catch (_err) {
      csvRaw = fallbackCsv;
    }

    const rows = parseCsv(csvRaw);
    const typoMap = { ...fallbackTypos };
    rows.forEach((r) => {
      const token = (r["Word/Token"] || "").toLowerCase();
      const type = (r["LEXI System Classification"] || "").toLowerCase();
      const suggestion = (r["Target Suggestion"] || "").toLowerCase();
      if (!token) return;
      if (type.includes("pure typo candidate")) {
        typoMap[token] = suggestion && !suggestion.startsWith("n/a") ? suggestion : "";
      }
    });

    return { typoMap, readOnlyCode, initialActiveCode };
  }

  window.LEXI_DATA = {
    loadLexiData,
    readOnlyCode,
    initialActiveCode
  };
})();
