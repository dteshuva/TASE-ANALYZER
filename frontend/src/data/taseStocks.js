// The TA-125 constituents (ticker + name), bundled so search autocomplete runs
// entirely client-side — no network round-trip per keystroke. Names are the nicer
// full forms for well-known companies and the exchange short name otherwise.
// Generated from backend/src/data/ta125_sectors.csv; regenerate if the index changes.
export const TASE_STOCKS = [
  { ticker: "TSEM", name: "Tower Semiconductor" },
  { ticker: "TEVA", name: "Teva Pharmaceutical Industries" },
  { ticker: "NVMI", name: "Nova Ltd" },
  { ticker: "ESLT", name: "Elbit Systems" },
  { ticker: "LUMI", name: "Bank Leumi" },
  { ticker: "POLI", name: "Bank Hapoalim" },
  { ticker: "PHOE", name: "The Phoenix Holdings" },
  { ticker: "ENLT", name: "ENLIGHT ENERGY" },
  { ticker: "DSCT", name: "Israel Discount Bank" },
  { ticker: "MZTF", name: "Mizrahi Tefahot Bank" },
  { ticker: "ORA", name: "Partner Communications" },
  { ticker: "BEZQ", name: "Bezeq Israeli Telecommunication" },
  { ticker: "HARL", name: "Harel Insurance" },
  { ticker: "NXSN", name: "NEXT VISION" },
  { ticker: "CLIS", name: "CLAL INSURANCE" },
  { ticker: "OPCE", name: "OPC ENERGY" },
  { ticker: "AZRG", name: "Azrieli Group" },
  { ticker: "NICE", name: "NICE Ltd" },
  { ticker: "CAMT", name: "CAMTEK" },
  { ticker: "MGOR", name: "MEGA OR" },
  { ticker: "NVPT", name: "NAVITAS PTRO PU" },
  { ticker: "TASE", name: "TASE" },
  { ticker: "ICL", name: "ICL Group" },
  { ticker: "FIBI", name: "First International Bank of Israel" },
  { ticker: "BIG", name: "BIG" },
  { ticker: "MMHD", name: "MENORA MIV HLD" },
  { ticker: "MGDL", name: "Migdal Insurance" },
  { ticker: "MLSR", name: "MELISRON" },
  { ticker: "NWMD", name: "NEWMED ENERG PU" },
  { ticker: "SAE", name: "Shufersal" },
  { ticker: "DORL", name: "DORAL ENERGY" },
  { ticker: "PAZ", name: "PAZ ENERGY" },
  { ticker: "DLEKG", name: "Delek Group" },
  { ticker: "MVNE", name: "MIVNE" },
  { ticker: "STRS", name: "Strauss Group" },
  { ticker: "BSEN", name: "BET SHEMESH" },
  { ticker: "SKBN", name: "SHIKUN & BINUI" },
  { ticker: "ENRG", name: "ENERGIX" },
  { ticker: "SPEN", name: "SHAPIR ENG" },
  { ticker: "NOFR", name: "NOFAR ENERGY" },
  { ticker: "PTNR", name: "PARTNER" },
  { ticker: "MTAV", name: "MEITAV INVEST" },
  { ticker: "ALHE", name: "ALONY HETZ" },
  { ticker: "AMOT", name: "AMOT" },
  { ticker: "TRPZ", name: "TURPAZ" },
  { ticker: "FTAL", name: "FATTAL HOLD" },
  { ticker: "ELAL", name: "El Al Israel Airlines" },
  { ticker: "GNRS", name: "GENERATION CAP" },
  { ticker: "MTRX", name: "MATRIX" },
  { ticker: "FIBIH", name: "FIBI HOLDINGS" },
  { ticker: "MAXO", name: "MAX STOCK" },
  { ticker: "ENOG", name: "ENERGEAN" },
  { ticker: "ELTR", name: "ELECTRA" },
  { ticker: "RIT1", name: "REIT 1" },
  { ticker: "HLAN", name: "HILAN" },
  { ticker: "KEN", name: "KENON" },
  { ticker: "MSKE", name: "MESHEK ENERGY" },
  { ticker: "ILCO", name: "ISRAEL CORP" },
  { ticker: "CEL", name: "Cellcom Israel" },
  { ticker: "GILT", name: "GILAT" },
  { ticker: "RATI", name: "RATIO PU" },
  { ticker: "DIMRI", name: "DIMRI" },
  { ticker: "ISRA", name: "ISRAMCO PU" },
  { ticker: "QLTU", name: "QUALITAU" },
  { ticker: "ORL", name: "BAZAN" },
  { ticker: "FORTY", name: "FORMULA" },
  { ticker: "ISCN", name: "Israel Canada" },
  { ticker: "ONE", name: "ONE TECHNOLOGI" },
  { ticker: "ASHG", name: "ASHTROM GROUP" },
  { ticker: "RMLI", name: "Rami Levy" },
  { ticker: "NYAX", name: "NAYAX" },
  { ticker: "ARPT", name: "AIRPORT CITY" },
  { ticker: "ARGO", name: "ARGO PROP." },
  { ticker: "AURA", name: "AURA" },
  { ticker: "INRM", name: "INROM CONST" },
  { ticker: "SLARL", name: "SELLA REAL EST" },
  { ticker: "PRTC", name: "PRIORTECH" },
  { ticker: "FOX", name: "FOX" },
  { ticker: "GVYM", name: "GAV YAM" },
  { ticker: "MISH", name: "MIVTACH SHAMIR" },
  { ticker: "ISRO", name: "ISROTEL" },
  { ticker: "ISCD", name: "ISRACARD" },
  { ticker: "ARYT", name: "ARYT" },
  { ticker: "KSTN", name: "KEYSTONE INFRA" },
  { ticker: "DANE", name: "DANEL" },
  { ticker: "MRIN", name: "MORE INVEST" },
  { ticker: "IBI", name: "IBI INV HOUSE" },
  { ticker: "IDIN", name: "IDI INSUR" },
  { ticker: "VRDS", name: "VERIDIS" },
  { ticker: "BLSR", name: "BLUE SQ REAL ES" },
  { ticker: "AYAL", name: "AYALON HOLD." },
  { ticker: "NTML", name: "NETO MALINDA" },
  { ticker: "DNYA", name: "DANYA CEBUS" },
  { ticker: "RMON", name: "RIMON" },
  { ticker: "ELCRE", name: "ELECTRA REAL E." },
  { ticker: "EQTL", name: "EQUITAL" },
  { ticker: "CRSM", name: "CARASSO MOTORS" },
  { ticker: "YHNF", name: "YOCHANANOF" },
  { ticker: "DELG", name: "Delta Galil" },
  { ticker: "AFPR", name: "AFI PROPERTIES" },
  { ticker: "SCOP", name: "SCOPE" },
  { ticker: "SMT", name: "SUMMIT" },
  { ticker: "ECNR", name: "ECONERGY" },
  { ticker: "ACRO", name: "ACRO KVUT" },
  { ticker: "IES", name: "IES" },
  { ticker: "AFRE", name: "AFRICA RESIDENC" },
  { ticker: "AZRM", name: "AZORIM" },
  { ticker: "ELCO", name: "ELCO" },
  { ticker: "SBEN", name: "SHIKN&BINUI ENE" },
  { ticker: "RPOL", name: "RP OPTICAL" },
  { ticker: "LAPD", name: "LAPIDOTH CAP." },
  { ticker: "PRSK", name: "PRASHKOVSKY" },
  { ticker: "AMRM", name: "AMRM" },
  { ticker: "OPK", name: "OPKO HEALTH" },
  { ticker: "ISRS", name: "ISRAS" },
  { ticker: "LAHAV", name: "LAHAV" },
  { ticker: "AMPA", name: "AMPA" },
  { ticker: "PTBL", name: "PROPERT & BUIL" },
  { ticker: "ISHI", name: "ISRAEL SHIPYARD" },
  { ticker: "VILR", name: "VILLAR" },
  { ticker: "DLTI", name: "DELTA BRANDS" },
  { ticker: "TMRP", name: "TAMAR PET" },
  { ticker: "ACKR", name: "ACKERSTEIN GRP." },
  { ticker: "WESR", name: "WESURE GLOBALT" },
  { ticker: "UNMI", name: "UNIVERSAL" },
];

// Instant local autocomplete: match on ticker prefix, or any word in the company
// name starting with the query (so "bank" -> "Bank Hapoalim", "tower" -> TSEM).
// List order is index weight (most-traded first), so results stay sensibly ranked.
export function localSearchStocks(query, limit = 7) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) return [];
  const out = [];
  for (const s of TASE_STOCKS) {
    const name = s.name.toLowerCase();
    const hit =
      s.ticker.toLowerCase().startsWith(needle) ||
      name.startsWith(needle) || // full-name prefix, so multi-word queries ("el al") match
      name.split(/\s+/).some((w) => w.startsWith(needle));
    if (hit) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// Merge instant local matches with Yahoo's long-tail results: local first (clean
// names, most-traded), then any Yahoo extras not already present, deduped by
// ticker and capped at `limit`. Lets stocks outside TA-125 still surface.
export function mergeStockResults(local, remote, limit = 7) {
  const seen = new Set(local.map((s) => s.ticker.toUpperCase()));
  const out = [...local];
  for (const r of remote || []) {
    const key = r.ticker?.toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
