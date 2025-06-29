// Mock console.log to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
};