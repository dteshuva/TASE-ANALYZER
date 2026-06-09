// A small curated list of well-known TASE-listed companies, used to power search
// autocomplete for generic terms (e.g. "bank", "insurance") where Yahoo's own
// search ranks foreign listings above the .TA ones and returns no TASE matches.
// Every ticker here has been verified to resolve via /api/quote.
export const TASE_STOCKS = [
  { ticker: 'TEVA', name: 'Teva Pharmaceutical Industries' },
  { ticker: 'POLI', name: 'Bank Hapoalim' },
  { ticker: 'LUMI', name: 'Bank Leumi' },
  { ticker: 'MZTF', name: 'Mizrahi Tefahot Bank' },
  { ticker: 'DSCT', name: 'Israel Discount Bank' },
  { ticker: 'FIBI', name: 'First International Bank of Israel' },
  { ticker: 'NICE', name: 'NICE Ltd' },
  { ticker: 'ESLT', name: 'Elbit Systems' },
  { ticker: 'ICL', name: 'ICL Group' },
  { ticker: 'NVMI', name: 'Nova Ltd' },
  { ticker: 'CEL', name: 'Cellcom Israel' },
  { ticker: 'ORA', name: 'Partner Communications' },
  { ticker: 'BEZQ', name: 'Bezeq Israeli Telecommunication' },
  { ticker: 'AZRG', name: 'Azrieli Group' },
  { ticker: 'ISCN', name: 'Israel Canada' },
  { ticker: 'PHOE', name: 'The Phoenix Holdings' },
  { ticker: 'HARL', name: 'Harel Insurance' },
  { ticker: 'MGDL', name: 'Migdal Insurance' },
  { ticker: 'SAE', name: 'Shufersal' },
  { ticker: 'RMLI', name: 'Rami Levy' },
  { ticker: 'STRS', name: 'Strauss Group' },
  { ticker: 'OSEM', name: 'Osem Investments' },
  { ticker: 'DLEKG', name: 'Delek Group' },
  { ticker: 'DELG', name: 'Delta Galil' },
  { ticker: 'ELAL', name: 'El Al Israel Airlines' },
];
