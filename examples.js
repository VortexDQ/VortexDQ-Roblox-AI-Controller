const axios = require('axios');

const SERVER_URL = 'http://127.0.0.1:7777';

async function executeCommand(prompt) {
	try {
		console.log('[EXAMPLE] Executing:', prompt);

		const response = await axios.post(`${SERVER_URL}/execute`, {
			prompt: prompt
		});

		console.log('[RESULT]', JSON.stringify(response.data, null, 2));
		return response.data;
	} catch (error) {
		console.error('[ERROR]', error.response?.data || error.message);
		throw error;
	}
}

async function getHealth() {
	try {
		const response = await axios.get(`${SERVER_URL}/health`);
		console.log('[HEALTH]', response.data);
		return response.data;
	} catch (error) {
		console.error('[ERROR]', error.message);
	}
}

async function getState() {
	try {
		const response = await axios.get(`${SERVER_URL}/state`);
		console.log('[STATE]', JSON.stringify(response.data, null, 2));
		return response.data;
	} catch (error) {
		console.error('[ERROR]', error.message);
	}
}

async function getStatus() {
	try {
		const response = await axios.get(`${SERVER_URL}/status`);
		console.log('[STATUS]', JSON.stringify(response.data, null, 2));
		return response.data;
	} catch (error) {
		console.error('[ERROR]', error.message);
	}
}

async function runExamples() {
	console.log('=== VortexDQ AI Controller Examples ===\n');

	// Check server is running
	await getHealth();
	console.log();

	// Get plugin status
	await getStatus();
	console.log();

	// Example prompts (only if ANTHROPIC_API_KEY is set)
	if (process.env.ANTHROPIC_API_KEY) {
		console.log('[EXAMPLE] Running AI-driven examples...\n');

		// Simple part creation
		await executeCommand('create a red part named "TestPart" in workspace anchored');
		console.log();

		// Multiple commands
		await executeCommand('build a small 5x5x5 green platform in workspace');
		console.log();

		// UI creation
		await executeCommand('create a screen GUI with a text button labeled "Click Me"');
		console.log();

		// Complex scene
		await executeCommand(`
create an obstacle course with:
- 5 platforms in ascending height
- each platform 4x1x4
- red, blue, green, yellow, orange colors
- all in workspace
- all anchored
		`);
	} else {
		console.log('[WARNING] ANTHROPIC_API_KEY not set - skipping AI examples');
		console.log('Set environment variable to test: export ANTHROPIC_API_KEY=sk-ant-...');
	}
}

// Run if executed directly
if (require.main === module) {
	runExamples().catch(console.error);
}

module.exports = {
	executeCommand,
	getHealth,
	getState,
	getStatus
};
