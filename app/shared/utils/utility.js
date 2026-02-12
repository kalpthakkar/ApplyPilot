// app/shared/utility.js
// ============================================================================
// 🧰 Utility Functions for ATS Automation
// ============================================================================
//
// 💡 Purpose:
//   A collection of helper utilities used across content/background scripts
//   — handling DOM stability, dynamic element detection, timing, and state sync.
//
// 📦 Exports:
//   • waitForElement()      → Waits for an element to appear dynamically
//   • sleep()               → Simple async delay utility
//   • notifyTabState()        → Sends tab state updates to background.js
//   • waitForStableDOM()    → Detects when DOM stops changing
//   • DomChangeChecker()    → Tracks and compares DOM snapshots intelligently
//
// ============================================================================
import { DB_KEY_MAP } from '../config/config.js';


/* --------------------------------------------------------------------------
 * 🚀 Execution Utils (Hybrid Abort Model)
 * ------------------------------------------------------------------------ */

let executionController = null;

/**
 * Starts a new execution session.
 * Must be called once at the beginning of automation.
 */
export function createExecutionController() {
  executionController = new AbortController();
  return executionController;
}

/**
 * Returns the active execution AbortSignal, if any.
 */
export function getExecutionSignal() {
  return executionController?.signal ?? null;
}

/**
 * Aborts the active execution session.
 */
export function abortExecution() {
  executionController?.abort();
}

/**
 * Throws immediately if execution is aborted.
 * Can be used anywhere (lightweight checkpoint).
 */
export function throwIfAborted(signal = getExecutionSignal()) {
  if (signal?.aborted) {
    throw new DOMException('Execution aborted', 'AbortError');
  }
}

/**
 * Clears execution state after completion.
 */
export function clearExecutionController() {
  executionController = null;
}



/* --------------------------------------------------------------------------
 * ⏰ sleep(seconds)
 * ------------------------------------------------------------------------ */
/**
 * Pauses execution for a given number of seconds.
 * Automatically aborts if execution is canceled.
 *
 * @param {number} seconds - Time to wait (can be fractional, e.g., 1.5).
 * @param {AbortSignal} [signal] - Optional override signal
 */
export function sleep(seconds, signal = getExecutionSignal()) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, seconds * 1000);

    if (!signal) return;

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Execution aborted', 'AbortError'));
    };

    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/* --------------------------------------------------------------------------
 * ↔️ clamp(val, min, max)
 * ------------------------------------------------------------------------ */
/**
 * Returns a number whose value is limited to the given range.
 *
 * @param {Number} val The initial value
 * @param {Number} min The lower boundary
 * @param {Number} max The upper boundary
 * @returns {Number} A number in the range [min, max]
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/* --------------------------------------------------------------------------
 * 🔢 arrayRange(arr, start, stop, step)
 * ------------------------------------------------------------------------ */
/**
 * Returns a sub-array of elements from a given array within a specified range,
 * similar to Python's slicing syntax: arr[start:stop:step].
 *
 * Supports:
 *   • Positive and negative start/stop indices
 *   • Positive and negative step values (reverse iteration)
 *   • Defaults to the full array if start/stop are omitted
 *
 * @function arrayRange
 * @param {Array} arr - The source array to slice.
 * @param {number} [start=0] - Starting index (inclusive). Negative counts from end.
 * @param {number} [stop=arr.length] - Ending index (exclusive). Negative counts from end.
 * @param {number} [step=1] - Step size for iteration. Can be negative to reverse.
 * @returns {Array} A new array containing the selected elements.
 *
 * @example
 * arrayRange([0,1,2,3,4,5], 1, 5)       // → [1,2,3,4]
 * arrayRange([0,1,2,3,4,5], 0, 6, 2)    // → [0,2,4]
 * arrayRange([0,1,2,3,4,5], -3, 6)      // → [3,4,5]
 * arrayRange([0,1,2,3,4,5], 5, 0, -1)   // → [5,4,3,2,1]
 */
export function arrayRange(arr, start = 0, stop = arr.length, step = 1) {
	const result = [];
	if (step === 0) return result; // avoid infinite loop
	const len = arr.length;

	// Handle negative indices (like Python)
	start = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
	stop  = stop < 0 ? Math.max(len + stop, 0) : Math.min(stop, len);

	if (step > 0) {
		for (let i = start; i < stop; i += step) result.push(arr[i]);
	} else {
		for (let i = start; i > stop; i += step) result.push(arr[i]);
	}

	return result;
}

/* --------------------------------------------------------------------------
 * 🧮 sha256(input)
 * ------------------------------------------------------------------------ */
async function sha256(input) {
	const data = new TextEncoder().encode(input);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(hash)]
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");
}

/* --------------------------------------------------------------------------
 * 🆔 getJobId(rawUrl)
 * ------------------------------------------------------------------------ */
export async function getJobId(rawUrl) {

    if (!rawUrl) return { id: null, fingerprint: null};
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    // ---------------------------
    // ATS detection
    // ---------------------------
    let ats = "unknown";
	if (hostname.includes("greenhouse")) ats = "greenhouse";
	else if (hostname.includes("myworkdayjobs")) ats = "workday";
	else if (hostname.includes("lever")) ats = "lever";
	else if (hostname.includes("smartrecruiters")) ats = "smartrecruiters";

    // ---------------------------
    // Tenant
    // ---------------------------
    const tenant = hostname;

    // ---------------------------
    // Job identity extraction
    // ---------------------------
    const candidates = [];
    // Query params (strongest)
    for (const [, value] of url.searchParams.entries()) {
        if (value && /\d/.test(value) && value.length >= 4) {
            candidates.push({
                value,
                weight: 100
            });
        }
    }

    // Path segments
    const pathSegments = url.pathname.split("/").map(s => s.trim()).filter(Boolean);
    for (const seg of pathSegments) {
        if (/\d/.test(seg)) {
            candidates.push({
                value: seg,
                weight: seg.length >= 6 ? 70 : 50
            });
        }
    }
    const jobId = candidates.sort((a, b) => b.weight - a.weight || b.value.length - a.value.length).map(c => c.value)[0] || pathSegments[pathSegments.length - 1] || "unknown";
    const normalizedJobId = jobId.toLowerCase().replace(/[^\w\-]+/g, "_");

    // ---------------------------
    // Fingerprint (human readable)
    // ---------------------------
    const fingerprint = `${ats}:${tenant}:${normalizedJobId}`;

    // ---------------------------
    // Hash key (authoritative)
    // ---------------------------
    const id = await sha256(fingerprint);
    return {
        id,
        fingerprint
    };
}


/* --------------------------------------------------------------------------
 * 🆔 getQuestionIdSimple(question)
 * ------------------------------------------------------------------------ */
export function getQuestionIdSimple(question) {
	// Use label text + type + field DOM path as a unique identifier
	const type = question.type || 'unknown';
	const labelText = question.labelText?.replace(/\s+/g, ' ').trim().toLowerCase() || 'no-label';
	const fieldSignature = question.fields.map(f => f.tagName + (f.id ? `#${f.id}` : '')).join('|');
	return `${type}::${labelText}::${fieldSignature}`;
}

/* --------------------------------------------------------------------------
 * 🆔 getQuestionId(question)
 * ------------------------------------------------------------------------ */
export function getQuestionId(question) {

	/* -------------------------------------------------- */
	/* 🔹 Utilities                                      */
	/* -------------------------------------------------- */

	function normalize(text) {
		return text?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
	}

	function findLogicalContainer(el) {
		return el.closest(`[data-container], .field-group`);
	}

	function getStableSiblingIndex(container) {
		const parent = container?.parentElement;
		if (!parent) return 0;

		const siblings = [...parent.children].filter(
		el => el.tagName === container.tagName &&
				el.className === container.className
		);
		return siblings.indexOf(container);
	}

	/* -------------------------------------------------- */
	/* 🧱 Container Fingerprint                           */
	/* -------------------------------------------------- */

	function getContainerFingerprint(container) {
		if (!container) return 'root';

		const parts = [];

		const hiddenId = container.querySelector('input[type="hidden"][name*="id"]');
		if (hiddenId?.value) parts.push(`hid:${hiddenId.value}`);

		const title = container.querySelector('h3, legend, .container-title');
		if (title?.textContent) parts.push(`title:${normalize(title.textContent)}`);

		const nameLike = container.querySelector('input[name*="company"], input[name*="school"], input[name*="employer"]');
		if (nameLike?.value) parts.push(`name:${normalize(nameLike.value)}`);

		return parts.length
			? parts.join('|')
			: `container-pos:${getStableSiblingIndex(container)}`;
	}

	/* -------------------------------------------------- */
	/* 🧬 Field Structural Selector                      */
	/* -------------------------------------------------- */

	function buildStaticSelector(el) {
		const parts = [el.tagName.toLowerCase()];

		const attrs = [
			'type',
			'name',
			'role',
			'aria-label',
			'placeholder'
		];

		for (const attr of attrs) {
			const val = el.getAttribute(attr);
			if (val) {
				parts.push(`[${attr}="${CSS.escape(val)}"]`);
			}
		}

		return parts.join('');
	}

	function getScopedOccurrenceIndex(el, selector, scope) {
		if (!scope) return 0;
		const matches = [...scope.querySelectorAll(selector)];
		return matches.indexOf(el);
	}

	/* -------------------------------------------------- */
	/* 🧠 Identity Assembly                              */
	/* -------------------------------------------------- */

	const type = question.type || 'unknown';
	const labelText = normalize(question.labelText) || 'no-label';

	const field = question.fields?.[0];
	if (!field) {
		return `${type}::${labelText}::no-field`;
	}

	const container = findLogicalContainer(field);
	const containerKey = getContainerFingerprint(container);

	const fieldSelector = buildStaticSelector(field);
	const occurrenceIndex = getScopedOccurrenceIndex(
		field,
		fieldSelector,
		container || document.body
	);

	const fieldKey = `${fieldSelector}::idx:${occurrenceIndex}`;

	return `${type}::${labelText}::${containerKey}::${fieldKey}`;
}

/* --------------------------------------------------------------------------
 * 🕙 toTimestampTZ(dateInput)
 * ------------------------------------------------------------------------ */
/**
 * Converts an arbitrary date string into a UTC timestamptz string.
 *
 * Examples:
 *  "2026-02-06"
 *  "Feb 6, 2026"
 *  "2026/02/06"
 *  "2026-02-06T10:30:00"
 *  "2026-02-06T10:30:00Z"
 *
 * Output:
 *  "2026-02-06T00:00:00.000Z"
 *
 * @param {string} dateInput
 * @returns {string|null} ISO timestamptz string or null if invalid
 */
export function toTimestampTZ(dateInput) {
  if (!dateInput || typeof dateInput !== 'string') return null;

  let date;

  // 1️⃣ ISO-like formats are safest (YYYY-MM-DD or full ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    // Treat as UTC midnight
    date = new Date(`${dateInput}T00:00:00Z`);
  } else {
    // 2️⃣ Let JS try to parse other human-readable formats
    date = new Date(dateInput);
  }

  // 3️⃣ Validate result
  if (isNaN(date.getTime())) {
    return null;
  }

  // 4️⃣ Normalize to UTC timestamptz
  return date.toISOString();
}

/* --------------------------------------------------------------------------
 * 📅 getLocalDate
 * ------------------------------------------------------------------------ */
/**
 * Returns the current date in a custom format.
 *
 * Supported placeholders:
 *  - yyyy → 4-digit year
 *  - yy   → 2-digit year
 *  - mm   → 2-digit month
 *  - m    → month without leading zero
 *  - dd   → 2-digit day
 *  - d    → day without leading zero
 *
 * Examples:
 *  getLocalDate('yyyy-mm-dd') → "2026-01-19"
 *  getLocalDate('mm-yyyy')    → "01-2026"
 *  getLocalDate('dd-mm-yyyy') → "19-01-2026"
 *  getLocalDate('yyyy')       → "2026"
 *
 * @param {string} format - Format string using placeholders
 * @param {Date} [date=new Date()] - Optional date to format
 * @returns {string} Formatted date
 */
export function getLocalDate(format = 'yyyy-mm-dd', date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const d  = String(date.getDate());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const m  = String(date.getMonth() + 1);
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(-2);

  return format
    .replace(/yyyy/g, yyyy)
    .replace(/yy/g, yy)
    .replace(/mm/g, mm)
    .replace(/m/g, m)
    .replace(/dd/g, dd)
    .replace(/d/g, d);
}

/* --------------------------------------------------------------------------
 * 🔄 retryUntilTrue
 * ------------------------------------------------------------------------ */
export async function retryUntilTrue(fn, maxRetries = 3, delayMs = 0) {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		const result = await fn();

		if (result === true) {
			return true;
		}

		if (attempt < maxRetries && delayMs > 0) {
			await new Promise((r) => setTimeout(r, delayMs));
		}
	}

	return false;
}

/* --------------------------------------------------------------------------
 * 🧩 resolveValidElements
 * ------------------------------------------------------------------------ */
/**
 * Filters an array of locators (HTMLElements or CSS selectors) using one or more validator functions
 * and returns all elements that pass the validation rules.
 *
 * Supports both 'OR' (element passes any validator) and 'AND' (element must pass all validators) modes.
 *
 * @param {Array<HTMLElement|string>} locators - Elements or CSS selectors to filter
 * @param {Array<function(HTMLElement): boolean>} validators - Array of validator functions
 * @param {'OR'|'AND'} [operation='OR'] - How to combine validators: 
 *    'OR' → include if any validator returns true, 
 *    'AND' → include only if all validators return true
 * @returns {HTMLElement[]} Array of elements matching the validation rule
 */
export const resolveValidElements = (locators = [], validators = [], operation = 'OR', { includeDescendants = true } = {}) => {
  
	if (!validators.length) return [];
	
	const elements = locators.flatMap(locator => {
		if (typeof locator === 'string') return [...document.querySelectorAll(locator)];
		if (locator instanceof HTMLElement) return includeDescendants ? [locator, ...locator.querySelectorAll('*')] : [locator];
		return [];
	});

	const isValid = el => {
		return operation === 'AND'
			? validators.every(validate => validate(el))
			: validators.some(validate => validate(el));
	};

  	return [...new Set(elements.filter(isValid))];
};

/* --------------------------------------------------------------------------
 * 📦 accessDatabase
 * ------------------------------------------------------------------------ */
/**
 * 🔹 Universal helper to GET or SET deeply nested values in an object
 *
 * Supports:
 *  - Dot + bracket notation paths: "a.b[0].c"
 *  - Dynamic indices
 *  - Safe reads (returns fallback if missing)
 *  - Auto-creation of missing paths in SET mode
 *
 * @param {Object} obj
 *   Root object
 * @param {string} path
 *   Dot/bracket path string
 * @param {*} [options.value]
 *   If provided → SET mode (assign this value)
 * @param {*} [options.fallback]
 *   Returned in GET mode if path not found
 * @returns {*}
 *   - GET mode → value at path or fallback
 *   - SET mode → value set
 */
export function accessDatabase(obj, path, { value, fallback } = {}) {
  if (typeof path !== 'string') throw new Error('Path must be a string');

  // Convert "a[b].c" → ["a","b","c"]
  const keys = path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  let acc = obj;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isLast = i === keys.length - 1;
    const nextKey = keys[i + 1];

    // Path broken → GET mode returns fallback
    if (acc == null) return fallback;

    // SET mode: assign value to last key
    if (isLast && value !== undefined) {
      acc[key] = value;
      return value;
    }

    // SET mode: create missing intermediate objects/arrays
    if (value !== undefined && acc[key] == null) {
      acc[key] = Number.isFinite(+nextKey) ? [] : {};
    }

    // Traverse deeper
    acc = acc[key];
  }

  // GET mode: return resolved value or fallback
  return acc === undefined ? fallback : acc;
}

/* --------------------------------------------------------------------------
 * 🔍 resolveAnswerValue
 * ------------------------------------------------------------------------ */
/**
 * 🔍 resolveAnswerValue
 *
 * Resolves a value from a database using:
 *  - a dot/bracket path string OR
 *  - a custom resolver function
 *
 * Preserves fallback behavior and never crashes.
 *
 * @param {Object} db
 *   The database object
 * @param {string|Function} resolver
 *   - string → path (e.g. "employmentInfo.gender")
 *   - function → (db) => any
 * @param {*} [fallback]
 *   Value returned if resolution fails or is undefined
 *
 * @returns {*} resolved value or fallback
 */
export function resolveAnswerValue(db, resolver, fallback = undefined) {
  try {
    if (typeof resolver === 'function') {
      const result = resolver(db);
      return result ?? fallback;
    }

    if (typeof resolver === 'string') {
      return accessDatabase(db, resolver, { fallback });
    }

    // Invalid resolver → fallback
    return fallback;
  } catch {
    return fallback; // never crash
  }
}


/* --------------------------------------------------------------------------
 * 👷🏼🤝 ATS Config Helpers
 * ------------------------------------------------------------------------ */
export const getKey = key => key.split('.')[1];

export const parseDate = (dateStr) => {
	if (!dateStr) return null;

	// Expecting YYYY-MM-DD
	const [year, month, day] = dateStr.split('-').map(Number);
	if (!year || !month || !day) return null;

	// Create LOCAL date (no timezone shift)
	return new Date(year, month - 1, day);
};

export const getMonth = dateStr => {
	const d = parseDate(dateStr);
	return d ? String(d.getMonth() + 1).padStart(2, '0') : undefined;
};

export const getYear = dateStr => {
	const d = parseDate(dateStr);
	return d ? String(d.getFullYear()) : undefined;
};

export const isCurrentlyWorking = endDateStr => {
	if (!endDateStr) return true; // no end date → current

	const end = parseDate(endDateStr);
	if (!end) return false;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	return end >= today;
};


/* --------------------------------------------------------------------------
 * 📬 notifyTabState(updates)
 * ------------------------------------------------------------------------ */
/**
 * Sends an update to the background script indicating
 * the current automation state of this tab.
 *
 * @function notifyTabState
 * @param {object} updates - Data describing the automation status.
 * @example
 * notifyTabState({ state: 'running', progress: 50 });
 */
export function notifyTabState(updates, options = {}) {
	try {
		chrome.runtime.sendMessage({
			action: 'setTabState',
			updateUI: options.updateUI === true, // default: false
			postExecutionResult: options.postExecutionResult === true, // default: false
			...updates,
		});
		console.log('[Utility] Notified automation state update:', updates);
	} catch (err) {
		console.warn('[Utility] Failed to send state update:', err);
	}
}

export async function getTabState() {
	const tabState = await chrome.runtime.sendMessage({ action: 'getTabState' });
	// console.log("TAB STATE:::", tabState);
	return tabState;
}

export async function getSessionId() {
	const tabState = await getTabState();
	return tabState.sessionId;
}


/* --------------------------------------------------------------------------
 * 🔎 waitForElement(selector, timeout)
 * ------------------------------------------------------------------------ */
/**
 * Waits for a specific DOM element to appear dynamically.
 *
 * @async
 * @function waitForElement
 * @param {string} selector - CSS selector of the element to wait for.
 * @param {number} [timeout=10] - Maximum time to wait, in **seconds**.
 * @returns {Promise<boolean>} Resolves:
 *   • `true` → Element found
 *   • `false` → Timed out waiting
 */
export async function waitForElement(selector, { timeout = 10 } = {}) {
	return new Promise((resolve) => {
		// ✅ Element already exists → resolve immediately
		if (document.querySelector(selector)) return resolve(true);

		// 👀 Watch for changes in DOM
		const observer = new MutationObserver(() => {
			if (document.querySelector(selector)) {
				observer.disconnect();
				resolve(true);
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		// ⏰ Stop watching after timeout
		setTimeout(() => {
			observer.disconnect();
			resolve(false);
		}, timeout * 1000);
	});
}

/* --------------------------------------------------------------------------
 * 🔎 waitForElementSmart(selector, options)
 * ------------------------------------------------------------------------ */
/**
 * Waits for a specific DOM element to appear dynamically.
 *
 * Abort-aware (hybrid model):
 *   • Uses global execution signal by default
 *   • Can be overridden via explicit signal
 *
 * @async
 * @function waitForElement
 *
 * @param {string} selector - CSS selector of the element to wait for.
 * @param {object} [options]
 * @param {number} [options.timeout=10] - Maximum time to wait (seconds).
 * @param {Element} [options.root=document.body] - Root to observe.
 * @param {AbortSignal} [signal] - Optional override signal.
 *
 * @returns {Promise<boolean>} Resolves:
 *   • `true`  → Element found
 *   • `false` → Timed out
 *   • throws AbortError → Execution aborted
 */
export async function waitForElementSmart(selector, { timeout = 10, root = document.body } = {}, signal = getExecutionSignal()) {
	// ✅ Fast path — element already exists
	if (document.querySelector(selector)) return true;

	return new Promise((resolve, reject) => {
		let finished = false;
		let timer = null;

		const cleanup = () => {
			finished = true;
			observer.disconnect();
			if (timer) clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			cleanup();
			reject(new DOMException('Execution aborted', 'AbortError'));
		};

		const check = () => {
			if (finished) return;
			if (document.querySelector(selector)) {
				cleanup();
				resolve(true);
			}
		};

		const observer = new MutationObserver(check);

		if (root) {
			observer.observe(root, {
				childList: true,
				subtree: true,
			});
		}

		// ⏰ Timeout handling
		timer = setTimeout(() => {
			if (!finished) {
				cleanup();
				resolve(false);
			}
		}, timeout * 1000);

		// 🛑 Abort handling
		if (signal) {
			if (signal.aborted) return onAbort();
			signal.addEventListener('abort', onAbort, { once: true });
		}

		// 🔁 Immediate re-check (race-safe)
		check();
	});
}


/* --------------------------------------------------------------------------
 * 🧍‍♂️ waitForStableDOM(options)
 * ------------------------------------------------------------------------ */
/**
 * Waits until the DOM stops changing — useful for ensuring
 * dynamically rendered pages (e.g., React, Workday) have settled.
 *
 * @async
 * @function waitForStableDOM
 * @param {object} options
 * @param {number} [options.timeout=15] - Max wait duration in seconds.
 * @param {number} [options.checkInterval=0.5] - Delay between stability checks (seconds).
 * @param {number} [options.requiredStableChecks=3] - Number of consecutive unchanged checks required.
 * @param {number} [options.padding=0.5] - Extra buffer time after stabilization (seconds).
 * @returns {Promise<boolean>} Resolves:
 *   • `true` → DOM stabilized
 *   • `false` → Timed out waiting
 */
export async function waitForStableDOM({timeout = 15, checkInterval = 0.5, requiredStableChecks = 3, padding = 0.5,} = {}) {
	const deadline = Date.now() + timeout * 1000;

	// 🧱 Wait until <body> exists (important for early execution)
	if (!document.body) {
		await new Promise((resolve) => {
			const observer = new MutationObserver(() => {
				if (document.body) {
					observer.disconnect();
					resolve();
				}
			});
			observer.observe(document.documentElement, { childList: true, subtree: true });
		});
	}

	let stableChecks = 0;
	let mutationDetected = true;

	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			mutationDetected = true;
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});

		const intervalId = setInterval(() => {
			if (Date.now() > deadline) {
				clearInterval(intervalId);
				observer.disconnect();
				console.warn(`⚠️ DOM did not stabilize within ${timeout}s.`);
				return resolve(false);
			}

			// 🧘 Check for stability
			if (!mutationDetected) {
				stableChecks++;
				if (stableChecks >= requiredStableChecks) {
					clearInterval(intervalId);
					observer.disconnect();
					return setTimeout(() => resolve(true), padding * 1000);
				}
			} else {
				// 🔁 Reset counter on any new change
				stableChecks = 0;
				mutationDetected = false;
			}
		}, checkInterval * 1000);
	});
}

/* --------------------------------------------------------------------------
 * 🧍‍♂️ waitForStableDOMSmart(options)
 * ------------------------------------------------------------------------ */
/**
 * Waits until the DOM stops changing — useful for ensuring
 * dynamically rendered pages (e.g., React, Workday, Greenhouse) have settled.
 *
 * Abort-aware (hybrid model):
 *   • Uses global execution signal by default
 *   • Can be overridden via explicit signal argument
 *
 * @async
 * @function waitForStableDOM
 *
 * @param {object} options
 * @param {number} [options.timeout=15] - Max wait duration in seconds
 * @param {number} [options.checkInterval=0.5] - Delay between stability checks (seconds)
 * @param {number} [options.requiredStableChecks=3] - Consecutive unchanged checks required
 * @param {number} [options.padding=0.5] - Extra buffer after stabilization (seconds)
 * @param {AbortSignal} [signal] - Optional override signal
 *
 * @returns {Promise<boolean>}
 *   • true  → DOM stabilized
 *   • false → Timed out
 */
export async function waitForStableDOMSmart({ timeout = 15, checkInterval = 0.5, requiredStableChecks = 3, padding = 0.5,} = {}, signal = getExecutionSignal()) {

	const deadline = Date.now() + timeout * 1000;

	/* ---------------------------------------------------------------------- */
	/* 🧱 Ensure <body> exists (early execution safe)                           */
	/* ---------------------------------------------------------------------- */

	if (!document.body) {
		await new Promise((resolve, reject) => {
			const observer = new MutationObserver(() => {
				if (signal?.aborted) {
					observer.disconnect();
					return reject(new DOMException('Execution aborted', 'AbortError'));
				}

				if (document.body) {
					observer.disconnect();
					resolve();
				}
			});

			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
			});

			if (signal) {
				signal.addEventListener(
					'abort',
					() => {
						observer.disconnect();
						reject(new DOMException('Execution aborted', 'AbortError'));
					},
					{ once: true }
				);
			}
		});
	}

	/* ---------------------------------------------------------------------- */
	/* 🧘 Stability detection                                                  */
	/* ---------------------------------------------------------------------- */

	let stableChecks = 0;
	let mutationDetected = true;

	return new Promise((resolve, reject) => {
		let intervalId = null;

		const observer = new MutationObserver(() => { mutationDetected = true; });

		const cleanup = () => {
			if (intervalId) clearInterval(intervalId);
			observer.disconnect();
			signal?.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			cleanup();
			reject(new DOMException('Execution aborted', 'AbortError'));
		};

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});

		intervalId = setInterval(() => {
			if (signal?.aborted) return onAbort();

			if (Date.now() > deadline) {
				cleanup();
				console.warn(`⚠️ DOM did not stabilize within ${timeout}s.`);
				return resolve(false);
			}

			if (!mutationDetected) {
				stableChecks++;
				if (stableChecks >= requiredStableChecks) {
					cleanup();
					return setTimeout(() => resolve(true), padding * 1000);
				}
			} else {
				stableChecks = 0;
				mutationDetected = false;
			}
		}, checkInterval * 1000);

		if (signal) {
			if (signal.aborted) return onAbort();
			signal.addEventListener('abort', onAbort, { once: true });
		}
	});
}


/* --------------------------------------------------------------------------
 * 🧬 DomChangeChecker(root, defaultThreshold)
 * ------------------------------------------------------------------------ */
/**
 * Creates a DOM change tracker that detects meaningful page changes
 * by fingerprinting interactive elements (inputs, buttons, etc.).
 *
 * Provides manual control for setting snapshots and thresholds.
 *
 * @function DomChangeChecker
 * @param {Element} [root=document.body] - DOM root to monitor.
 * @param {number} [defaultThreshold=0.69] - Ratio below which DOM is considered changed.
 * @returns {{
 *   hasDomChanged: (customThreshold?: number) => Promise<boolean>,
 *   waitForDomChange: (options?: {timeout?: number, customThreshold?: number}) => Promise<boolean>,
 *   setSnapshot: () => void,
 *   setThreshold: (newThreshold: number) => void
 * }}
 */
export function DomChangeChecker(root = document.body, defaultThreshold = 0.10) {
	let lastSnapshot = root.innerHTML;
	let threshold = defaultThreshold;

	// 🎯 Targeted element patterns for comparison
	const elementPatterns = [
		/<input\b[^>]*>/gi,
		/<textarea\b[^>]*>/gi,
		/<select\b[^>]*>/gi,
		/<button\b[^>]*>/gi,
		/<[^>]*\brole=["']button["'][^>]*>/gi,
	];

	/**
	 * Extract unique “fingerprints” of interactive elements based on key attributes.
	 * @param {string} html - HTML source to parse.
	 * @returns {Set<string>} Unique hashed signatures of elements.
	 */
	function extractElementFingerprints(html) {
		const matches = [];
		for (const pattern of elementPatterns) {
			const found = html.match(pattern);
			if (found) matches.push(...found);
		}

		const fingerprints = new Set();
		for (const tag of matches) {
			const attrs = {};
			const attrPattern = /(\w[\w-]*)=["']?([^"'> ]*)/g;
			let match;
			while ((match = attrPattern.exec(tag)) !== null) {
				attrs[match[1]] = match[2];
			}

			const keyAttrs = ['name', 'id', 'placeholder', 'type', 'aria-label', 'role'];
			const signature = keyAttrs.map((k) => `${k}:${attrs[k] || ''}`).join('|');
			fingerprints.add(simpleHash(signature));
		}
		return fingerprints;
	}

	/**
	 * Generates a lightweight hash from a string.
	 * @param {string} str
	 * @returns {string}
	 */
	function simpleHash(str) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash) + str.charCodeAt(i);
			hash |= 0; // force 32-bit integer
		}
		return hash.toString();
	}

	/**
	 * Checks if the DOM has changed significantly since the last snapshot.
	 * @param {number} [customThreshold] - Override the comparison threshold.
	 * @returns {Promise<boolean>} True if DOM changed.
	 */
	async function hasDomChanged(customThreshold) {
		const currentSnapshot = root.innerHTML;
		const usedThreshold = customThreshold ?? threshold;

		// Extract fingerprints from both old and new DOM states
		const before = extractElementFingerprints(lastSnapshot);
		const after = extractElementFingerprints(currentSnapshot);

		// Calculate preserved fingerprints (common between old and new)
		let preserved = 0;
		for (const f of before) {
			if (after.has(f)) preserved++;
		}

		// Calculate added and removed fingerprints
		const added = after.size - preserved; // Anything in `after` that wasn't preserved
		const removed = before.size - preserved; // Anything in `before` that wasn't preserved

		// Calculate change ratio
		const totalElements = before.size + after.size;
		const changeRatio = totalElements === 0 ? 0 : (added + removed) / totalElements;

		console.log("CHANGE:::", changeRatio, " MY THRESHOLD:::", usedThreshold);

		// Update the snapshot for the next comparison
		lastSnapshot = currentSnapshot;

		// Return whether the change ratio exceeds the threshold
		return changeRatio >= usedThreshold;
	}

	/**
	 * Waits for a significant DOM change to occur within a given timeout.
	 *
	 * @param {object} [options]
	 * @param {number} [options.timeout=2] - Max wait in seconds.
	 * @param {number} [options.customThreshold] - Optional override for threshold.
	 * @returns {Promise<boolean>} True if DOM changed, else false (timeout).
	 */
	async function waitForDomChange({ timeout = 2, customThreshold = threshold } = {}) {
		return new Promise((resolve) => {
			let resolved = false;

			const check = async () => {
				if (await hasDomChanged(customThreshold)) {
					if (!resolved) {
						resolved = true;
						observer.disconnect();
						clearTimeout(timer);
						resolve(true);
					}
				}
			};

			const observer = new MutationObserver(() => check());
			observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });

			// Immediate check in case DOM has already changed
			check();

			const timer = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					observer.disconnect();
					resolve(false);
				}
			}, timeout * 1000);
		});
	}

	return {
		hasDomChanged,
		waitForDomChange,
		setSnapshot() { lastSnapshot = root.innerHTML; },
		setThreshold(newThreshold) { threshold = newThreshold; },
	};
}

/* --------------------------------------------------------------------------
 * 🧬 DomChangeCheckerSmart(root, defaultThreshold)
 * ------------------------------------------------------------------------ */
/**
 * Creates a DOM change tracker that detects meaningful page changes
 * by fingerprinting interactive elements (inputs, buttons, etc.).
 *
 * Abort-aware (hybrid model):
 *   • Uses global execution signal by default
 *   • Can be overridden via explicit signal
 *
 * @function DomChangeChecker
 * @param {Element} [root=document.body]
 * @param {number} [defaultThreshold=0.10]
 */
export function DomChangeCheckerSmart(root = document.body, defaultThreshold = 0.10) {
	let lastSnapshot = root?.innerHTML ?? '';
	let threshold = defaultThreshold;

	/* ---------------------------------------------------------------------- */
	/* 🎯 Element patterns                                                     */
	/* ---------------------------------------------------------------------- */

	const elementPatterns = [
		/<input\b[^>]*>/gi,
		/<textarea\b[^>]*>/gi,
		/<select\b[^>]*>/gi,
		/<button\b[^>]*>/gi,
		/<[^>]*\brole=["']button["'][^>]*>/gi,
	];

	function simpleHash(str) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash) + str.charCodeAt(i);
			hash |= 0;
		}
		return hash.toString();
	}

	function extractElementFingerprints(html) {
		const matches = [];
		for (const pattern of elementPatterns) {
			const found = html.match(pattern);
			if (found) matches.push(...found);
		}

		const fingerprints = new Set();

		for (const tag of matches) {
			const attrs = {};
			const attrPattern = /(\w[\w-]*)=["']?([^"'> ]*)/g;
			let match;

			while ((match = attrPattern.exec(tag)) !== null) {
				attrs[match[1]] = match[2];
			}

			const keyAttrs = ['name', 'id', 'placeholder', 'type', 'aria-label', 'role'];
			const signature = keyAttrs.map(k => `${k}:${attrs[k] || ''}`).join('|');

			fingerprints.add(simpleHash(signature));
		}

		return fingerprints;
	}

	/* ---------------------------------------------------------------------- */
	/* 🔍 Change detection                                                     */
	/* ---------------------------------------------------------------------- */

	async function hasDomChanged(customThreshold, signal = getExecutionSignal()) {
		if (signal?.aborted) {
			throw new DOMException('Execution aborted', 'AbortError');
		}

		if (!root) return false;

		const currentSnapshot = root.innerHTML;
		const usedThreshold = customThreshold ?? threshold;

		const before = extractElementFingerprints(lastSnapshot);
		const after = extractElementFingerprints(currentSnapshot);

		let preserved = 0;
		for (const f of before) {
			if (after.has(f)) preserved++;
		}

		const added = after.size - preserved;
		const removed = before.size - preserved;
		const total = before.size + after.size;

		const changeRatio = total === 0 ? 0 : (added + removed) / total;

		console.log("CHANGE:::", changeRatio, " MY THRESHOLD:::", usedThreshold);

		// Update snapshot for next comparison
		lastSnapshot = currentSnapshot;

		return changeRatio >= usedThreshold;
	}

	/* ---------------------------------------------------------------------- */
	/* ⏳ Wait for DOM change                                                   */
	/* ---------------------------------------------------------------------- */

	async function waitForDomChange(
		{ timeout = 2, customThreshold = threshold } = {},
		signal = getExecutionSignal()
	) {
		return new Promise((resolve, reject) => {
			let finished = false;
			let timer = null;

			const cleanup = () => {
				finished = true;
				observer.disconnect();
				if (timer) clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
			};

			const onAbort = () => {
				cleanup();
				reject(new DOMException('Execution aborted', 'AbortError'));
			};

			const check = async () => {
				if (finished) return;

				try {
					if (signal?.aborted) return onAbort();

					if (await hasDomChanged(customThreshold, signal)) {
						cleanup();
						resolve(true);
					}
				} catch (err) {
					if (err.name === 'AbortError') {
						onAbort();
					}
					// ignore transient DOM errors
				}
			};

			const observer = new MutationObserver(check);

			if (root) {
				observer.observe(root, {
					childList: true,
					subtree: true,
					attributes: true,
					characterData: true,
				});
			}

			// Immediate check in case change already occurred
			check();

			timer = setTimeout(() => {
				if (!finished) {
					cleanup();
					resolve(false);
				}
			}, timeout * 1000);

			if (signal) {
				if (signal.aborted) return onAbort();
				signal.addEventListener('abort', onAbort, { once: true });
			}
		});
	}

	/* ---------------------------------------------------------------------- */
	/* 🧰 Public API                                                           */
	/* ---------------------------------------------------------------------- */

	return {
		hasDomChanged,
		waitForDomChange,
		setSnapshot() {
			lastSnapshot = root?.innerHTML ?? '';
		},
		setThreshold(newThreshold) {
			threshold = newThreshold;
		},
	};
}



/* ==========================================================================
 * 🧩 Page State Conditions Engine
 * ========================================================================== */
/**
 * --------------------------------------------------------------------------
 * 🔗 AND(...conditions)
 * ------------------------------------------------------------------------ 
 * 
 * Creates a composite condition that only resolves to `true` if **all**
 * child conditions are true.
 *
 * Supports both synchronous and asynchronous predicates.
 *
 * Usage:
 *   await waitUntil(AND(condA, condB, condC));
 *
 * @param {...() => boolean | Promise<boolean>} conditions
 *   One or more condition functions to evaluate.
 *
 * @returns {() => Promise<boolean>}
 *   A new async condition function representing the logical AND of all inputs.
 *  --------------------------------------------------------------------------
 * 🔗 OR(...conditions)
 * ------------------------------------------------------------------------ 
 * 
 * Creates a composite condition that resolves to `true` if **any**
 * of the child conditions are true.
 *
 * Supports both synchronous and asynchronous predicates.
 *
 * Usage:
 *   await waitUntil(OR(condA, condB, condC));
 *
 * @param {...() => boolean | Promise<boolean>} conditions
 *   One or more condition functions to evaluate.
 *
 * @returns {() => Promise<boolean>}
 *   A new async condition function representing the logical OR of all inputs.
 * --------------------------------------------------------------------------
 * 🔗 NOT(condition)
 * ------------------------------------------------------------------------ 
 * Creates a negated condition, returning `true` only when the input
 * condition resolves to `false`.
 *
 * Supports both synchronous and asynchronous predicates.
 *
 * Usage:
 *   await waitUntil(NOT(isLoading));
 *
 * @param {() => boolean | Promise<boolean>} condition
 *   A single condition function to negate.
 *
 * @returns {() => Promise<boolean>}
 *   A new async condition function representing the logical negation.
 * ==========================================================================
 * 🧩 Page State Conditions Engine
 * ==========================================================================
 *
 * Purpose:
 *   Modern dynamic pages (React, Workday, Greenhouse, etc.) do not expose
 *   reliable "ready" events. Elements appear asynchronously, loaders flicker,
 *   and internal DOM mutations are frequent.
 *
 *   This engine abstracts page readiness into composable, declarative
 *   **conditions** that can be polled and/or triggered by DOM mutations.
 *
 * Core Principles:
 *   1. Atomic "sensors" detect discrete page states (elements, text, style).
 *   2. Combinators (AND, OR, NOT) build complex, reusable logic trees.
 *   3. waitUntil() waits efficiently and safely until a desired state occurs.
 *
 * Benefits:
 *   • Reduces brittle hard-coded waits
 *   • Makes automation flows readable, maintainable, and declarative
 *   • Scales across multiple pages and flows with minimal duplication
 *
 * Usage:
 *   const isApplyFlowReady = AND(isApplyFlowPresent, NOT(isAnyContainerLoading));
 *   await waitUntil(isApplyFlowReady, { timeout: 20 });
 *
 * This pattern lets automation code respond to **page intent**, not just
 * element appearance, which is essential for reliable job application flows.
 */
/**
 * Logical AND combinator.
 * Resolves true only if ALL conditions resolve true.
 */
export const AND = (...conditions) => async () => {
  for (const cond of conditions) {
    if (!(await cond())) return false;
  }
  return true;
};

/**
 * Logical OR combinator.
 * Resolves true if ANY condition resolves true.
 */
export const OR = (...conditions) => async () => {
  for (const cond of conditions) {
    if (await cond()) return true;
  }
  return false;
};

/**
 * Logical NOT combinator.
 * Resolves true only if condition resolves false.
 */
export const NOT = (condition) => async () => {
  return !(await condition());
};

/* --------------------------------------------------------------------------
 * ⏳ waitUntil(condition, options)
 * ------------------------------------------------------------------------ */
/**
 * Waits until a dynamically evaluated condition (or condition tree)
 * becomes true, or until a maximum timeout is reached.
 *
 * This function is designed for complex, asynchronous, and mutation-heavy
 * pages (e.g. React / Workday / Greenhouse), where readiness must be inferred
 * from DOM state rather than explicit events.
 *
 * The condition can be:
 *   • A single boolean-returning function
 *   • An async condition
 *   • A composed condition using logical combinators (AND / OR / NOT)
 *
 * Internally, the function reacts to both:
 *   • DOM mutations (via MutationObserver)
 *   • Periodic polling (as a safety fallback)
 *
 * @async
 * @function waitUntil
 *
 * @param {() => boolean | Promise<boolean>} condition
 *   A predicate function representing the desired page state.
 *   It will be re-evaluated whenever the DOM changes or on each poll cycle.
 *
 * @param {object} [options]
 * @param {number} [options.timeout=10]
 *   Maximum time to wait before giving up (in seconds).
 *
 * @param {number} [options.pollInterval=100]
 *   Fallback polling interval (in milliseconds) to re-check the condition.
 *
 * @param {boolean} [options.observeMutations=true]
 *   Whether to re-evaluate the condition on DOM mutations.
 *
 * @param {Element} [options.root=document.body]
 *   DOM root to observe for mutations.
 *
 * @returns {Promise<boolean>}
 *   Resolves:
 *     • `true`  → Condition satisfied within timeout
 *     • `false` → Timeout reached before condition became true
 *
 * @example
 * await waitUntil(
 *   AND(isApplyFlowPresent, NOT(isAnyContainerLoading)),
 *   { timeout: 20 }
 * );
 */
export async function waitUntil(condition, { timeout = 10, pollInterval = 100, observeMutations = true, root = document.body } = {}) {
	const deadline = Date.now() + timeout * 1000;

	if (!root && observeMutations) {
		await waitForStableDOM({ timeout: 2 });
	}

	return new Promise((resolve) => {
		let done = false;

		const check = async () => {
			if (done) return;

			try {
				if (await condition()) {
					done = true;
					cleanup();
					resolve(true);
				} else if (Date.now() > deadline) {
					done = true;
					cleanup();
					resolve(false);
				}
			} catch {
				// ignore transient DOM errors
			}
		};

		const interval = setInterval(check, pollInterval);

		const observer = observeMutations
			? new MutationObserver(check)
			: null;

		if (observer && root) {
			observer.observe(root, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
		}

		const cleanup = () => {
			clearInterval(interval);
			observer?.disconnect();
		};

		check(); // immediate check
	});
}

/* --------------------------------------------------------------------------
 * ⏳ waitUntilSmart(condition, options)
 * ------------------------------------------------------------------------ */
/**
 * Waits until a dynamically evaluated condition becomes true,
 * or until timeout is reached.
 *
 * Designed for mutation-heavy, async DOMs (React, Workday, Greenhouse).
 *
 * @param {() => boolean | Promise<boolean>} condition
 * @param {Object} options
 * @param {number} [options.timeout=10]          Timeout in seconds
 * @param {number} [options.pollInterval=100]    Poll fallback (ms)
 * @param {boolean} [options.observeMutations=true]
 * @param {Element} [options.root=document.body]
 * @param {AbortSignal} [signal]                 Optional override
 *
 * @returns {Promise<boolean>}
 */
export async function waitUntilSmart(condition,{ timeout = 10, pollInterval = 100, observeMutations = true, root = document.body } = {}, signal = getExecutionSignal()) {
	const deadline = Date.now() + timeout * 1000;

	// Ensure we don't observe an unstable DOM root
	if (!root && observeMutations) {
		throw new Error('[waitUntil] observeMutations=true but no root provided');
	}

	return new Promise((resolve, reject) => {
		let finished = false;
		let intervalId = null;
		let observer = null;

		const cleanup = () => {
			finished = true;
			if (intervalId) clearInterval(intervalId);
			observer?.disconnect();
			signal?.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			cleanup();
			reject(new DOMException('Execution aborted', 'AbortError'));
		};

		const evaluate = async () => {
			if (finished) return;

			try {
				if (signal?.aborted) return onAbort();

				if (await condition()) {
					cleanup();
					resolve(true);
				} else if (Date.now() > deadline) {
					cleanup();
					resolve(false);
				}
			} catch {
				// Ignore transient DOM / race errors
			}
		};

		// Polling fallback
		intervalId = setInterval(evaluate, pollInterval);

		// DOM mutation trigger
		if (observeMutations && root) {
			observer = new MutationObserver(evaluate);
			observer.observe(root, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
		}

		// Abort handling
		if (signal) {
			if (signal.aborted) return onAbort();
			signal.addEventListener('abort', onAbort, { once: true });
		}

		// Immediate evaluation
		evaluate();
	});
}


/* --------------------------------------------------------------------------
 * 🤖 invokeLLM(prompts, timeoutSeconds)
 * ------------------------------------------------------------------------ */
/**
 * Sends prompts to background.js for ChatGPT search and returns the response.
 *
 * @param {Array<Object>} prompts - Array of prompt objects
 * @param {number|null} [timeoutSeconds=null] - Maximum time to wait for response. Null = no timeout
 * @returns {Promise<{ success: boolean, payload: any[], errors: string }>}
 */
/**
 * USAGE
 * 
	try {		
		const prompts = [
			{"prompt": "Hello, how are you?", "timeout":10, "copy":false},
			{"prompt": "Tell me a joke.", "timeout":15, "copy":true},
			{"prompt": "Summarize this text.", "timeout":10, "copy":true, "response_type": "html", "fit_font_size": true}
		]
		const response = await invokeLLM(prompts);

		if (response.success) {
			console.log("LLM responses:", response.payload);
		} else {
			console.error("LLM errors:", response.errors);
		}
		domChangeChecker.setSnapshot()
		return true;
	} catch (err) {
		console.error("processInfoPage failed:", err);
		return false;
	}
 *  
 */

export async function invokeLLM(prompts, timeoutSeconds = null) {
	try {
		if (!Array.isArray(prompts) || prompts.length === 0) {
			throw new Error("Prompts must be a non-empty array");
		}

		// Wrap sendMessage in a Promise
		const request = new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(
				{
					action: "askLLM",
					payload: { prompts, search_incognito: true, timeout: timeoutSeconds }
				},
				(response) => {
					if (chrome.runtime.lastError) {
						reject(new Error(chrome.runtime.lastError.message));
					} else {
						resolve(response);
					}
				}
			);
		});

		// Apply timeout if specified
		const response = timeoutSeconds
			? await Promise.race([
				  request,
				  new Promise((_, reject) =>
					  setTimeout(() => reject(new Error("LLM request timed out")), timeoutSeconds * 1000)
				  )
			  ])
			: await request;

		if (!response) {
			throw new Error("No response received from background");
		}

		if (!response.success) {
			throw new Error(
				Array.isArray(response.errors)
					? response.errors.join("; ")
					: response.errors || "Unknown error from LLM"
			);
		}

		return {
			success: true,
			payload: response.payload || [],
			errors: ""
		};
	} catch (err) {
		console.error("[Utility] invokeLLM error:", err);
		return {
			success: false,
			payload: [],
			errors: err.message
		};
	}
}

export async function sendQuestionsToLLM(questions, jobDetails, timeoutSeconds = null) {

	if (!Array.isArray(questions)) return {success: false, payload: null, errors: ["Questions must be of array type."]}
	else if (!questions.length) return {success: true, payload: [], errors: []}

	// Request resolveQuestionWithLLM service to server through background.js.
	async function fetchAnswers(questions, jobDetails, timeoutSeconds) {

		const sessionId = await getSessionId()
		try {
			console.log("Sending to LLM Server:", { questions: questions, job_details: jobDetails });
			// Wrap sendMessage in a Promise
			const request = new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						action: "resolveQuestionWithLLM",
						payload: { questions: questions, job_details: jobDetails }
					},
					(response) => {
						if (chrome.runtime.lastError) {
							reject(new Error(chrome.runtime.lastError.message));
						} else {
							resolve(response);
						}
					}
				);
			});

			// Apply timeout if specified
			const response = timeoutSeconds
				? await Promise.race([
					request,
					new Promise((_, reject) =>
						setTimeout(() => reject({ success: false, payload: null, errors: ["Server request timeout"] }), timeoutSeconds * 1000)
					)
				])
				: await request;

			console.log("RESPONSE FROM LLM SERVER:", response);
			if (!response) return { success: false, payload: null, errors: ["No response received from background"] };
			return { success: response.success, payload: response.payload, errors: response.errors };

		} catch (err) {
			console.error("[Utility] sendQuestionsToLLM error:", err);
			return { success: false, payload: null, errors: [err.message] };
		}

	}

	const response = await fetchAnswers(questions, jobDetails, timeoutSeconds); // {success: bool, payload: Array[ dict<object>(questionId: string, response: Array[]|string) ] | null, errors: Array[]}
	return response
}

export async function getNearestAddress(jobLocations, timeoutSeconds = null) {

	// Request getNearestAddress service to server through background.js.
	async function fetchNearestAddress(jobLocations, timeoutSeconds) {

		if (!jobLocations) return { success: false, payload: null, errors: ["Invalid job location"] };

		try {
			// Wrap sendMessage in a Promise
			const request = new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						action: "getNearestAddress",
						payload: { location: jobLocations }
					},
					(response) => {
						if (chrome.runtime.lastError) {
							reject(new Error(chrome.runtime.lastError.message));
						} else {
							resolve(response);
						}
					}
				);
			});

			// Apply timeout if specified
			const response = timeoutSeconds
				? await Promise.race([
					request,
					new Promise((_, reject) =>
						setTimeout(() => reject({ success: false, payload: null, errors: ["Server request timeout"] }), timeoutSeconds * 1000)
					)
				])
				: await request;

			if (!response) return { success: false, payload: null, errors: ["No response received from background"] };
			return { success: response.success, payload: response.payload, errors: response.errors };

		} catch (err) {
			console.error("[Utility] getNearestAddress error:", err);
			return { success: false, payload: null, errors: [err.message] };
		}

	}
	
	let nearestAddress;
	const response = await fetchNearestAddress(jobLocations, timeoutSeconds); // {success: bool, payload: dict|null, errors: Array[]}
	// Server returned with success.
	if(response.success) nearestAddress = response?.payload;
	return nearestAddress; // dict-object || undefined
}

export async function getBestResume(jobLocations, jobDescription, timeoutSeconds = null) {

	// Request getBestResume service to server through background.js.
	async function fetchBestResume(jobLocations, jobDescription, timeoutSeconds) {

		if (!jobLocations) return { success: false, payload: null, errors: ["Invalid job location"] };
		if (!jobDescription) return { success: false, payload: null, errors: ["Invalid job description"] };

		try {
			// Wrap sendMessage in a Promise
			const request = new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						action: "getBestResume",
						payload: { location: jobLocations, role_description: jobDescription }
					},
					(response) => {
						if (chrome.runtime.lastError) {
							reject(new Error(chrome.runtime.lastError.message));
						} else {
							resolve(response);
						}
					}
				);
			});

			// Apply timeout if specified
			const response = timeoutSeconds
				? await Promise.race([
					request,
					new Promise((_, reject) =>
						setTimeout(() => reject({ success: false, payload: null, errors: ["Server request timeout"] }), timeoutSeconds * 1000)
					)
				])
				: await request;

			if (!response) return { success: false, payload: null, errors: ["No response received from background"] };
			return { success: response.success, payload: response.payload, errors: response.errors };

		} catch (err) {
			console.error("[Utility] getBestResume error:", err);
			return { success: false, payload: null, errors: [err.message] };
		}

	}
	
	let bestResume;
	const response = await fetchBestResume(jobLocations, jobDescription, timeoutSeconds); // {category: str, region: str, file_path: str}
	// Server returned with success.
	if(response.file_path) bestResume = response?.file_path;
	return bestResume; // str || undefined
}



/* --------------------------------------------------------------------------
 * 🌐 getWebsites(USER_DB)
 * ------------------------------------------------------------------------ */
export function getWebsites(USER_DB) { // returns Array[] of strings.

	const userWebsites = [];

	[ DB_KEY_MAP.LINKEDIN, DB_KEY_MAP.GITHUB, DB_KEY_MAP.PORTFOLIO ].forEach(key => { // Ordered single-value fields
		const value = resolveAnswerValue(USER_DB, key, '');
		if (typeof value === 'string' && value.trim()) {
			userWebsites.push(value.trim());
		}
	});

	const otherUrls = resolveAnswerValue(USER_DB, DB_KEY_MAP.OTHER_URLS, []); // Multi-value field
	if (Array.isArray(otherUrls)) {
		otherUrls
		.filter(url => typeof url === 'string' && url.trim())
		.forEach(url => userWebsites.push(url.trim()));
	}
	return userWebsites;
	
}