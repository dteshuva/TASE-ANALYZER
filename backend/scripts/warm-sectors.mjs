// Pre-compute every sector's peer benchmark and persist it to disk, so the API
// never has to compute a basket on a page load. Run on deploy and/or on a daily
// schedule (cron). Safe to re-run — it just refreshes the cache.
import { warmAll } from '../src/services/sectorBenchmark.js';

await warmAll();
console.log('sector benchmarks warmed.');
