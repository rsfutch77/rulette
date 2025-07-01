// Sample test file to verify Jest setup
describe('Jest Setup Verification', () => {
  test('should be able to run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have access to DOM environment', () => {
    document.body.innerHTML = '<div id="test">Hello World</div>';
    const element = document.getElementById('test');
    expect(element).toBeTruthy();
    expect(element.textContent).toBe('Hello World');
  });

  test('should handle async operations', async () => {
    const promise = Promise.resolve('async test');
    const result = await promise;
    expect(result).toBe('async test');
  });

  test('should support mocking', () => {
    const mockFn = jest.fn();
    mockFn('test argument');
    expect(mockFn).toHaveBeenCalledWith('test argument');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
