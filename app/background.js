// background.js
/* ============================================================================
 * 🎯 background.js — Chrome Extension Background Service Worker
 * ============================================================================
 *
 * 🧠 Purpose:
 * Acts as the **central manager** for tab automation across different ATS systems
 * (e.g., Workday, Greenhouse). It coordinates automation sessions, communicates
 * between popup/content scripts, and resumes automation after reloads.
 *
 * 🧩 Responsibilities:
 *  • Tracks running automation sessions per tab
 *  • Relays messages between popup and content scripts
 *  • Resumes automation after reloads or SPA route changes
 *  • Cleans up stale session state when tabs close
 *
 * 💡 Implementation Notes:
 *  • Persistent background service worker
 *  • `tabStore` tracks each tab’s running state and payload
 *  • `safeResume(tabId, payload)` re-injects or restarts automation logic
 *
 * ============================================================================ */


/* ======================================================================================
 * 📥 IMPORTS
 * ====================================================================================== */
import { GmailService } from '@services/gmail.js';
import { createClient } from '@supabase/supabase-js'

/* ======================================================================================
 * 🌍 GLOBAL STATE
 * ====================================================================================== */

/* -------------------------------------------------------------------
 * 📧 INITIALIZE 🔹 GMAIL SERVICE
 * ------------------------------------------------------------------- */
const SERVER_BASE_URL = `http://10.108.175.198:5001`;
const SUPERBASE_PROJECT_ID = 'owvajbjbqhhwcznymirg'; 
const SUPERBASE_PROJECT_URL = `https://${SUPERBASE_PROJECT_ID}.supabase.co`;
const SUPERBASE_API_KEY = 'sb_publishable_pIq55b08XKZMnqa2-JdUdQ_Jin36ree';
const supabase = createClient(SUPERBASE_PROJECT_URL, SUPERBASE_API_KEY)
const gmail = new GmailService(true); // Enable verbose logging



/**
 * Storage-backed tab store for MV3 service worker.
 * Wraps in-memory Map and syncs changes to chrome.storage.local
 */
class StorageBackedTabStore {
	constructor() {
		this.tabStore = new Map();
	}

	// Restore tab state from storage if exists
	async restore(tabId) {
		const key = `tab_${tabId}`;
		const stored = await chrome.storage.local.get(key);
		if (stored[key]) {
		this.tabStore.set(tabId, stored[key]);
		return stored[key];
		}
		return null;
	}

	// Get in-memory or restored state
	get(tabId) {
		return this.tabStore.get(tabId) || null;
	}

	// Update state in memory and persist to storage
	async update(tabId, updates) {
		const prevState = this.tabStore.get(tabId) || {};
		const newState = { ...prevState, ...updates };
		if (!('running' in updates)) newState.running = prevState.running ?? false;

		this.tabStore.set(tabId, newState);
		await chrome.storage.local.set({ [`tab_${tabId}`]: newState });

		return newState;
	}

	// Remove tab state from memory and storage
	async delete(tabId) {
		this.tabStore.delete(tabId);
		await chrome.storage.local.remove(`tab_${tabId}`);
	}

	// Clear all tab states (optional)
	async clearAll() {
		this.tabStore.clear();
		const allKeys = Object.keys(await chrome.storage.local.get(null));
		const tabKeys = allKeys.filter(k => k.startsWith('tab_'));
		if (tabKeys.length) await chrome.storage.local.remove(tabKeys);
	}
}
// Export a singleton instance
const tabStorePersist = new StorageBackedTabStore();
async function getPersistTabStore(tabId, fallback = {}) {
	let state = tabStorePersist.get(tabId);
	if (!state) state = await tabStorePersist.restore(tabId);
	return (state) ? state : fallback; 
}


/* -------------------------------------------------------------------
 * 📦 INITIALIZE 🔹 TAB STATE
 * ------------------------------------------------------------------- */
/**
 * A shared in-memory store of tab-specific automation sessions.
 * Structure per entry:
 * {
 *   running: boolean,
 *   payload: object,
 *   sessionId: string
 * }
 */
// const tabStore = new Map();

/* -------------------------------------------------------------------
 * ✨ UPDATE TAB STATE
 * ------------------------------------------------------------------- */
/**
 * 🔄 Updates stored tab state in-place.
 * @param {number} tabId - The ID of the tab being updated
 * @param {object} updates - Partial object of fields to update
 * @returns {object} Updated state object
 */
// function updateTabState(tabId, updates) {
// 	const prevState = tabStore.get(tabId) || {};
// 	const newState = { ...prevState, ...updates };
// 	if (!('running' in updates)) newState.running = prevState.running ?? false;
// 	tabStore.set(tabId, newState);
// 	return newState;
// }

/* -------------------------------------------------------------------
 * 📨 SEND MESSAGE TO TAB
 * ------------------------------------------------------------------- */
/**
 * 📤 Sends a message to a tab and waits for acknowledgment.
 * Always resolves safely even if the tab is unavailable.
 *
 * @param {number} tabId - Target tab ID
 * @param {object} message - Message payload to send
 * @returns {Promise<object>} - Response from the content script
 */
async function sendMessageWithAck(tabId, message) {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, message, (resp) => {
			if (chrome.runtime.lastError) {
				resolve({}); // Always resolve to avoid unhandled rejections
				return;
			}
			resolve(resp || {});
		});
	});
}



/* ======================================================================================
 * 🌫️ OFFSCREEN LOADER
 * ====================================================================================== */

/* -------------------------------------------------------------------
 * ⏳ OFFSCREEN LOADER 🔹 Initialize
 * ------------------------------------------------------------------- */
/* 
 * - Handles single offscreen document creation
 * - Maintains persistent port for communication
 * - Supports multiple concurrent embedding requests
 * - Survives service worker reloads
 * - Automatic timeout for stuck requests
 */
let offscreenCreatedPromise = null;  // Resolves when offscreen exists
let offscreenPort = null;            // Persistent port to offscreen
const pendingRequests = new Map();   // Map<id, resolver> for async requests
let nextRequestId = 1;               // Unique request ID counter
const REQUEST_TIMEOUT_MS = 15000;    // Timeout for embedding requests (15s)

/* -------------------------------------------------------------------
 * 📥 OFFSCREEN LOADER 🔹 ENSURE OFFSCREEN DOCUMENT
 * ------------------------------------------------------------------- */
/* 
 * - Creates the offscreen document if none exists
 * - Reuses existing document if already created
 * - Returns a promise that resolves once the port is ready
 */
async function ensureOffscreen() {
    // If port exists and is alive, we are good
    if (offscreenPort) return;

    // If a creation is already in progress, wait for it
    if (offscreenCreatedPromise) return offscreenCreatedPromise;

    // Check Chrome Offscreen API availability
    if (!chrome.offscreen) {
        throw new Error('[BG] Offscreen API not available. Chrome >=110 required.');
    }

    // Singleton creation promise
    offscreenCreatedPromise = (async () => {
        try {
            // Check if an offscreen document already exists (Chrome 116+)
            const exists = await chrome.offscreen.hasDocument();
            if (!exists) {
                await chrome.offscreen.createDocument({
                    url: chrome.runtime.getURL('dist/offscreen/offscreen.html'),
                    reasons: ['WORKERS'],
                    justification: 'Run ML embeddings for ATS form automation',
                });
            }

            // Connect persistent port
            offscreenPort = chrome.runtime.connect({ name: 'offscreen-comm' });

            // Handle port disconnects
            offscreenPort.onDisconnect.addListener(() => {
                console.warn('[BG] Offscreen port disconnected');
                offscreenPort = null;
                offscreenCreatedPromise = null;

                // Reject all pending requests
                for (const [id, resolver] of pendingRequests.entries()) {
                    resolver({ success: false, error: 'Offscreen disconnected' });
                    pendingRequests.delete(id);
                }
            });

            // Handle messages from offscreen
            offscreenPort.onMessage.addListener((msg) => {
                const { id, success, embedding, dimensions, error } = msg;
                const resolver = pendingRequests.get(id);
                if (resolver) {
                    pendingRequests.delete(id);
                    resolver({ success, embedding, dimensions, error });
                }
            });

            return true;
        } catch (err) {
            offscreenCreatedPromise = null;
            offscreenPort = null;
            throw new Error(`[BG] Failed to ensure offscreen: ${err.message}`);
        }
    })();

    return offscreenCreatedPromise;
}

/* -------------------------------------------------------------------
 * 🕸️ SEND EMBEDDING REQUEST
 * ------------------------------------------------------------------- */
/* 
 * - Sends a text label to the offscreen and returns a promise
 * - Handles service worker restarts and lost ports
 * - Applies timeout to avoid hanging promises
 */
async function embedLabel(text) {
    // Ensure offscreen exists and port is ready
    await ensureOffscreen();

    // Sanity check
    if (!offscreenPort) {
        throw new Error('[BG] Offscreen port not available after ensureOffscreen');
    }

    return new Promise((resolve, reject) => {
        const id = nextRequestId++;
        pendingRequests.set(id, resolve);

        // Send request to offscreen
        try {
            offscreenPort.postMessage({
                type: 'EMBED_LABEL',
                id,
                text,
            });
        } catch (err) {
            pendingRequests.delete(id);
            return reject(err);
        }

        // Timeout to prevent hanging
        const timeout = setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('[BG] Embedding request timed out'));
            }
        }, REQUEST_TIMEOUT_MS);

        // Wrap resolver to clear timeout
        const originalResolver = pendingRequests.get(id);
        pendingRequests.set(id, (result) => {
            clearTimeout(timeout);
            originalResolver(result);
        });
    });
}

/* -------------------------------------------------------------------
 * 👀 HANDLE OFFSCREEN CLOSED EVENT
 * ------------------------------------------------------------------- */
/* 
 * - Listens for explicit unload notifications from offscreen
 * - Resets singleton state
 */
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'offscreen-closed') {
        console.warn('[BG] Offscreen document closed manually');
        offscreenCreatedPromise = null;
        offscreenPort = null;

        // Reject all pending requests
        for (const [id, resolver] of pendingRequests.entries()) {
            resolver({ success: false, error: 'Offscreen closed' });
            pendingRequests.delete(id);
        }
    }
});



/* ======================================================================================
 * 🚀 ASYNC IN-FLIGHT EXECUTION CONTROLLER
 * ====================================================================================== */

/* -------------------------------------------------------------------
 * 🚦 createSingleFlightService — Deduplicated Async Execution Controller
 * ------------------------------------------------------------------- */
/* 
 * Ensures that an async task is executed only once at a time ("single-flight"),
 * even if multiple callers invoke it concurrently.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🧠 HOW IT WORKS
 * ────────────────────────────────────────────────────────────────────────────
 * • While a task is running, all callers await the same Promise (inFlight)
 * • Once finished, the lock is released
 * • Optionally caches the result for future calls
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔑 INTERNAL STATE
 * ────────────────────────────────────────────────────────────────────────────
 * • inFlight       🛫  Promise of the currently running task (lock)
 * • cachedResult   💾  Stores the resolved value (if caching enabled)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚙️ CONFIGURATION
 * ────────────────────────────────────────────────────────────────────────────
 * @param {Object} options
 * @param {boolean} options.cacheResult
 *   → When true, subsequent calls return the cached result immediately
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 📌 USAGE
 * ────────────────────────────────────────────────────────────────────────────
 * const runOnce = createSingleFlightService({ cacheResult: true });
 *
 * await Promise.all([
 *   runOnce(fetchData),
 *   runOnce(fetchData),
 *   runOnce(fetchData)
 * ]);
 *
 * // 👉 fetchData() runs only once
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ✅ IDEAL FOR
 * ────────────────────────────────────────────────────────────────────────────
 * • Preventing duplicate API calls
 * • Coordinating shared async resources
 * • Caching expensive async computations
 * • SPA / concurrent event safety
 * ============================================================================ */
function createSingleFlightService({ cacheResult = false } = {}) {
	let inFlight = null;
	let cachedResult = null;

	return async function run(taskFn) {
		// 1️⃣ Return cached result immediately
		if (cacheResult && cachedResult) {
			return cachedResult;
		}

		// 2️⃣ Await in-flight execution
		if (inFlight) {
			return inFlight;
		}

		// 3️⃣ Start single execution
		inFlight = (async () => {
			try {
				const result = await taskFn();
				if (cacheResult) cachedResult = result;
				return result;
			} finally {
				inFlight = null; // 🔓 release lock
			}
		})();

		return await inFlight;
	};
}
const runGetNearestAddress = createSingleFlightService({
	cacheResult: false, // if 'true' -> reuse result after first success
});
const runGetBestResume = createSingleFlightService({
	cacheResult: false, // if 'true' -> reuse result after first success
});
const runResolveQuestionWithLLM = createSingleFlightService({
	cacheResult: false, // if 'true' -> reuse result after first success
});
const setExecutionResult = createSingleFlightService({
	cacheResult: false, // if 'true' -> reuse result after first success
});
const runAskLLM = createSingleFlightService({
	cacheResult: false, // LLM responses usually not reusable
});



/* ======================================================================================
 * ⚙️ AUTOMATION CONTROL HELPERS
 * ====================================================================================== */

const lastCancelTime = new Map(); // Prevents rapid duplicate stops
const lastResumeTime = new Map(); // Prevents rapid duplicate resumes

/* -------------------------------------------------------------------
 * 🛑 STOP AUTOMATION
 * ------------------------------------------------------------------- */
/**
 * 🛑 Stops automation in a specific tab.
 * @param {number} tabId - Target tab ID
 * @param {boolean} [keepRunning=true] - Whether to preserve `running` state
 */
async function stopExecution(tabId, keepRunning = true) {
	const now = Date.now();
	const last = lastCancelTime.get(tabId) || 0;
	if (now - last < 1000) return; // Debounce within 1s
	lastCancelTime.set(tabId, now);

	const state = await getPersistTabStore(tabId);
	if (state?.running) {
		if (!keepRunning) await tabStorePersist.update(tabId, {running: false});
		console.log(`[BG] Stopping automation in tab ${tabId}`);
		await sendMessageWithAck(tabId, {
			action: 'stopExecution'
		});
	}
}

/* -------------------------------------------------------------------
 * ▶️ RESUME AUTOMATION
 * ------------------------------------------------------------------- */
/**
 * 🔁 Safely resumes automation after page reload or navigation.
 * @param {number} tabId - Tab to resume
 * @param {object} payload - Stored payload for resuming automation
 */
async function safeResume(tabId, payload) {
	const now = Date.now();
	const last = lastResumeTime.get(tabId) || 0;
	if (now - last < 1000) return; // Debounce
	lastResumeTime.set(tabId, now);

	console.log(`[BG] Attempting safe resume for tab ${tabId}`);
	await sendMessageWithAck(tabId, {
		action: 'resumeAfterReload',
		payload
	});
}

/* -------------------------------------------------------------------
 * 🧭 WEB NAVIGATION HOOKS
 * ------------------------------------------------------------------- */
/* 
 * Resume automation after reloads / SPA routes
 */
function attachResumeHooks() {
	/**
	 * Handles full or history-based navigations and resumes automation if needed.
	 * @param {object} details - Navigation event details
	 * @param {number} details.tabId - Tab that navigated
	 * @param {number} details.frameId - Frame ID (0 = top-level)
	 * @param {string} details.url - URL navigated to
	 */
	const handleResume = async (details) => {
		if (details.frameId !== 0) return;
		const state = await getPersistTabStore(details.tabId);
		if (!state?.running) return;

		console.log(`[BG] Navigation detected → resuming automation for tab ${details.tabId}`);
		setTimeout(() => safeResume(details.tabId, state.payload), 300);
	};

	chrome.webNavigation.onCompleted.addListener(handleResume);
	chrome.webNavigation.onHistoryStateUpdated.addListener(handleResume);

	console.log('[BG] Resume hooks attached for navigation events.');
}
attachResumeHooks();

/* -------------------------------------------------------------------
 * 🧹 TAB CLEANUP
 * ------------------------------------------------------------------- */
/**
 * Cleans up stored state when a tab is closed.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
	await tabStorePersist.delete(tabId);
	lastCancelTime.delete(tabId);
	lastResumeTime.delete(tabId);
	console.log(`[BG] Cleared tabStore and timers for closed tab ${tabId}`);
});




/* ======================================================================================
 * 💬 MESSAGE ROUTER 🔹HANDLE INCOMING MESSAGES
 * ====================================================================================== */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	
	const tabId = request.tabId || sender?.tab?.id;
	if (!tabId) {
		sendResponse({ ok: false, error: 'No tabId provided'});
		return false;
	}

	switch (request.action) {

		// ------------------------------------------------------------
		// 🧫 Get Tab Platform
		// ------------------------------------------------------------
		case 'setTabPlatform': {
			(async () => {
				const response = await sendMessageWithAck(tabId, { action: 'getPlatform' }); // {payload: platform}
				await tabStorePersist.update(tabId, {platform: response.payload});
				sendResponse({ok: true});
			})();
			return true;
		}

		// ------------------------------------------------------------
		// ⚙️ Get Settings
		// ------------------------------------------------------------
		case 'getSettings': {
			chrome.storage.sync.get(['autofillEnabled'], (res) => {
				sendResponse({
					autofillEnabled: res.autofillEnabled === true
				});
			});
			return true; // async

		}
		
		// ------------------------------------------------------------
		// ▶️ START EXECUTION
		// ------------------------------------------------------------
		case 'startTabExecution': {
			return (async () => {
				try {
					const sessionId = crypto.randomUUID();
					console.log("[BG] TAB STORE TO UPDATE IN 5 seconds...")
					// const sleep = ms => new Promise(r => setTimeout(r, ms));
					// await sleep(5000);
					await tabStorePersist.update(tabId, {running: true, payload: request.payload, sessionId, executionResult: 'pending'});
					// console.log("[BG] EXECUTION ABOUT TO START IN 5 seconds...")
					// await sleep(5000);

					console.log(`[BG] Execution started in Tab ${tabId} (Session: ${sessionId})`, request.payload);
					await sendMessageWithAck(tabId, {
						action: 'startExecution',
						payload: request.payload
					});
					sendResponse({ok: true, sessionId});
				} catch (err) {
					console.warn('[BG] Failed to start execution:', err);
					sendResponse({ok: false, error: err?.message});
				}
			})();
			return true;
		}

		// ------------------------------------------------------------
		// 🛑 STOP EXECUTION
		// ------------------------------------------------------------
		case 'stopTabExecution': {
			stopExecution(tabId, false);
			sendResponse({ok: true});
			return false;
		}

		// ------------------------------------------------------------
		// 🔍 QUERY TAB STATE
		// ------------------------------------------------------------
		case 'getTabState': {
			(async () => {
				const state = await getPersistTabStore(tabId, { running: false });
				sendResponse(state);
			})();
			return true; // ✅ Ensure async response channel stays open
		}


		// ------------------------------------------------------------
		// ✏️ UPDATE TAB STATE
		// ------------------------------------------------------------
		case 'setTabState': {
			(async () => {
				const { action, updateUI, postExecutionResult, ...updates } = request;
				
				console.log(`[BG] State update req from tab ${tabId}:`, updates);
				const prevState = await getPersistTabStore(tabId);
				const newState = await tabStorePersist.update(tabId, { ...prevState, ...updates });
				console.log("[BG] Updated Tab State:", newState);

				if (updateUI) {
					console.log("Updating UI...");
					// const sleep = ms => new Promise(r => setTimeout(r, ms));
					// await sleep(6000);
					chrome.runtime.sendMessage(
						{ action: 'updatePopup',  tabId,  payload: newState },
						() => {
							if (chrome.runtime.lastError) console.debug('[BG] Popup not available');
						}
					);
				}


				if (newState?.platform?.type === 'ATS' && postExecutionResult) {
					let executionResult = newState?.executionResult ?? 'failed';
					/**
						class ExecutionResult(Enum):
							PENDING = "pending"
							JOB_EXPIRED = "job_expired"
							UNSUPPORTED_PLATFORM = "unsupported_platform"
							FAILED = "failed"
							APPLIED = "applied"
					*/
					if (['pending', 'job_expired', 'unsupported_platform', 'failed', 'applied'].includes(executionResult)) {
						// pass
					} 
					else if (executionResult === 'aborted') executionResult = 'pending';
					else executionResult = 'failed';
					
					setExecutionResult(async () => {
						try {
							const res = await fetch(`${SERVER_BASE_URL}/set-job-execution-result`, {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ result: executionResult, id: newState?.jobId.id, fingerprint: newState?.jobId.fingerprint, soft_data: newState?.soft_data, source: newState?.source })
							});
							const data = await res.json();
							console.log(`[BG] Session removed for tab ${tabId}:`, data);
							return data;
						} catch (err) {
							console.error(`[BG] Failed to remove session for tab ${tabId}:`, err);
						}
					});
					console.log("[BG] 🏁 Execution Result Updated to DB:", executionResult);

					// [TERMINATE] Clear storage & session
					await tabStorePersist.delete(tabId);
					console.log(`[BG] Cleared tabStore for tab ${tabId} (terminal state).`);
				}

				sendResponse({ success: true });
			})();
			return true; // ✅ allow async handling if needed
		}

		// ------------------------------------------------------------
		// 🧹 CLEAR TAB STATE
		// ------------------------------------------------------------
		case 'clearTabState': {
			(async () => {
				await tabStorePersist.delete(tabId);
				sendResponse({
					success: true
				});
			})();
			return false;
		}

		case 'getLeverLocationToken': {
			async function getToken(tabId) {
				const [{ result }] = await chrome.scripting.executeScript({
					target: { tabId },
					world: "MAIN", // critical
					func: async () => {
						const input = document.querySelector('#hcaptchaResponseInput');

						const widgetID = String(
							window.hcaptcha.render(input, {
								sitekey: "e33f87f8-88ec-4e1a-9a13-df9bbb1d8120"
							})
						);

						await new Promise(r => setTimeout(r, 1500));

						window.hcaptcha.execute(widgetID);

						let token = null;

						for (let i = 0; i < 20; i++) {
							token = window.hcaptcha.getResponse(widgetID);
							if (token) break;
							await new Promise(r => setTimeout(r, 500));
						}

						return token || null;
					}
				});

				return result;
			}

			getToken(tabId).then(token => {
				sendResponse({ token });
			});
			return true; // keep message channel open
		}

		/* ---------------------------------------------------------
		* 🔹 FETCH JOB DATA BY KEY (RPC)
		* --------------------------------------------------------- */
		case 'fetchJobDataByKey': {
			(async () => {
				
				try {

					if (!request.key) {
						sendResponse({ success: false, error: 'Missing job key' });
						return;
					}

					const { data, error } = await supabase.rpc('get_job_data', { job_key: request.key });

					if (error) {
						console.error('❌ Fetch job data RPC error:', error);
						sendResponse({ success: false, error });
						return;
					}

					// data is either jsonb or null
					sendResponse({success: true, data: data ?? {}});

				} catch (err) {
					console.error('❌ Unexpected fetch error:', err);
					sendResponse({ success: false, error: err.message });
				}
			})();

			return true; // REQUIRED for async sendResponse
		}
		

		case 'upsertJobBatch': {
			(async () => {
				try {
					const { data, error } = await supabase.rpc('upsert_jobs_batch', { jobs: request.jobs });

					if (error) {
						console.error('❌ Batch upsert error:', error);
						sendResponse({ success: false, error });
					} else {
						console.log(`✅ Batch upsert completed for ${request.jobs.length} jobs`);
						sendResponse({ success: true });
					}
				} catch (err) {
					console.error('❌ Unexpected batch upsert error:', err);
					sendResponse({ success: false, error: err.message });
				}
			})();

			return true; // keep message channel open for async sendResponse
		}


		// ------------------------------------------------------------
		// 📬 FETCH OTP FROM GMAIL
		// ------------------------------------------------------------
		case 'fetchRecentVerificationOTP': {
			(async () => {
				try {
					const otp = await gmail.fetchRecentVerificationOTP(
						request.query,
						request.topKSearch,
						request.maxAgeMinutes
					);
					sendResponse({
						success: true,
						otp
					});
				} catch (err) {
					console.error('[BG] Gmail fetch failed:', err);
					sendResponse({
						success: false,
						error: err.message
					});
				}
			})();
			return true;
		}

		// ------------------------------------------------------------
		// 📬 FETCH PASSCODE FROM GMAIL
		// ------------------------------------------------------------
		case 'fetchRecentVerificationPasscode': {
			(async () => {
				try {
					const passcode = await gmail.fetchRecentVerificationPasscode(
						request.query,
						request.topKSearch,
						request.maxAgeMinutes
					);
					sendResponse({
						success: true,
						passcode
					});
				} catch (err) {
					console.error('[BG] Gmail fetch failed:', err);
					sendResponse({
						success: false,
						error: err.message
					});
				}
			})();
			return true;
		}


		// ------------------------------------------------------------
		// 📬 FETCH URL FROM GMAIL
		// ------------------------------------------------------------
		case 'fetchRecentVerificationURL': {
			(async () => {
				try {
					const url = await gmail.fetchRecentVerificationUrl(
						request.query,
						request.topKSearch,
						request.maxAgeMinutes
					);
					console.log('[BG] Email Collection response:', url);
					sendResponse({
						success: true,
						url
					});
				} catch (err) {
					console.error('[BG] Gmail fetch failed:', err);
					sendResponse({
						success: false,
						error: err.message
					});
				}
			})();
			return true;
		}

		// ------------------------------------------------------------
		// 🌐 VERIFY EMAIL LINK
		// ------------------------------------------------------------
		/*
		 * Hybrid resolver (fetch + tab fallback)
		 */
		case 'resolveVerificationURL': {
			(async () => {

				const { url, timeoutMs = 8000 } = request;
				if (!url) return sendResponse({
					success: false,
					error: 'Missing verification URL'
				});

				console.log(`[BG] Attempting to resolve verification URL: ${url}`);

				try {
					// 1️⃣ Try background fetch
					const res = await fetch(url, {
						method: 'GET',
						redirect: 'follow',
						headers: {
							'User-Agent': 'Mozilla/5.0 (ApplyPilot Verification Bot)',
							'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
						}
					});

					const text = await res.text();
					const successLikely = res.status < 400 && /verified|success|thank/i.test(text.slice(0, 500));

					if (successLikely) {
						sendResponse({
							success: true,
							via: 'fetch',
							status: res.status,
							finalURL: res.url
						});
						return;
					}

					// 2️⃣ Fallback: open invisible tab to simulate user navigation
					console.warn(`[BG] Fetch inconclusive → opening hidden verification tab`);
					const tab = await new Promise((resolve) =>
						chrome.tabs.create({
							url,
							active: false
						}, resolve)
					);

					let responded = false;
					const listener = (details) => {
						if (details.tabId === tab.id && details.frameId === 0 && !responded) {
							responded = true;
							chrome.webNavigation.onCompleted.removeListener(listener);
							setTimeout(() => chrome.tabs.remove(tab.id), 2000);
							sendResponse({
								success: true,
								via: 'tab',
								finalURL: details.url,
								statusText: 'Verified via tab navigation'
							});
						}
					};

					chrome.webNavigation.onCompleted.addListener(listener);

					// Timeout safeguard
					setTimeout(() => {
						if (!responded) {
							responded = true;
							try {
								chrome.webNavigation.onCompleted.removeListener(listener);
								chrome.tabs.remove(tab.id);
							} catch {}
							sendResponse({
								success: false,
								via: 'tab',
								error: 'Timeout waiting for verification'
							});
						}
					}, timeoutMs);
				} catch (err) {
					console.error('[BG] Verification fetch failed:', err);
					sendResponse({
						success: false,
						error: err.message
					});
				}
			})();
			return true;
		}

		// ------------------------------------------------------------
		// 📐 GET EMBEDDINGS
		// ------------------------------------------------------------
		/* 
		 * Accepts single string (e.g. label) or array of strings and returns an array
		 * of embedding responses, mapped by request ID.
		 */
		case 'requestEmbeddings':
			const labels = Array.isArray(request.text) ? request.text : [request.text];
			// Send all labels concurrently
			Promise.all(labels.map((label) => embedLabel(label)))
				.then((results) => sendResponse({ success: true, results }))
				.catch((err) => sendResponse({ success: false, error: err.message }));
			return true; // keep async channel open
		
		// ------------------------------------------------------------
		// 🤖 Invoke LLM
		// ------------------------------------------------------------
		case 'askLLM': {
			console.log("[BG] askLLM req received:", request.payload);
			runAskLLM(async () => {
				const res = await fetch(`${SERVER_BASE_URL}/search-chatgpt`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request.payload)
				});
				return res.json();
			})
			.then(sendResponse)
			.catch(err => sendResponse({ success: false, error: err.message }));
			return true;

		}

		// ------------------------------------------------------------
		// 🏠 GET NEAREST ADDRESS
		// ------------------------------------------------------------
		case 'getNearestAddress': {
			console.log("[BG] getNearestAddress req received:", request.payload);
			runGetNearestAddress(async () => {
				const res = await fetch(`${SERVER_BASE_URL}/get-nearest-address`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request.payload)
				});
				return res.json();
			})
			.then(sendResponse)
			.catch(err => sendResponse({ success: false, error: err.message }));

			return true;
		}

		// ------------------------------------------------------------
		// 📄 Get Best Fit Resume
		// ------------------------------------------------------------
		case 'getBestResume': {
			console.log("[BG] getBestResume req received:", request.payload);
			runGetBestResume(async () => {
				const res = await fetch(`${SERVER_BASE_URL}/get-best-fit-resume`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request.payload)
				});
				return res.json();
			})
			.then(sendResponse)
			.catch(err => sendResponse({ success: false, error: err.message }));

			return true;
		}

		// ------------------------------------------------------------
		// 📄 Get Best Fit Resume
		// ------------------------------------------------------------
		case 'resolveQuestionWithLLM': {
			console.log("[BG] resolveQuestionWithLLM req received:", request.payload);
			runResolveQuestionWithLLM(async () => {
				const res = await fetch(`${SERVER_BASE_URL}/resolve-questions-with-llm`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request.payload)
				});
				return res.json();
			})
			.then(sendResponse)
			.catch(err => sendResponse({ success: false, error: err.message }));

			return true;
		}

	}

	return false;
});