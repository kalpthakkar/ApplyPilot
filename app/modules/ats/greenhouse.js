// app/modules/greenhouse.js
// ============================================================================
// 🧩 Greenhouse Automation Module
// ============================================================================
// 📘 Purpose:
// Handles the complete Greenhouse job application automation flow.
//
// ⚙️ Invoked By:
//   Higher-level ATS automation controller (e.g. content.js)
//
// ============================================================================
// 📁 Dependencies
// ============================================================================

import { createExecutionController, clearExecutionController, getExecutionSignal, abortExecution, throwIfAborted, waitUntil, retryUntilTrue, sleep, clamp, waitForStableDOMSmart, DomChangeCheckerSmart, notifyTabState, getTabState } from '@shared/utils/utility.js';
import { click } from '@form/formHandlers.js';
import { SELECTORS, GREENHOUSE_PAGES } from '@ats/config/greenhouseConfig.js';
import { initExecutionPayload, getPage, initializePage, resolveQuestions, isQuestionSet, fetchGreenhouseVerificationPasscode, resolveSecurityCodeQuestion } from '@ats/utils/greenhouseUtils.js';

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
	// Get current progress index:
	const formHasErrors = () => {
		const errorEls = els(`[class="field-error-msg"]`);

		if (
			errorEls.length === 1
			&& (Boolean(errorEls[0]?.closest('div.field')?.querySelector(`[id="job_application_location"]`)?.value))
		) {
			// Not error is 'value' is already set.
			return false;
		}

		return errorEls.length > 0;

	};
	const securityQuestionExists = () =>
		!!el(SELECTORS[GREENHOUSE_PAGES.APPLICATION_PAGE].securityCodeEnabledInput) ||
		(() => {
			const input = el(
				SELECTORS[GREENHOUSE_PAGES.APPLICATION_PAGE].securityCodeInput
			);
			if (!input) return false;

			const style = window.getComputedStyle(input);
			return !(
				style.display === 'none' ||
				style.visibility === 'hidden' ||
				input.classList.contains('hidden') ||
				input.type === 'hidden' ||
				input.disabled
			);
	})();
	const submitButtonExists = () => !!el(SELECTORS.APPLICATION_PAGE.submitButton);
	const isSubmitProcessing = () => {
		const submitButtonValue = el(SELECTORS.APPLICATION_PAGE.submitButton).value;
		if (!submitButtonValue.includes('Submit') || submitButtonValue.includes('Processing')) {
			return true;
		}
		return false;
	}
	async function submitAndWait(threshold) {
		// Set Snapshot for main to detect changes.
		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(threshold);

		console.log("🖱️ Click Save & Continue.")
		// await sleep(15) // Only to Debug
		await click(el(SELECTORS.APPLICATION_PAGE.submitButton));
		// await sleep(60); // Only to Debug
		await sleep(2); // mandatory to reflect state change before entering waitUntil

		// Dynamic wait until
		await waitUntil(
			OR (
				NOT(submitButtonExists),
				AND (
					submitButtonExists,
					OR (
						formHasErrors,
						securityQuestionExists
					),
					NOT(isSubmitProcessing)
				)
			),
			{timeout: 10}
		)
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
	await submitAndWait(threshold);
	if (formHasErrors()) { // Fallback 1
		console.log("⚠️ Errors Detected. Performing one last resolution over errors")
		await resolveQuestions(page, {errorOnly: true, maxIterations: 3, maxAttemptsPerQuestion: 3});
		await submitAndWait(threshold);
	}
	if (formHasErrors()) { // Fallback 2
		console.log("⚠️ Errors Detected. Performing one last resolution over errors")
		await resolveQuestions(page, {errorOnly: true, maxIterations: 3, maxAttemptsPerQuestion: 3});
		await submitAndWait(threshold);
	}


	// Requires - Security Code Verification
	if (securityQuestionExists()) { // Resolve Security Code
		const passCode = await fetchGreenhouseVerificationPasscode();
		if (passCode) {
			async function bypassSecurityQuestion() {
				const success = await resolveSecurityCodeQuestion(passCode)
				if (success) {
					await submitAndWait(threshold);
					if (!securityQuestionExists()) {
						return true;
					}
				}
				return false;
			}
			const success = await retryUntilTrue(
				bypassSecurityQuestion,
				1,      // max retries
				1000    // 1s delay between retries
			);
			if (success) {
				console.log('[Greenhouse] Security Verification complete.');
				console.groupEnd();
				return true;
			}
		}
		console.log('👎 Returning FALSE'); // Returning FALSE
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		console.groupEnd();
		return false;
	}

	if (formHasErrors()) {
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
 * Entry point for Greenhouse automation.
 * @param {Object} payload - Config data from popup/background.
 * @param {string} [payload.mode] - e.g., "manual", "lastApplication". // disabled
 */
export async function startExecution(payload = {}) {

	console.log('[Greenhouse] Starting automation with payload:', payload);

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
			console.warn('[Greenhouse] DOM did not stabilize — aborting.');
			return;
		}
		throwIfAborted();

		// 🔁 Main loop: iterate through page states dynamically
		automationLoop:
		while (getExecutionSignal() && !getExecutionSignal().aborted) {

			const page = await getPage();

			// Determine current page and act accordingly
			switch (page) {

				case GREENHOUSE_PAGES.APPLICATION_PAGE:
					if (!(await processApplicationFlow(page))) break automationLoop;
					break;

				case GREENHOUSE_PAGES.CONFIRMATION_PAGE:
					console.log('[Greenhouse] 🥳 Application Submitted — exiting loop.');
					notifyTabState({state: 'submitted', executionResult: 'applied', running: false }, { updateUI: false });
					break automationLoop;

				case GREENHOUSE_PAGES.JOB_SEARCH_PAGE:
					console.log('[Greenhouse] 🔎 Job Search Page — exiting loop.');
					notifyTabState({state: 'jobSearchPage', executionResult: 'unsupported_platform', running: false }, { updateUI: false });
					break automationLoop;

				case GREENHOUSE_PAGES.PAGE_NOT_EXISTS:
					console.log('[Greenhouse] 🔎 Page does not exists — exiting loop.');
					notifyTabState({state: 'pageNotExists', executionResult: 'job_expired', running: false }, { updateUI: false });
					break automationLoop;
					
				default: 
					console.log('[Greenhouse] ❓ Unrecognizable page — exiting loop.');
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
				console.warn('[Greenhouse] DOM failed to stabilize — exiting loop.');
				break;
			}
			throwIfAborted();

			// Wait for DOM change after action
			if (!(await domChangeChecker.waitForDomChange({ timeout: 8 }))) {
				console.log('[Greenhouse] DOM unchanged after action — exiting loop.');
				break;
			}
			domChangeChecker.setThreshold(0.36);
			throwIfAborted();

		}

		console.log('[Greenhouse] ✅ Automation completed successfully.');
	} catch (err) {
		if (err.name === 'AbortError') {
			console.log('[Greenhouse] 🚫 Execution aborted by user.');
			notifyTabState({ running: false, state: 'aborted', executionResult: 'aborted' }, { updateUI: false });
		} else {
			console.error('[Greenhouse] Fatal automation error:', err);
		}
	} finally {
		clearExecutionController();
	}
}


// ============================================================================
// ⏹️ STEP 4: Cancellation Support
// ============================================================================

/**
 * Stops an active Greenhouse automation session gracefully.
 */
export function stopExecution() {
  abortExecution();
  console.log('[Greenhouse] 🛑 Abort signal dispatched.');
}
