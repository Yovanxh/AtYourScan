import { suite as tier1 } from '../tests/tier1_features.test.mjs';
import { suite as tier3 } from '../tests/tier3_cross_feature.test.mjs';

async function run() {
  console.log('--- Tier 1 ---');
  await tier1.run();
  console.log('--- Tier 3 ---');
  await tier3.run();
}
run();
