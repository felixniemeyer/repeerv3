export * from './types';
export * from './client';
export * from './adapters';

import { TrustClient } from './client';
import { defaultRegistry } from './adapters';

export { TrustClient, defaultRegistry };

// Default export for convenience
export default TrustClient;