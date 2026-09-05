import { generateBatch } from './src/cli/generate-batch.js';
const batch = generateBatch();
const exc = Object.entries(batch.labels!).filter(([,l])=>l.expectedStatus==='EXCEPTION').map(([id])=>id);
console.log('EXC_SORTED_START');
console.log([...exc].sort().join('\n'));
console.log('EXC_COUNT',exc.length);
const keys = [...new Set(Object.values(batch.labels!).filter(l=>l.expectedGroupKey).map(l=>l.expectedGroupKey))].sort();
console.log('GKEYS', keys.length, keys.join(','));
