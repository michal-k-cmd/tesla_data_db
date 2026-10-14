// Zjištění odchozí (veřejné) IP adresy, ze které appka volá ven – kvůli IP
// whitelistu Helios API. Na Vercelu se odchozí IP mezi běhy funkcí MĚNÍ
// (sdílený pool poskytovatele v regionu), proto ji logujeme u každého volání.

const SERVICES = ["https://api.ipify.org?format=json", "https://ifconfig.me/ip"];
const TIMEOUT_MS = 5000;

export type EgressInfo = {
  ip: string | null;
  /** Vercel region funkce (např. fra1, iad1); lokálně null */
  region: string | null;
  error?: string;
};

export async function getEgressInfo(): Promise<EgressInfo> {
  const region = process.env.VERCEL_REGION ?? null;
  let lastError = "";
  for (const url of SERVICES) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      if (!res.ok) { lastError = `${url}: HTTP ${res.status}`; continue; }
      const text = (await res.text()).trim();
      const ip = text.startsWith("{") ? String(JSON.parse(text).ip ?? "") : text;
      if (/^[0-9a-f.:]+$/i.test(ip)) return { ip, region };
      lastError = `${url}: neočekávaná odpověď`;
    } catch (e) {
      lastError = `${url}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { ip: null, region, error: lastError };
}
