import { HealthInspectorWorker } from './src/workers/health-inspector.worker';
HealthInspectorWorker.run().then(() => console.log('Done')).catch(console.error);
