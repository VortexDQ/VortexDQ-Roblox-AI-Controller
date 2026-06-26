const WebSocket = require('ws');
const readline = require('readline');

const WS_URL = 'ws://127.0.0.1:7777';
let ws = null;
let isConnected = false;

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

function connect() {
	console.log(`[TEST] Connecting to ${WS_URL}`);

	ws = new WebSocket(WS_URL);

	ws.on('open', () => {
		isConnected = true;
		console.log('[TEST] Connected to server');
		console.log('[TEST] Commands: type JSON message or "help"');
	});

	ws.on('message', (data) => {
		try {
			const message = JSON.parse(data);
			console.log('[RECV]', JSON.stringify(message, null, 2));
		} catch (e) {
			console.log('[RECV]', data.toString());
		}
	});

	ws.on('close', () => {
		isConnected = false;
		console.log('[TEST] Disconnected, will retry in 3s');
		setTimeout(connect, 3000);
	});

	ws.on('error', (error) => {
		console.error('[ERROR]', error.message);
	});
}

function sendMessage(message) {
	if (!isConnected) {
		console.log('[TEST] Not connected yet');
		return;
	}

	ws.send(JSON.stringify(message));
}

function showHelp() {
	console.log(`
Available test commands:
  help              - Show this help
  tree              - Get explorer tree
  status            - Check connection status
  exit              - Exit program

Or send raw JSON messages.

Examples:
  {"type":"command","action":"CreatePart","data":{"parent":"Workspace","properties":{"Size":[4,4,4]}}}
  {"type":"state","state":{"test":"data"}}
	`);
}

connect();

rl.on('line', (input) => {
	input = input.trim();

	if (!input) {
		return;
	}

	if (input === 'help') {
		showHelp();
	} else if (input === 'tree') {
		sendMessage({
			type: 'command',
			action: 'GetExplorerTree',
			data: {}
		});
	} else if (input === 'status') {
		console.log('[TEST] Connected:', isConnected);
	} else if (input === 'exit') {
		rl.close();
		process.exit(0);
	} else {
		try {
			const message = JSON.parse(input);
			sendMessage(message);
		} catch (e) {
			console.log('[ERROR] Invalid JSON:', e.message);
		}
	}
});

rl.on('close', () => {
	if (ws) {
		ws.close();
	}
	process.exit(0);
});
