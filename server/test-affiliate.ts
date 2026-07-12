/**
 * Standalone affiliate API tester — run with:
 *   npx tsx server/test-affiliate.ts
 *
 * Also tests CJ schema introspection so we know exactly what fields exist.
 */


const CJ_COMMISSIONS_URL = "https://commissions.api.cj.com/query";

async function introspectCJ() {
  const token = process.env.CJ_API_TOKEN;
  if (!token) { console.log("[CJ] CJ_API_TOKEN not set"); return; }

  const query = `{ __type(name: "PublisherCommissions") { fields { name type { name kind } } } }`;
  const r = await fetch(CJ_COMMISSIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await r.json();
  console.log("\n[CJ] PublisherCommissions schema fields:");
  const fields = data?.data?.__type?.fields ?? [];
  if (!fields.length) {
    console.log("  (none found — raw response):", JSON.stringify(data).slice(0, 500));
  } else {
    fields.forEach((f: any) => console.log(`  ${f.name}: ${f.type?.name ?? f.type?.kind}`));
  }
}

async function testImpact(label: string, accountSid: string | undefined, authToken: string | undefined) {
  if (!accountSid || !authToken) { console.log(`\n[${label}] credentials missing`); return; }

  const endDate = new Date();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;

  const params = new URLSearchParams({ ActionDateStart: fmt(startDate), ActionDateEnd: fmt(endDate), PageSize: "5" });
  const url = `https://api.impact.com/Mediapartners/${accountSid}/Actions.json?${params}`;
  console.log(`\n[${label}] GET ${url}`);
  const r = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"), Accept: "application/json" },
  });
  const text = await r.text();
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${text.slice(0, 400)}`);
}

async function testRakuten(path: string, token: string | undefined) {
  if (!token) { console.log(`\n[Rakuten] ${path} — token missing`); return; }

  const endDate = new Date();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;

  const params = new URLSearchParams({ token, start_date: fmt(startDate), end_date: fmt(endDate), network: "1" });
  const url = `${path}?${params}`;
  console.log(`\n[Rakuten] GET ${url.replace(token, "***")}`);
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await r.text();
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${text.slice(0, 400)}`);
}

async function testCJ() {
  const token = process.env.CJ_API_TOKEN;
  const cid = process.env.CJ_COMPANY_ID;
  if (!token || !cid) { console.log("[CJ] credentials missing"); return; }
  const d1 = new Date(Date.now()-30*24*60*60*1000).toISOString();
  const d2 = new Date().toISOString();
  const query = `{publisherCommissions(forPublishers:["${cid}"],sinceEventDate:"${d1}",beforeEventDate:"${d2}"){count payloadComplete records{id actionStatus advertiserName}}}`;
  const r = await fetch(CJ_COMMISSIONS_URL, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify({query}) });
  const data = await r.json();
  console.log(`\n[CJ] Status: ${r.status}`);
  if (data.errors?.length) console.log("Errors:", data.errors.map((e:any)=>e.message).join("; "));
  else console.log("Records:", (data?.data?.publisherCommissions?.records?.length ?? 0), "count:", data?.data?.publisherCommissions?.count);
}

async function main() {
  console.log("=== Affiliate API Tests ===\n");

  await introspectCJ();
  await testCJ();

  await testImpact("Impact", process.env.IMPACT_ACCOUNT_SID, process.env.IMPACT_AUTH_TOKEN);
  await testImpact("Fanatics-Impact", process.env.FANATICS_IMPACT_ACCOUNT_SID, process.env.FANATICS_IMPACT_AUTH_TOKEN);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
