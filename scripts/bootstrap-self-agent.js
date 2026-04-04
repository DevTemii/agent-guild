const url = "https://app.ai.self.xyz/api/agent/bootstrap";

function extractUrls(body) {
  const matches = body.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  return [...new Set(matches)];
}

function printExtractedLinks(urls) {
  if (urls.length === 0) {
    console.log("Extracted URLs: none found");
    return;
  }

  console.log("Extracted URLs:");
  urls.forEach((entry) => console.log(`- ${entry}`));

  const highlighted = urls.filter((entry) =>
    /(verify|verification|register|registration|qr|claim|session|auth)/i.test(
      entry
    )
  );

  if (highlighted.length > 0) {
    console.log("Verification or registration links:");
    highlighted.forEach((entry) => console.log(`- ${entry}`));
  }
}

async function main() {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    console.log("GET", url);
    console.log("Final URL:", response.url);
    console.log("Status:", response.status, response.statusText);
    console.log("Content-Type:", contentType || "unknown");
    console.log("Full response body:");
    console.log(body);

    if (/html/i.test(contentType) || /<html[\s>]/i.test(body)) {
      printExtractedLinks(extractUrls(body));
      return;
    }

    try {
      const parsed = JSON.parse(body);
      const normalizedBody = JSON.stringify(parsed, null, 2);
      const urls = extractUrls(normalizedBody);
      printExtractedLinks(urls);
    } catch {
      const urls = extractUrls(body);
      printExtractedLinks(urls);
    }
  } catch (error) {
    console.error("Bootstrap request failed.");
    console.error(error);
    process.exitCode = 1;
  }
}

await main();
