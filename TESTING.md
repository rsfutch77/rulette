# Jest Testing Setup

This project is now configured with Jest for JavaScript testing. The pytest detection issue has been resolved by properly configuring VSCode for Jest.

## What's Been Set Up

### 1. Jest Configuration
- **jest.config.js**: Main Jest configuration file
- **Test Environment**: jsdom for DOM testing
- **Coverage**: Configured with 70% threshold
- **File Patterns**: Tests in `__tests__/` folders or files ending with `.test.js` or `.spec.js`

### 2. VSCode Integration
- **Settings**: `.vscode/settings.json` disables Python testing and enables Jest
- **Launch Config**: `.vscode/launch.json` for debugging Jest tests
- **Test Explorer**: Native VSCode testing support enabled

### 3. Project Scripts
- `npm test`: Run all tests
- `npm run test:watch`: Run tests in watch mode
- `npm run test:coverage`: Run tests with coverage report
- `npm run test:debug`: Debug tests with Node inspector

### 4. Support Files
- **Mock Files**: `__mocks__/fileMock.js` for static assets
- **Setup**: `src/setupTests.js` for global test configuration
- **Sample Test**: `__tests__/sample.test.js` to verify setup

## How to Use

### Running Tests
```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Debug tests
npm run test:debug
```

### Writing Tests
Create test files in one of these locations:
- `__tests__/` directory with `.js` extension
- Anywhere with `.test.js` or `.spec.js` extension

Example test:
```javascript
describe('My Component', () => {
  test('should render correctly', () => {
    // Your test code here
    expect(true).toBe(true);
  });
});
```

### VSCode Features
- **Test Explorer**: View and run tests from the sidebar
- **IntelliSense**: Auto-completion for Jest functions
- **Debugging**: Set breakpoints and debug tests
- **Coverage**: View coverage highlights in editor

### Debugging Tests
1. Open a test file
2. Set breakpoints by clicking in the gutter
3. Press F5 or use "Debug Current Jest Test" configuration
4. Step through your code using the debugger

## Troubleshooting

If you see pytest errors:
1. Reload VSCode window (Ctrl+Shift+P → "Developer: Reload Window")
2. Check that Python extensions are disabled for this workspace
3. Verify Jest is installed: `npm list jest`

The VSCode settings have been configured to disable Python testing and enable Jest, so you should no longer see pytest-related messages.