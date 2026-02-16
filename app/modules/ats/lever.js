// app/modules/lever.js
// ============================================================================
// 🧩 Lever Automation Module
// ============================================================================
// 📘 Purpose:
// Handles the complete Lever job application automation flow.
//
// ⚙️ Invoked By:
//   Higher-level ATS automation controller (e.g. content.js)
//
// ============================================================================
// 📁 Dependencies
// ============================================================================

import { createExecutionController, clearExecutionController, getExecutionSignal, abortExecution, throwIfAborted, waitUntil, retryUntilTrue, sleep, clamp, waitForStableDOMSmart, DomChangeCheckerSmart, notifyTabState, getTabState } from '@shared/utils/utility.js';
import { click } from '@form/formHandlers.js';
import { SELECTORS, LEVER_PAGES } from '@ats/config/leverConfig.js';
import { initExecutionPayload, getPage, initializePage, getQuestions, resolveQuestions, isQuestionSet } from '@ats/utils/leverUtils.js';

// Create shared DOM change tracker instance
const domChangeChecker = DomChangeCheckerSmart();

const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)

const AND = (...conditions) => async () =>
  (await Promise.all(conditions.map(c => c()))).every(Boolean);
const OR = (...conditions) => async () =>
  (await Promise.all(conditions.map(c => c()))).some(Boolean);
const NOT = (condition) => async () =>
  !(await condition());



// ==========================================================================================================
// 💡 STEP 1: Page Handlers
// ==========================================================================================================


/**
 * 🧩 (APPLICATION FLOW PAGE) (CORE) | Apply Flow Handler
 * 
 * @returns {Promise<boolean>} - True if processed successfully, false if abort.
 */
async function processApplicationFlow(page) {

	console.log("🪽 Application Flow Page Entry.")

	/** ----------------------------------------------------------------------------
	 * 🔹 Initialize Variables 🔹 
	 * ---------------------------------------------------------------------------- */
	// Get Tab State
	const tabState = await getTabState();

	/** ----------------------------------------------------------------------------
	 * 🔹 Initialize Helpers 🔹 
	 * ---------------------------------------------------------------------------- */
	const hasUnsetRequiredQuestions = async (options = {}) => {
        const questions = await getQuestions(options);

        return questions
            .filter(q => q.required)
            .some(q => !isQuestionSet(q));
    };
    const isResumeProcessing = () =>
        !!document.querySelector(
            ".application-form .application-question.resume .resume-upload-success[style]:not([style='']):not([style='display: inline;'])"
        );
    const isHCaptchaVisible = () => {
        const container = document.querySelector('#h-captcha');
        if (!container) return false;

        const iframes = container.querySelectorAll('iframe');
        if (!iframes.length) return false;

        return [...iframes].some(iframe => {
            const style = window.getComputedStyle(iframe);
            const rect = iframe.getBoundingClientRect();

            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0' &&
                rect.width > 0 &&
                rect.height > 0
            );
        });
    };
	const submitButtonExists = () => !!el(SELECTORS.APPLICATION_PAGE.submitButton);
	async function submitAndWait(threshold) {
		// Set Snapshot for main to detect changes.
		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(threshold);

		console.log("🖱️ Click Save & Continue. In 15 sec")
		await sleep(15) // Only to Debug
		await click(el(SELECTORS.APPLICATION_PAGE.submitButton));
		// await sleep(60); // Only to Debug
		await sleep(2); // mandatory to reflect state change before entering waitUntil

        console.log("YOO 111")

		// Dynamic wait until
		await waitUntil(
			OR (
				NOT(submitButtonExists),
				AND (
					submitButtonExists,
					OR (
						hasUnsetRequiredQuestions,
						isHCaptchaVisible
					),
					NOT(isResumeProcessing)
				)
			),
			{timeout: 10}
		);

        console.log("YOO 222")
	}

	/** ----------------------------------------------------------------------------
	 * 🔹 Initialize Page 🔹 
	 * ---------------------------------------------------------------------------- */ 
	const successfullyInitialized = await initializePage(page);
	if (successfullyInitialized === false) {
		console.warn(`⚠️ Failed to initialize ${page} page.`);
		return false; // Terminate automation execution loop
	}

	/** ----------------------------------------------------------------------------
	 * 🔹 Resolve Questions 🔹 
	 * ---------------------------------------------------------------------------- */ 
	/* `resolved` & `unresolved` --> array of question objects */
    const { questions, unresolvedQuestions } = await resolveQuestions(page);

	console.log('======================================================================');
	console.log("ALL UNRESOLVED QUESTIONS:::", unresolvedQuestions);
	
	const threshold = clamp((questions.length * 5)/100, 0.05, 0.50);
	console.log("--- 1")
	await submitAndWait(threshold);
    if (isResumeProcessing()) {
        console.log("⚠️ Resume Still Processing.");
		console.log('👎 Returning FALSE'); // Returning FALSE
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		console.groupEnd();
		return false; // Terminate
    }
	console.log("--- 2")
    if (isHCaptchaVisible()) {
        console.log("⚠️ Unable to resolve captcha.");
		console.log('👎 Returning FALSE'); // Returning FALSE
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		console.groupEnd();
		return false; // Terminate
    }
	console.log("--- 3")
	if (hasUnsetRequiredQuestions()) { // Fallback 1
		console.log("⚠️ Errors Detected. Performing one last resolution over errors")
		await resolveQuestions(page, {errorOnly: true, maxIterations: 3, maxAttemptsPerQuestion: 3});
		await submitAndWait(threshold);
	}
	console.log("--- 4")
    if (isHCaptchaVisible()) {
        console.log("⚠️ Unable to resolve captcha.");
		console.log('👎 Returning FALSE'); // Returning FALSE
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		console.groupEnd();
		return false; // Terminate
    }
	console.log("--- 5")
	if (hasUnsetRequiredQuestions()) { // Fallback 2
		console.log("⚠️ Errors Detected. Performing one last resolution over errors")
		await resolveQuestions(page, {errorOnly: true, maxIterations: 3, maxAttemptsPerQuestion: 3});
		await submitAndWait(threshold);
	}

    if (isHCaptchaVisible()) {
        console.log("⚠️ Unable to resolve captcha.");
		console.log('👎 Returning FALSE'); // Returning FALSE
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		console.groupEnd();
		return false; // Terminate
    }
	if (hasUnsetRequiredQuestions()) {
		console.log('👎 Returning FALSE'); // Returning FALSE
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		console.groupEnd();
		return false; // Terminate
	}

	console.log('👍 Returning TRUE');		
	return true;
}




// ============================================================================
// 🚀 STEP 3: Main Automation Entry Point
// ============================================================================

/**
 * Entry point for Lever automation.
 * @param {Object} payload - Config data from popup/background.
 * @param {string} [payload.mode] - e.g., "manual", "lastApplication". // disabled
 */
export async function startExecution(payload = {}) {

	console.log('[Lever] Starting automation with payload:', payload);

	createExecutionController();

	try {

		throwIfAborted();

		await initExecutionPayload()
		throwIfAborted();

		// Wait for DOM to stabilize before acting
		const stable = await waitForStableDOMSmart({
			timeout: 10,
			checkInterval: 0.6,
			requiredStableChecks: 3,
			padding: 0.2,
		});
		if (!stable) {
			console.warn('[Lever] DOM did not stabilize — aborting.');
			return;
		}
		throwIfAborted();

		// 🔁 Main loop: iterate through page states dynamically
		automationLoop:
		while (getExecutionSignal() && !getExecutionSignal().aborted) {

			const page = await getPage();

			// Determine current page and act accordingly
			switch (page) {

				case LEVER_PAGES.APPLICATION_PAGE:
					if (!(await processApplicationFlow(page))) break automationLoop;
					break;

				case LEVER_PAGES.CONFIRMATION_PAGE:
					console.log('[Lever] 🥳 Application Submitted — exiting loop.');
					notifyTabState({state: 'submitted', executionResult: 'applied', running: false }, { updateUI: false });
					break automationLoop;

				case LEVER_PAGES.JOB_SEARCH_PAGE:
					console.log('[Lever] 🔎 Job Search Page — exiting loop.');
					notifyTabState({state: 'jobSearchPage', executionResult: 'unsupported_platform', running: false }, { updateUI: false });
					break automationLoop;

				case LEVER_PAGES.PAGE_NOT_EXISTS:
					console.log('[Lever] 🔎 Page does not exists — exiting loop.');
					notifyTabState({state: 'pageNotExists', executionResult: 'job_expired', running: false }, { updateUI: false });
					break automationLoop;
				
                case LEVER_PAGES.CLOUDFLARE_ERROR_PAGE:
					console.log('[Lever] ⚠️ Cloudflare Error — reloading to resolve.');
                    window.history.back();
                    window.location.reload();
                    await sleep(9); // currently loaded 'content' module instance will reset
                    // If reload doesn't redirect.
					notifyTabState({ state: 'failed', executionResult: 'failed', running: false }, { updateUI: false });
					break automationLoop;
                
				default: 
					console.log('[Lever] ❓ Unrecognizable page — exiting loop.');
					notifyTabState({executionResult: 'unsupported_platform', running: false }, { updateUI: false });
					break automationLoop;
			}

			throwIfAborted();
			// Wait for next page to stabilize
			if (!(await waitForStableDOMSmart({
				timeout: 20,
				checkInterval: 0.6,
				requiredStableChecks: 3,
				padding: 0,
			}))) {
				console.warn('[Lever] DOM failed to stabilize — exiting loop.');
				break;
			}
			throwIfAborted();

			// Wait for DOM change after action
			if (!(await domChangeChecker.waitForDomChange({ timeout: 8 }))) {
				console.log('[Lever] DOM unchanged after action — exiting loop.');
				break;
			}
			domChangeChecker.setThreshold(0.36);
			throwIfAborted();

		}

		console.log('[Lever] ✅ Automation completed successfully.');
	} catch (err) {
		if (err.name === 'AbortError') {
			console.log('[Lever] 🚫 Execution aborted by user.');
			notifyTabState({ running: false, state: 'aborted', executionResult: 'aborted' }, { updateUI: false });
		} else {
			console.error('[Lever] Fatal automation error:', err);
		}
	} finally {
		clearExecutionController();
	}
}


// ============================================================================
// ⏹️ STEP 4: Cancellation Support
// ============================================================================

/**
 * Stops an active Lever automation session gracefully.
 */
export function stopExecution() {
  abortExecution();
  console.log('[Lever] 🛑 Abort signal dispatched.');
}
