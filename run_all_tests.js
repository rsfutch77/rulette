#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import readline from 'readline';

/**
 * Unified Test Orchestration Script
 * Runs Jest tests, console log tests, and UI tests sequentially
 */
class TestOrchestrator {
    constructor() {
        this.httpServer = null;
        this.results = {
            jest: null,
            console: [],
            ui: []
        };
        this.serverPort = 8080;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 Starting unified test orchestration...\n');
        
        try {
            // Step 1: Start HTTP server
            await this.startHttpServer();
            
            // Step 2: Run Jest tests
            await this.runJestTests();
            
            // Step 3: Run console log tests
            await this.runConsoleTests();
            
            // Step 4: Modify UI HTML files
            await this.modifyUITestFiles();
            
            // Step 5: Run UI tests
            await this.runUITests();
            
            // Step 6: Consolidate results
            await this.consolidateResults();
            
            console.log('\n✅ All tests completed successfully!');
            
        } catch (error) {
            console.error('\n❌ Test orchestration failed:', error.message);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Start HTTP server using http-server
     */
    async startHttpServer() {
        console.log('📡 Starting HTTP server...');
        
        return new Promise((resolve, reject) => {
            // Check if http-server is installed globally
            exec('http-server --version', (error) => {
                if (error) {
                    console.log('Installing http-server globally...');
                    exec('npm install -g http-server', (installError) => {
                        if (installError) {
                            reject(new Error('Failed to install http-server: ' + installError.message));
                            return;
                        }
                        this.startServer(resolve, reject);
                    });
                } else {
                    this.startServer(resolve, reject);
                }
            });
        });
    }

    /**
     * Helper method to start the server
     */
    startServer(resolve, reject) {
        this.httpServer = spawn('npx', ['http-server', '.', '-p', this.serverPort.toString(), '-c-1'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        let serverReady = false;

        this.httpServer.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Available on:') && !serverReady) {
                serverReady = true;
                console.log(`✅ HTTP server started on port ${this.serverPort}`);
                resolve();
            }
        });

        this.httpServer.stderr.on('data', (data) => {
            console.error('Server error:', data.toString());
        });

        this.httpServer.on('error', (error) => {
            reject(new Error('Failed to start HTTP server: ' + error.message));
        });

        // Timeout after 10 seconds
        setTimeout(() => {
            if (!serverReady) {
                reject(new Error('HTTP server failed to start within timeout'));
            }
        }, 10000);
    }

    /**
     * Run Jest tests
     */
    async runJestTests() {
        console.log('\n🧪 Running Jest tests...');
        
        return new Promise((resolve, reject) => {
            const jestProcess = spawn('npx', [
                'jest',
                '--json',
                '--outputFile=__tests__/jest-test-results.json',
                '--verbose',
                '--coverage'
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true
            });

            let output = '';
            let errorOutput = '';

            jestProcess.stdout.on('data', (data) => {
                output += data.toString();
                process.stdout.write(data);
            });

            jestProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                process.stderr.write(data);
            });

            jestProcess.on('close', (code) => {
                try {
                    // Read the JSON results file
                    if (fs.existsSync('__tests__/jest-test-results.json')) {
                        const jestResults = JSON.parse(fs.readFileSync('__tests__/jest-test-results.json', 'utf8'));
                        this.results.jest = jestResults;
                        console.log(`✅ Jest tests completed (${jestResults.numPassedTests}/${jestResults.numTotalTests} passed)`);
                    } else {
                        console.log('⚠️ Jest results file not found, using exit code');
                        this.results.jest = { success: code === 0, exitCode: code };
                    }
                    resolve();
                } catch (error) {
                    console.error('Error reading Jest results:', error.message);
                    this.results.jest = { success: false, error: error.message };
                    resolve(); // Continue with other tests
                }
            });

            jestProcess.on('error', (error) => {
                console.error('Jest process error:', error.message);
                this.results.jest = { success: false, error: error.message };
                resolve(); // Continue with other tests
            });
        });
    }

    /**
     * Run console log tests
     */
    async runConsoleTests() {
        console.log('\n📝 Running console log tests...');
        
        const consoleTests = [
            {
                script: '__tests__/test-integration-simple.js',
                output: '__tests__/console-integration-test-results.txt'
            },
            {
                script: '__tests__/test-rule-engine.js',
                output: '__tests__/console-rule-engine-test-results.txt'
            }
        ];

        for (const test of consoleTests) {
            await this.runConsoleTest(test.script, test.output);
        }
    }

    /**
     * Run individual console test
     */
    async runConsoleTest(scriptPath, outputPath) {
        return new Promise((resolve) => {
            console.log(`Running ${scriptPath}...`);
            
            // FIXME: Console tests were failing because Jest files were being run with Node.js instead of Jest
            // Use Jest to run the test files properly
            const testProcess = spawn('npx', ['jest', scriptPath, '--verbose'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true
            });

            let output = '';
            let errorOutput = '';

            testProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            testProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            testProcess.on('close', (code) => {
                const fullOutput = output + (errorOutput ? '\n--- STDERR ---\n' + errorOutput : '');
                
                try {
                    fs.writeFileSync(outputPath, fullOutput);
                    console.log(`✅ ${scriptPath} completed (exit code: ${code})`);
                    
                    this.results.console.push({
                        script: scriptPath,
                        output: outputPath,
                        exitCode: code,
                        success: code === 0
                    });
                } catch (writeError) {
                    console.error(`Error writing ${outputPath}:`, writeError.message);
                    this.results.console.push({
                        script: scriptPath,
                        output: outputPath,
                        exitCode: code,
                        success: false,
                        error: writeError.message
                    });
                }
                
                resolve();
            });

            testProcess.on('error', (error) => {
                console.error(`Error running ${scriptPath}:`, error.message);
                this.results.console.push({
                    script: scriptPath,
                    output: outputPath,
                    success: false,
                    error: error.message
                });
                resolve();
            });
        });
    }

    /**
     * Modify UI HTML files to inject completion signal code
     */
    async modifyUITestFiles() {
        console.log('\n🔧 Modifying UI test files...');
        
        const uiTestFiles = [
            '__tests__/test-edge-cases.html',
            '__tests__/test-prompt-verification.html',
            '__tests__/test-turn-management.html'
        ];

        const completionScript = `
<script>
window.testCompletionSignal = {
    completed: false,
    timestamp: null,
    results: null
};

function markTestComplete(results = null) {
    window.testCompletionSignal.completed = true;
    window.testCompletionSignal.timestamp = new Date().toISOString();
    window.testCompletionSignal.results = results;
    console.log('TEST_COMPLETION_SIGNAL:', JSON.stringify(window.testCompletionSignal));
    
    document.body.style.border = '5px solid #28a745';
    document.body.style.backgroundColor = '#f8fff8';
    
    const banner = document.createElement('div');
    banner.innerHTML = '✅ TEST COMPLETED - Ready for next test';
    banner.style.cssText = \`
        position: fixed; top: 0; left: 0; right: 0; 
        background: #28a745; color: white; padding: 15px; 
        text-align: center; font-weight: bold; z-index: 9999;
    \`;
    document.body.appendChild(banner);
}

const completionButton = document.createElement('button');
completionButton.innerHTML = '🏁 Mark Test Complete';
completionButton.style.cssText = \`
    position: fixed; bottom: 20px; right: 20px; 
    background: #28a745; color: white; border: none; 
    padding: 15px 25px; border-radius: 5px; 
    font-size: 16px; font-weight: bold; cursor: pointer; z-index: 9999;
\`;
completionButton.onclick = () => markTestComplete();
document.body.appendChild(completionButton);
</script>`;

        for (const filePath of uiTestFiles) {
            try {
                if (!fs.existsSync(filePath)) {
                    console.log(`⚠️ File not found: ${filePath}`);
                    continue;
                }

                let content = fs.readFileSync(filePath, 'utf8');
                
                // Check if completion script is already injected
                if (content.includes('testCompletionSignal')) {
                    console.log(`✅ ${filePath} already has completion signal`);
                    continue;
                }

                // Inject the script before the closing </body> tag
                const bodyCloseIndex = content.lastIndexOf('</body>');
                if (bodyCloseIndex === -1) {
                    console.log(`⚠️ No closing </body> tag found in ${filePath}`);
                    continue;
                }

                const modifiedContent = content.slice(0, bodyCloseIndex) + 
                                      completionScript + '\n' + 
                                      content.slice(bodyCloseIndex);

                fs.writeFileSync(filePath, modifiedContent);
                console.log(`✅ Modified ${filePath}`);

            } catch (error) {
                console.error(`Error modifying ${filePath}:`, error.message);
            }
        }
    }

    /**
     * Run UI tests with manual user interaction
     */
    async runUITests() {
        console.log('\n🌐 Running UI tests...');
        
        const uiTestFiles = [
            'test-edge-cases.html',
            'test-prompt-verification.html',
            'test-turn-management.html'
        ];

        for (const testFile of uiTestFiles) {
            await this.runUITest(testFile);
        }
    }

    /**
     * Run individual UI test with manual confirmation
     */
    async runUITest(testFile) {
        const url = `http://localhost:${this.serverPort}/__tests__/${testFile}`;
        console.log(`\n🔍 Testing ${testFile}...`);
        console.log(`📖 Please open this URL in your browser: ${url}`);
        console.log('👆 Interact with the test page and click "🏁 Mark Test Complete" when finished');

        try {
            const result = await this.waitForUserConfirmation(testFile);
            this.results.ui.push(result);

        } catch (error) {
            console.error(`Error running UI test ${testFile}:`, error.message);
            this.results.ui.push({
                testFile: testFile,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Wait for user confirmation of test completion
     */
    async waitForUserConfirmation(testFile) {
        return new Promise((resolve) => {
            console.log('\n📋 Options:');
            console.log('  1. Test completed successfully');
            console.log('  2. Test had issues/failures');
            console.log('  3. Skip this test');
            
            this.rl.question('\nEnter your choice (1/2/3): ', (answer) => {
                const choice = answer.trim();
                let result;

                switch (choice) {
                    case '1':
                        result = {
                            testFile: testFile,
                            success: true,
                            userConfirmed: true,
                            timestamp: new Date().toISOString()
                        };
                        console.log(`✅ ${testFile} marked as completed successfully`);
                        break;
                    case '2':
                        result = {
                            testFile: testFile,
                            success: false,
                            userConfirmed: true,
                            error: 'User reported test issues',
                            timestamp: new Date().toISOString()
                        };
                        console.log(`❌ ${testFile} marked as having issues`);
                        break;
                    case '3':
                        result = {
                            testFile: testFile,
                            success: false,
                            userConfirmed: false,
                            error: 'Test skipped by user',
                            timestamp: new Date().toISOString()
                        };
                        console.log(`⏭️ ${testFile} skipped`);
                        break;
                    default:
                        console.log('Invalid choice, marking as failed');
                        result = {
                            testFile: testFile,
                            success: false,
                            userConfirmed: false,
                            error: 'Invalid user input',
                            timestamp: new Date().toISOString()
                        };
                        break;
                }

                resolve(result);
            });
        });
    }

    /**
     * Consolidate all test results into a single file
     */
    async consolidateResults() {
        console.log('\n📊 Consolidating test results...');

        const consolidatedResults = {
            timestamp: new Date().toISOString(),
            summary: {
                jest: this.results.jest ? (this.results.jest.success !== false) : false,
                console: this.results.console.every(test => test.success),
                ui: this.results.ui.every(test => test.success),
                overall: false
            },
            details: {
                jest: this.results.jest,
                console: this.results.console,
                ui: this.results.ui
            }
        };

        consolidatedResults.summary.overall = 
            consolidatedResults.summary.jest && 
            consolidatedResults.summary.console && 
            consolidatedResults.summary.ui;

        // Create readable output
        let output = '='.repeat(80) + '\n';
        output += 'UNIFIED TEST RESULTS\n';
        output += '='.repeat(80) + '\n\n';
        output += `Generated: ${consolidatedResults.timestamp}\n\n`;

        // Summary
        output += 'SUMMARY:\n';
        output += `Jest Tests: ${consolidatedResults.summary.jest ? '✅ PASSED' : '❌ FAILED'}\n`;
        output += `Console Tests: ${consolidatedResults.summary.console ? '✅ PASSED' : '❌ FAILED'}\n`;
        output += `UI Tests: ${consolidatedResults.summary.ui ? '✅ PASSED' : '❌ FAILED'}\n`;
        output += `Overall: ${consolidatedResults.summary.overall ? '✅ PASSED' : '❌ FAILED'}\n\n`;

        // Jest Results
        output += '='.repeat(40) + '\n';
        output += 'JEST TEST RESULTS:\n';
        output += '='.repeat(40) + '\n';
        if (this.results.jest) {
            output += JSON.stringify(this.results.jest, null, 2) + '\n\n';
        } else {
            output += 'No Jest results available\n\n';
        }

        // Console Test Results
        output += '='.repeat(40) + '\n';
        output += 'CONSOLE TEST RESULTS:\n';
        output += '='.repeat(40) + '\n';
        this.results.console.forEach(test => {
            output += `Script: ${test.script}\n`;
            output += `Success: ${test.success}\n`;
            output += `Exit Code: ${test.exitCode}\n`;
            if (test.error) output += `Error: ${test.error}\n`;
            output += `Output File: ${test.output}\n\n`;
        });

        // UI Test Results
        output += '='.repeat(40) + '\n';
        output += 'UI TEST RESULTS:\n';
        output += '='.repeat(40) + '\n';
        this.results.ui.forEach(test => {
            output += `Test File: ${test.testFile}\n`;
            output += `Success: ${test.success}\n`;
            output += `Timestamp: ${test.timestamp}\n`;
            if (test.error) output += `Error: ${test.error}\n`;
            if (test.completionData) {
                output += `Completion Data: ${JSON.stringify(test.completionData, null, 2)}\n`;
            }
            output += '\n';
        });

        try {
            fs.writeFileSync('__tests__/all-test-results.txt', output);
            console.log('✅ Results consolidated in __tests__/all-test-results.txt');
        } catch (error) {
            console.error('Error writing consolidated results:', error.message);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log('\n🧹 Cleaning up...');

        if (this.rl) {
            this.rl.close();
            console.log('✅ Readline interface closed');
        }

        if (this.httpServer) {
            this.httpServer.kill();
            console.log('✅ HTTP server stopped');
        }
    }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    process.exit(0);
});

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const orchestrator = new TestOrchestrator();
    orchestrator.run().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

// Export the class for external use
export default TestOrchestrator;