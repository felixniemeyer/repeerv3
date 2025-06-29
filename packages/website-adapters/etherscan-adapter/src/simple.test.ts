/**
 * @jest-environment jsdom
 */

describe('EtherscanAdapter Basic Tests', () => {
  it('should be able to run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have DOM available', () => {
    const div = document.createElement('div');
    div.textContent = 'test';
    expect(div.textContent).toBe('test');
  });

  it('should be able to mock functions', () => {
    const mockFn = jest.fn();
    mockFn.mockReturnValue('test');
    expect(mockFn()).toBe('test');
  });
});