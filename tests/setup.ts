import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

beforeAll(async () => {
  // Clean up any existing test data
  try {
    await execAsync('rm -rf test_data/');
    await execAsync('mkdir -p test_data/{alice,bob,charlie}');
  } catch (error) {
    console.log('Setup cleanup warning:', error);
  }
});

afterAll(async () => {
  // Clean up test data after tests
  try {
    await execAsync('rm -rf test_data/');
  } catch (error) {
    console.log('Cleanup warning:', error);
  }
});