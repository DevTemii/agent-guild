const baseUrl = "https://app.ai.self.xyz";
const bootstrapUrl = `${baseUrl}/api/agent/bootstrap`;
const registerUrl = `${baseUrl}/api/agent/register`;

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function collectByKeyPattern(value, pattern, path = []) {
  const matches = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      matches.push(...collectByKeyPattern(entry, pattern, [...path, String(index)]));
    });
    return matches;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const nextPath = [...path, key];
      if (pattern.test(key) && entry !== null && entry !== undefined && entry !== "") {
        matches.push({ path: nextPath.join("."), value: entry });
      }
      matches.push(...collectByKeyPattern(entry, pattern, nextPath));
    });
  }

  return matches;
}

function firstMatch(value, pattern) {
  return collectByKeyPattern(value, pattern)[0] ?? null;
}

function extractImportantFields(payload) {
  return {
    registrationId: firstMatch(payload, /(registration.*id|agent.*id|^id$)/i),
    sessionId: firstMatch(payload, /(session.*id)/i),
    token: firstMatch(payload, /(^token$|session.*token|registration.*token)/i),
    qrReference: firstMatch(payload, /(qr.*(url|ref|reference|data)|scan.*url)/i),
    deepLink: firstMatch(payload, /(deep.?link)/i),
  };
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await response.text();

  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  return { response, body, json };
}

async function main() {
  const bootstrap = await getJson(bootstrapUrl, { method: "GET" });
  if (!bootstrap.response.ok || !bootstrap.json) {
    throw new Error(`Bootstrap failed with ${bootstrap.response.status}: ${bootstrap.body}`);
  }

  const registerSchema =
    bootstrap.json?.paths?.["/api/agent/register"]?.post?.requestBody?.content?.["application/json"]?.schema;

  const minimumRequestBody = {
    mode: "wallet-free",
    network: "testnet",
  };

  console.log("Bootstrap spec parsed successfully.");
  console.log("POST /api/agent/register required fields:");
  console.log(pretty(registerSchema?.required || []));
  console.log("Mode enum:");
  console.log(pretty(registerSchema?.properties?.mode?.enum || []));
  console.log("Network enum:");
  console.log(pretty(registerSchema?.properties?.network?.enum || []));
  console.log("Minimum valid request body selected:");
  console.log(pretty(minimumRequestBody));

  const register = await getJson(registerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(minimumRequestBody),
  });

  console.log("POST request body used:");
  console.log(pretty(minimumRequestBody));
  console.log("Full JSON response from POST /api/agent/register:");
  console.log(register.json ? pretty(register.json) : register.body);

  if (!register.response.ok || !register.json) {
    throw new Error(`Registration failed with ${register.response.status}: ${register.body}`);
  }

  const extractedFromRegister = extractImportantFields(register.json);
  const token =
    extractedFromRegister.token?.value ||
    register.json?.token ||
    register.json?.sessionToken ||
    register.json?.session?.token ||
    null;

  let qr = null;
  let status = null;

  if (token) {
    qr = await getJson(`${baseUrl}/api/agent/register/qr`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    status = await getJson(`${baseUrl}/api/agent/register/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  console.log("Extracted registration fields:");
  console.log(
    pretty({
      registrationId: extractedFromRegister.registrationId,
      sessionId: extractedFromRegister.sessionId,
      token: extractedFromRegister.token,
      qrReference: extractedFromRegister.qrReference,
      deepLink: extractedFromRegister.deepLink,
    })
  );

  if (qr) {
    console.log("Full JSON response from GET /api/agent/register/qr:");
    console.log(qr.json ? pretty(qr.json) : qr.body);
  }

  if (status) {
    console.log("Full JSON response from GET /api/agent/register/status:");
    console.log(status.json ? pretty(status.json) : status.body);
  }

  const qrFields = qr?.json ? extractImportantFields(qr.json) : null;
  const statusStage =
    status?.json?.stage ||
    status?.json?.status ||
    firstMatch(status?.json, /(stage|status)/i)?.value ||
    null;

  console.log("Summary:");
  console.log(
    pretty({
      registrationId:
        extractedFromRegister.registrationId?.value ||
        extractedFromRegister.sessionId?.value ||
        null,
      qrLink:
        qrFields?.qrReference?.value ||
        register.json?.scanUrl ||
        qr?.json?.scanUrl ||
        qr?.json?.qrUrl ||
        qr?.json?.qr?.url ||
        null,
      deepLink:
        extractedFromRegister.deepLink?.value ||
        qrFields?.deepLink?.value ||
        qr?.json?.deepLink ||
        null,
      currentStatus: statusStage,
      token,
    })
  );
}

try {
  await main();
} catch (error) {
  console.error("Self registration flow failed.");
  console.error(error);
  process.exitCode = 1;
}
