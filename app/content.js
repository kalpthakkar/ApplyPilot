// app/content.js
// ============================================================================
// 🧠 content.js — Automation Runner (Content Script)
// ============================================================================
//
// 📍 Purpose:
// This script runs inside the web page and controls automation for
// supported ATS or JobBoard platforms (Workday, Greenhouse, etc.).
//
// It dynamically loads the correct automation module based on the
// hostname, executes automation logic, and updates visual + background state.
//
// 💡 Key Responsibilities:
//  • Detect ATS/JobBoard platform (based on hostname)
//  • Dynamically import its module (cached per URL)
//  • Start / Stop automation sessions
//  • Display live on-screen automation overlay
//  • Communicate with popup & background scripts
//
// ============================================================================

import { PLATFORM_REGISTRY } from '@modules/registry.js';
import { notifyTabState, getTabState, sleep } from '@shared/utils/utility.js';

/* --------------------------------------------------------------------------
 * 🗂️ MODULE REGISTRY & CACHING
 * ------------------------------------------------------------------------ */
/**
 * 🔁 Cache for dynamically imported ATS modules.
 * Prevents redundant imports by storing them by URL.
 * @type {Record<string, any>}
 */
const modulesCache = {};

/* --------------------------------------------------------------------------
 * ⚙️ STATE FLAGS
 * ------------------------------------------------------------------------ */
let platform = {};
let startExecution = null; // Function from imported ATS module
let stopExecution = null; // Function from imported ATS module
let isAutomationActive = false;
let hasResumed = false; // Prevents duplicate resume actions


function getPlatform() {
	const host = window.location.hostname;
	return PLATFORM_REGISTRY.find(p => p.regex.test(host));
}

/* --------------------------------------------------------------------------
 * 🚀 MODULE PRELOADING
 * ------------------------------------------------------------------------ */

/**
 * Dynamically imports the ATS module corresponding to the current hostname.
 * Cached after first load to avoid re-imports.
 *
 * @returns {Promise<string|null>} Platform name if supported, otherwise null.
 */
async function preloadModule() {
	platform = getPlatform();

	if (!platform) {
		const host = window.location.hostname;
		console.warn(`[Content] Unsupported host: ${host}`);
		return null;
	}
	
	// 📦 Load module if not already cached
	if (!modulesCache[platform.modulePath]) {
		try {
			modulesCache[platform.modulePath] = await import(chrome.runtime.getURL(platform.modulePath));
			notifyTabState({state: 'loaded', running: false, platform: platform}, {updateUI: true});
			console.log(`[Content] Preloaded module for: ${platform.name}`);
		} catch (err) {
			console.error(`[Content] Failed to preload module for: ${platform.name}`, err);
			return null;
		}
	}

	const mod = modulesCache[platform.modulePath];
	startExecution = mod.startExecution;
	stopExecution = mod.stopExecution;

	return platform.name;
}

/* --------------------------------------------------------------------------
 * 💬 UI OVERLAY — Automation Status Display
 * ------------------------------------------------------------------------ */

/**
 * Displays or updates a small fixed overlay indicating current automation status.
 *
 * @param {string} message - Text to display in overlay
 * @param {string} [color='rgba(0,0,0,0.7)'] - Background color (CSS format)
 */
function showAutomationOverlay(message, color = 'rgba(0,0,0,0.7)') {
	let overlay = document.getElementById('automation-status');

	// Create overlay if not present
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'automation-status';
		Object.assign(overlay.style, {
			position: 'fixed',
			bottom: '12px',
			right: '12px',
			background: color,
			color: '#fff',
			padding: '6px 10px',
			borderRadius: '6px',
			fontSize: '12px',
			fontFamily: 'monospace',
			zIndex: 999999,
			opacity: 0.95,
			transition: 'all 0.3s ease',
		});
		document.body.appendChild(overlay);
	}

	overlay.textContent = message;
}

/* --------------------------------------------------------------------------
 * 🤖 AUTOMATION EXECUTION
 * ------------------------------------------------------------------------ */

/**
 * Initiates automation for the detected ATS platform.
 *
 * @param {object} payload - Data passed from popup or background (e.g. job filters, user input)
 */
async function invokePlatform(payload = {}) {
	if (isAutomationActive) {
		console.log('[Content] Automation is already active.');
		return;
	}

	isAutomationActive = true;

	// 🔍 Load platform-specific automation module
	const platformName = await preloadModule();
	if (!platformName) {
		console.warn('[Content] Unsupported platform.');
		notifyTabState({state: 'unsupported', running: false, executionResult: 'unsupported_platform'}, {updateUI: true, postExecutionResult: true});
		isAutomationActive = false;
		return;
	}

	// 🟢 Start visual + status feedback
	notifyTabState({state: 'running', running: true}, {updateUI: true});
	showAutomationOverlay(`Running ${platformName} automation...`, '#0a0');
	console.log(`[Content] Starting ${platformName} automation...`, payload);

	try {
		// ▶️ Execute platform-specific automation logic
		await startExecution(payload);
		// executionResult assignment handled internally - I still 'pending' after resolution -> marks as 'failed'
		notifyTabState({state: 'finished', running: false}, {updateUI: true, postExecutionResult: true});
		console.log(`[Content] ${platformName} automation finished successfully.`);
	} catch (err) {
		notifyTabState({state: 'error', running: false, executionResult: 'failed'}, {updateUI: true, postExecutionResult: true});
		console.error(`[Content] ${platformName} automation error:`, err);
	} finally {
		// 🧹 Cleanup and reset
		isAutomationActive = false;
		hasResumed = false;
		showAutomationOverlay(`${platformName} idle`, 'rgba(0,0,0,0.7)');
	}
}

/* --------------------------------------------------------------------------
 * ⚡ ENTRY POINT
 * ------------------------------------------------------------------------ */

/**
 * Immediately preloads a module when the content script is injected.
 * Ensures faster subsequent automation calls.
 */
(async () => {
	await preloadModule();
})();


/* --------------------------------------------------------------------------
 * 📡 MESSAGE HANDLER — TO Background / Popup
 * ------------------------------------------------------------------------ */
/* -----------------------------------------------
 * 📡 AUTO START LOGIC
 * ----------------------------------------------- */
(async () => {

	if (platform?.type !== 'ATS') return;

	chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
		if (chrome.runtime.lastError) return;

		if (settings?.autofillEnabled === true) {
			console.log('[Content] Autofill enabled → auto-starting');

			let done = false;

			const timer = setTimeout(() => {
				if (!done) {
					done = true;
				}
			}, 3000);

			try {
				chrome.runtime.sendMessage(
					{ action: 'startTabExecution' },
					(resp) => {
						if (done) return;
						clearTimeout(timer);
						done = true;
					}
				);
			} catch {
				clearTimeout(timer);
			}

		} else {
			console.log('[Content] Autofill disabled → waiting for manual start');
		}
	});

})();


/* -----------------------------------------------
 * (OPTIONAL) — Reattach content script on reload
 * ----------------------------------------------- */
// // content script on load
// const tabState = await sendMessage('getTabState', { tabId });
// if (tabState?.running) {
//     startExecution(tabState.payload); // resume
// }



/* --------------------------------------------------------------------------
 * 📡 MESSAGE HANDLER — From Background / Popup
 * ------------------------------------------------------------------------ */

/**
 * Listens for commands sent via `chrome.runtime.sendMessage`
 * and responds to automation control requests.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.action) {

		// ------------------------------------------------------------
		// ▶️ Get Platform
		// ------------------------------------------------------------
		case 'getPlatform': {
			const platform = getPlatform();
			sendResponse({payload: platform});
			return false;
		}

		// ------------------------------------------------------------
		// ▶️ Start or Resume automation
		// ------------------------------------------------------------
		case 'startExecution':
		case 'resumeAfterReload': {
			if (!isAutomationActive) {
				invokePlatform(request.payload);
			}
			return sendResponse({ status: request.action === 'startExecution' ? 'started' : 'resumed'});
			// return false;
		}

		// ------------------------------------------------------------
		// ⏹ Stop automation
		// ------------------------------------------------------------
		case 'stopExecution': {
			console.log('[Content] Canceling active automation...');
			if (stopExecution) stopExecution();
			showAutomationOverlay('Automation aborted', '#a00');
			notifyTabState({state: 'aborted', running: false, executionResult: 'aborted'}, {updateUI: true});
			return false;
		}
	}
});