// app/modules/ats/workday.js
// ============================================================================
// 🧩 Workday Automation Module
// ============================================================================
// 📘 Purpose:
// Handles the complete Workday job application automation flow.
// Supports page transitions between description → auth → verification → completion.
//
// 🔹 Main responsibilities:
//   • Manage "Apply" and "Apply Manually" actions on job description pages.
//   • Handle authentication (Sign In / Create Account).
//   • Detect & resolve verification emails.
//   • React to DOM stability and page changes dynamically.
//
// ⚙️ Invoked By:
//   Higher-level ATS automation controller (e.g. content.js)
//
// ============================================================================
// 📁 Dependencies
// ============================================================================

import { createExecutionController, clearExecutionController, getExecutionSignal, abortExecution, throwIfAborted, waitUntilSmart, sleep, clamp, waitForElementSmart, waitForStableDOMSmart, DomChangeCheckerSmart, notifyTabState, getTabState } from '@shared/utils/utility.js';
import { click } from '@form/formHandlers.js';
import { SELECTORS, WORKDAY_PAGES, PASSWORD_TYPE, setPasswordType } from '@ats/config/workdayConfig.js';
import { getPage, initializePage, resolveQuestions, isQuestionSet, initExecutionPayload } from '@ats/utils/workdayUtils.js';


// Create shared DOM change tracker instance
const domChangeChecker = DomChangeCheckerSmart();

const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)


/** type Condition = () => boolean | Promise<boolean>; */
const isMainContentExists = () => 
	!!document.querySelector('#mainContent')
const isMainContentEmpty = () => 
	document.querySelector('#mainContent')?.innerText === '';

const AND = (...conditions) => async () =>
  (await Promise.all(conditions.map(c => c()))).every(Boolean);
const OR = (...conditions) => async () =>
  (await Promise.all(conditions.map(c => c()))).some(Boolean);
const NOT = (condition) => async () =>
  !(await condition());


// ==========================================================================================================
// 💡 STEP 1: Page Handlers
// ==========================================================================================================


// ───────────────────────────────────────────────────────────────────────────────────────
// 🕹️ STEP 1.1 (CANDIDATE HOME PAGE) | Candidate Home Page Handler
// ───────────────────────────────────────────────────────────────────────────────────────
/**
 * 🕹️ STEP 1.1 (CANDIDATE HOME PAGE) (CORE) | Candidate Home Page Handler
 * 
 * Check for incomplete applications and resolve if exists.
 * @returns {Promise<boolean>} - True if action was taken; false otherwise.
 */
async function processCandidateHomePage() {

	const page = WORKDAY_PAGES.CANDIDATE_HOME_PAGE

	/** ------------------------------------------------------------------------ 
	 * SignIn is required. 🔹 Not Implemented On This Page
	 * ------------------------------------------------------------------------ */ 
	if (el(SELECTORS[page].signInNavButton)) {
		console.warn("⚠️ SignIn not implemented for Candidate Home Page.");
		await click(el(SELECTORS[page].signInNavButton)); // Click signIn button.
		return false;
	}

	/** ------------------------------------------------------------------------ 
	 * Application submitted 🔹 On Form Submit
	 * ------------------------------------------------------------------------ */ 
	if (
		el(SELECTORS[page].candidateHomeTaskModal)
		&& (
			el(SELECTORS[page].candidateHomeTaskModal).textContent.includes('Application Submitted')
			|| el(SELECTORS[page].candidateHomeTaskModal).textContent.includes('Congratulations')
			|| el(SELECTORS[page].candidateHomeTaskModal).textContent.includes('submitted successfully')
		)
	) {
		// Notify background that automation finished
		console.log('[Workday] 🥳 Application Submitted — exiting loop.');
		notifyTabState(
			{
				state: 'submitted',
				executionResult: 'applied',
				running: false
			},
			{ updateUI: false } // triggers popup UI update
		);
		return false; // Terminate (can no longer progress)
	}

	/** ------------------------------------------------------------------------ 
	 * Initialize Page 🔹 Later, Search & Resolve For Pending Applications
	 * ------------------------------------------------------------------------ */ 
	const successfullyInitialized = await initializePage(page);	
	
	function openIncompleteJobsIfExists() {

		// Get first incomplete application index. (-1 if not found)
		const incompleteApplicationIndex = [...document.querySelectorAll(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].perApplicationStatus)]
			.findIndex(span => span.textContent?.trim() === 'Not Submitted');
		if (incompleteApplicationIndex === -1) {
			return false; // No incomplete application to resolve in current page.
		}

		// Get Incomplete Job URL
		const incompleteJobURL = els(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].perApplicationURL)[incompleteApplicationIndex]?.href;
		if (!incompleteJobURL) {
			return false; // Job URL of incomplete doesn't exists (failed to scrape).
		}

		// Remove trailing slash if exists
		const cleanUrl = incompleteJobURL.replace(/\/+$/, '');
		// Append '/apply'
		const applyUrl = cleanUrl + '/apply';

		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(0.69);
		// Redirect current page
		window.location.href = applyUrl;
		return true;
	}
	
	const wasIncompleteJobOpened = openIncompleteJobsIfExists()

	if (successfullyInitialized === false && wasIncompleteJobOpened === false)  {
		// 🩹 Patch: Some applications after login lands here -> click back to go to actual form application page.
		// Go back to check potential good page exists.
		window.history.back(); 
		return true; // retry
	}

	if (wasIncompleteJobOpened === true) {
		await sleep(10) // Wait for page to reload
	}
	
	notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
	return false; // Terminate (failed)
}

async function processJobSearchPage() {

	const page = WORKDAY_PAGES.JOB_SEARCH_PAGE;

	/** ------------------------------------------------------------------------ 
	 * Application submitted 🔹 On Form Submit
	 * ------------------------------------------------------------------------ */ 
	if (
		el(SELECTORS[page].signInPopupDialog)?.textContent.includes('Congratulations!')
	) {
		// Notify background that automation finished
		console.log('[Workday] 🥳 Application Submitted — exiting loop.');
		notifyTabState(
			{
				state: 'submitted',
				executionResult: 'applied',
				running: false
			},
			{ updateUI: false } // triggers popup UI update
		);
		return false; // Terminate (can no longer progress)
	}
	
	// 🩹 Patch: Some applications after login lands here -> click back to go to actual form application page.
	console.log("CLicked backkk...........................")
	window.history.back();
	await sleep(1)
	console.log("CLicked backkk...........................")
	window.history.back();
	await sleep(1)
	console.log("CLicked backkk...........................")
	window.history.back();
	return true; // retry

	// return false; // Terminate (nothing to do here)

}

// ───────────────────────────────────────────────────────────────────────────────────────
// 📃 STEP 1.2 (DESCRIPTION PAGE) | Description Page Handler
// ───────────────────────────────────────────────────────────────────────────────────────
/**
 * 📃 STEP 1.2 (DESCRIPTION PAGE) (CORE) | Description Page Handler
 * 
 * Handles "Apply" and "Apply Manually" buttons on job description page.
 * @returns {Promise<boolean>} - True if action was taken; false otherwise.
 */
async function processDescriptionPage() {

	if (el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].applyButton)) {
		notifyTabState({jobLocation: document.querySelector(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].locationText).innerText}, { updateUI: false });
		console.log('[Workday] Clicking Apply button...');
		await click(el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].applyButton));
	}
	else if (el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].continueApplicationButton)) {
		notifyTabState({jobLocation: document.querySelector(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].locationText).innerText}, { updateUI: false });
		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(0.20);
		await click(el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].continueApplicationButton));
		return true;
	}
	else if (el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].viewApplicationButton)) {
		const tabState = await getTabState();
		console.log('[Workday] 🥳 Application Already Submitted — exiting loop.');
		notifyTabState({state: 'alreadySubmitted', executionResult: 'applied', running: false }, { updateUI: false });
		return false; // Terminate automation.
	}

	try {
		if (await waitForElementSmart(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].applyManuallyButton, { timeout: 10 })) {
			domChangeChecker.setSnapshot();
			domChangeChecker.setThreshold(0.25);
			if (await click(el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].applyManuallyButton))) {
				console.log('[Workday] Clicked "Apply Manually" button.');
				return true;
			}
		}
		console.warn('[Workday] "Apply Manually" element not found after waiting.');
		return false;
	} catch {
		console.info('[Workday] No "Apply Manually" step required.');
		return false;
	}
}


// ───────────────────────────────────────────────────────────────────────────────────────
// 🔐 STEP 1.3 (AUTH PAGE) | Authentication Page Handler
// ───────────────────────────────────────────────────────────────────────────────────────

/**
 *  🔄 STEP 1.3 (AUTH PAGE) (HELPER) (A) | Helper: Sign-in Retry Logic
 * Attempts sign-in using primary → secondary password fallback.
 * @returns {Promise<boolean>} - True if login succeeds, false otherwise.
 */
async function trySignInFlow() {
	console.group('[Workday] trySignInFlow');

	const signInBtn = el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton);

	if (!el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].email) || !el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].password) || !el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton)) {
		console.error('[Workday] Missing sign-in elements.');
		console.groupEnd();
		return false;
	}

	// Helper: perform login with given password
	const tryLogin = async () => {
		await resolveQuestions(WORKDAY_PAGES.AUTH_PAGE);
		domChangeChecker.setSnapshot();
		await click(signInBtn?.previousElementSibling);
		await sleep(2);
	};

	setPasswordType(PASSWORD_TYPE.PRIMARY);
	console.log(`[Workday] Attempting sign-in (primary)...`);
	await tryLogin();

	if (/wrong email|account might be locked/.test(document.body.innerText.toLowerCase())) {
		console.warn('[Workday] Primary password failed — trying secondary.');
		console.log(`[Workday] Attempting sign-in (secondary)...`);
		setPasswordType(PASSWORD_TYPE.SECONDARY);
		await tryLogin();

		if (/wrong email|account might be locked/.test(document.body.innerText.toLowerCase())) {
			console.error('[Workday] Secondary password also failed — stopping automation.');
			notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
			console.groupEnd();
			return false;
		}
	}

	console.log('[Workday] Sign-in attempt complete.');
	console.groupEnd();
	return true;
}

/**
 *  📧 STEP 1.3 (AUTH PAGE) (HELPER) (B) | Helper: Gmail Polling & Verification Resolution
 * 
 * Polls Gmail API for verification link and opens it to complete verification.
 * @returns {Promise<boolean>} - True if verification succeeded, else false.
 */
async function handleVerificationEmailFlow() {
	console.group('[Workday] handleVerificationEmailFlow');

	let attempt = 0;
	const maxAttempts = 3;
	let waitTime = 4;
	let foundUrl = null;

	while (attempt < maxAttempts) {
		attempt++;
		console.log(`[Workday] Checking Gmail (Attempt ${attempt}/${maxAttempts})...`);

		const response = await chrome.runtime.sendMessage({
			action: 'fetchRecentVerificationURL',
			query: '(from:workday.com OR from:myworkday.com OR from:myworkday) AND is:unread',
			topKSearch: 2,
			maxAgeMinutes: 20,
		});

		if (response?.success && response.url) {
			foundUrl = response.url;
			console.log(`[Workday] ✅ Verification link found: ${foundUrl}`);
			break;
		}

		console.log(`[Workday] No email found yet — retrying in ${waitTime}s...`);
		await sleep(waitTime);
		waitTime = Math.min(waitTime * 1.6, 20);
	}

	if (foundUrl) {
		console.log('[Workday] Opening verification link...');
		notifyTabState({ state: 'verifyingAccount', running: true }, { updateUI: false });

		const verifyResponse = await chrome.runtime.sendMessage({
			action: 'resolveVerificationURL',
			url: foundUrl,
		});

		if (verifyResponse?.success) {
			console.log(`[Workday] Verification resolved via ${verifyResponse.via}`);
			notifyTabState({ state: 'verified' }, { updateUI: false });
			console.groupEnd();
			return true;
		} else {
			console.warn('[Workday] Verification resolution failed:', verifyResponse?.error);
			notifyTabState({ state: 'verificationFailed' }, { updateUI: false });
			console.groupEnd();
			return false;
		}
	}

	console.warn('[Workday] Verification email not found after all attempts.');
	console.groupEnd();
	return false;
}

/**
 *  🔐 STEP 1.3 (AUTH PAGE) (CORE) | Authentication Page Handler
 * 
 * Handles Workday authentication: Create Account / Sign In / Verification.
 * Uses dynamic detection and retry mechanisms.
 * @returns {Promise<boolean>} - True if processed successfully, false if abort.
 */
async function processAuthPage() {
	console.group('[Workday] processAuthPage');

	const createAccountSubmitButtonExists = () => els(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].createAccountSubmitButton).length > 0;
	const signInWithEmailButtonExists = () => els(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInWithEmailButton).length > 0;
	const signInSubmitButtonExists = () => els(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton).length > 0;

	const waitResponse = await waitUntilSmart(
		OR(
			createAccountSubmitButtonExists,
			signInWithEmailButtonExists,
			signInSubmitButtonExists
		),
		{timeout: 15}
	)

	if (waitResponse === false) {
		console.log('🐛 Auth Progress button not discovered until timeout.');
		notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
		return false; // Terminate the automation loop
	}
	
	const requiresVerification = () =>
		/(verify your account|check your email|verification email|email has been sent)/i.test(document.body.innerText.toLowerCase());
	const signInBtnExists = () => 
		!!el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton);

	// -------------------------------------------------------
	// 🧾 CASE 1: CREATE ACCOUNT PAGE
	// -------------------------------------------------------
	if (el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].createAccountSubmitButton)) {
		console.log('[Workday] Detected Create Account page.');
		setPasswordType(PASSWORD_TYPE.PRIMARY);
		await resolveQuestions(WORKDAY_PAGES.AUTH_PAGE);
		notifyTabState({ state: 'signupAttempted', signupAttempted: true }, { updateUI: false });
		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(0.20);
		const createAccountBtnSibl = el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].createAccountSubmitButton)?.previousElementSibling
		console.log("CLICKING CREATE ACCOUNT 1st time...", createAccountBtnSibl);
		await click(createAccountBtnSibl);

		// Password policy issue → try secondary password
		if (((el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].inputAlert)?.innerText ?? '').includes('minimum') && (el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].inputAlert)?.innerText ?? '').includes('character'))) {
			setPasswordType(PASSWORD_TYPE.SECONDARY);
			console.log("CLICKING CREATE ACCOUNT 2nd time...");
			await resolveQuestions(WORKDAY_PAGES.AUTH_PAGE);
			domChangeChecker.setSnapshot();
			domChangeChecker.setThreshold(0.23);
			await click(el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].createAccountSubmitButton));
		}

		console.groupEnd();
		return true;
	}

	// -------------------------------------------------------
	// 🔑 CASE 2: SIGN-IN PAGE
	// -------------------------------------------------------
	if (el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInWithEmailButton)) {
		await click(el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInWithEmailButton));
		if (await waitForElementSmart(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton, { timeout: 6 })) {
			await sleep(2);
			// Continue to signIn step.
		}
		else {
			console.error(`⏳ Reached maximum time waiting for signIn button to appear.`);
			notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
			console.groupEnd();
			return false; // Terminate
		}
	}
	if (el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton)) {
		console.log('[Workday] Detected Sign-In page.');

		const tabState = await getTabState();
		// No signup attempt yet → redirect to Create Account
		if (!(tabState?.signupAttempted)) {
			const createAccountLinkEl = el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].createAccountLink);
			if (createAccountLinkEl) {
				console.log('[Workday] Switching to Create Account (no signup attempt recorded)...');
				domChangeChecker.setSnapshot();
				domChangeChecker.setThreshold(0.14);
				await click(createAccountLinkEl);
				console.groupEnd();
				return true;
			}
			console.log('🐛 SignUp not attemmpted and also createAccountLink not found.');
		}

		// Verification prompt detected → handle email flow
		if (requiresVerification()) {
			console.log('[Workday] Verification prompt detected — fetching verification link...');
			const verified = await handleVerificationEmailFlow();
			if (verified) {
				console.log('[Workday] Verification complete. Retrying login...');
				await trySignInFlow();
			}
			else {
				console.warn('[Workday] Verification failed or timed out.');
				notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
				console.groupEnd();
				return false;
			}
			await sleep(2);
			if (signInBtnExists()) {
				await trySignInFlow();
			}
			console.groupEnd();
			return true;
		}

		// Normal sign-in attempt
		await trySignInFlow();

		await waitUntilSmart(
			OR(
				NOT(signInBtnExists),
				requiresVerification,
			),
			{timeout: 10}
		)

		// Handle verification prompt post-login
		if (requiresVerification()) {
			console.log('[Workday] Verification prompt detected after login.');
			const verified = await handleVerificationEmailFlow();
			if (verified) {
				console.log('[Workday] Verification complete. Retrying login...');
				await trySignInFlow();
			}
			else {
				console.warn('[Workday] Verification failed or timed out.');
				notifyTabState({ state: 'failed', executionResult: 'failed' }, { updateUI: false });
				console.groupEnd();
				return false;
			}
			await sleep(2);
			if (signInBtnExists()) {
				await trySignInFlow();
			}
			console.groupEnd();
			return true;
		}

		console.groupEnd();
		return true;
	}

	console.warn('[Workday] No recognizable auth form detected.');
	console.groupEnd();
	return false;
}

// ───────────────────────────────────────────────────────────────────────────────────────
// 🧩 STEP 1.4 (APPLICATION FLOW PAGES) (INFO | EXP | QUESTIONNAIRE | VOLUNTARY_DISCLOSURE | SELF_IDENTIFICATION | REVIEW ) | Application Flow Handler
// ───────────────────────────────────────────────────────────────────────────────────────

/**
 * 🧩 STEP 1.4 (APPLICATION FLOW PAGES) (CORE) | Apply Flow Handler
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

	if ([WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE, WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE, WORKDAY_PAGES.REVIEW_PAGE].includes(page)) {
		notifyTabState({ questionariesCompleted: true }, { updateUI: false });
	}

	/** ----------------------------------------------------------------------------
	 * 🔹 Initialize Helpers 🔹 
	 * ---------------------------------------------------------------------------- */
	// Get current progress index:
	const progressFlowIdx = () => els('[data-automation-id="progressBar"] li')
		.findIndex(li => li.getAttribute('data-automation-id') === 'progressBarActiveStep');
	const progressBarExists = () => els(`[data-automation-id="progressBar"] li`).length > 0;
	const currentStepIsActive = (currentProgressFlowIdx) => els('[data-automation-id="progressBar"] li')[currentProgressFlowIdx]?.getAttribute('data-automation-id') === 'progressBarActiveStep';
	const formHasErrors = () => els(`[data-automation-id="inputAlert"]`).length > 0;
	async function submitAndWait(threshold) {

		// Set Snapshot for main to detect changes.
		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(threshold);
		// Record current progress index before click to enable dynamic wait.
		const currentProgressFlowIdx = progressFlowIdx();

		console.log("🖱️ Click Save & Continue.")
		await click(el(SELECTORS[page].applyFlowProgressButton));
		await sleep(1);

		// Dynamic wait until advanced to next progress section
		await waitUntilSmart(
			OR(
				formHasErrors,
				NOT(progressBarExists),
				NOT(() => currentStepIsActive(currentProgressFlowIdx))
			),
			{timeout: 10}
		)
	}

	/** ----------------------------------------------------------------------------
	 * Lookout for errors 🔹 Resolve if exists
	 * ---------------------------------------------------------------------------- */ 
	if (
		el(SELECTORS[page].applyFlowPage)?.textContent.includes("Something went wrong")
		|| el(SELECTORS[page].applyFlowPage).querySelector(`[id="Fail"]`)
	) {

		if ([WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE, WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE, WORKDAY_PAGES.REVIEW_PAGE].includes(page)) {
			notifyTabState({ state: 'postQuestionaryPageError', questionariesCompleted: true }, { updateUI: false });
			console.log("RELOAD IN 2 secs...")
			await sleep(2)
		}
		window.location.reload();
		domChangeChecker.setSnapshot();
		domChangeChecker.setThreshold(0.50);
		return true;
	}

	/** ----------------------------------------------------------------------------
	 * Skip Processed Pages 🔹 On error
	 * ---------------------------------------------------------------------------- */ 
	if (
		(tabState?.state === 'postQuestionaryPageError' || tabState?.questionariesCompleted === true)
		&& [WORKDAY_PAGES.INFO_PAGE, WORKDAY_PAGES.EXP_PAGE, WORKDAY_PAGES.QUESTIONNAIRE_PAGE].includes(page)
	) {
		// Go next unitl voluntary/self-identification page is reached.
		console.log('SKIPING THIS PAGE... Click submit')
		await submitAndWait(0.05);
		return true;
	}

	/** ----------------------------------------------------------------------------
	 * 🔹 Initialize Page 🔹 
	 * ---------------------------------------------------------------------------- */ 
	const successfullyInitialized = await initializePage(page);
	if (successfullyInitialized === false) {
		console.warn(`Failed to initialize ${page} page.`);
		return false;
	}

	/** ----------------------------------------------------------------------------
	 * 🔹 Resolve Questions 🔹 
	 * ---------------------------------------------------------------------------- */ 

	/* `resolved` & `unresolved` --> array of question objects */
    let { questions, unresolvedQuestions } = await resolveQuestions(page);

	console.log('======================================================================');
	
	const threshold = clamp((questions.length * 4.5)/100, 0.05, 0.45);
	await submitAndWait(threshold);
	if (formHasErrors()) {
		console.log("⚠️ Errors Detected. Performing one last resolution over errors")
		await sleep(2);
		({ questions, unresolvedQuestions } = await resolveQuestions(page, {errorOnly: true, maxIterations: 3, maxAttemptsPerQuestion: 3}));
		await submitAndWait(threshold);
	}
	if (formHasErrors()) {
		console.log("⚠️ Errors Detected. Performing one last resolution over errors");
		// await removeErrorContainers();		// --- Depriciated ---
		await sleep(2);
		({ questions, unresolvedQuestions } = await resolveQuestions(page, {errorOnly: true, maxIterations: 2, maxAttemptsPerQuestion: 2}));
		await submitAndWait(threshold);
	}

	if (formHasErrors()) {		
		console.log('👎 Returning FALSE'); // Returning FALSE
		return false; // Terminate
	} 

	console.log('👍 Returning TRUE');		
	return true;
}



// ============================================================================
// 🚀 STEP 3: Main Automation Entry Point
// ============================================================================

/**
 * Entry point for Workday automation.
 * @param {Object} payload - Config data from popup/background.
 * @param {string} [payload.mode] - e.g., "manual", "lastApplication". // disabled
 */
export async function startExecution(payload = {}) {
	console.log('[Workday] Starting automation with payload:', payload);

	createExecutionController();

	try {

		throwIfAborted();

		await initExecutionPayload()
		throwIfAborted();

		// Wait for DOM to stabilize before acting
		const stable = await waitForStableDOMSmart({
			timeout: 10,
			checkInterval: 0.5,
			requiredStableChecks: 3,
			padding: 0.2,
		});
		if (!stable) {
			console.warn('[Workday] DOM did not stabilize — aborting.');
			return;
		}
		throwIfAborted();

		// Wait until main container is populated.
		console.log("🌟 ATS LOOP STARTED")
		console.log("Waiting for DOM To Populate")
		await waitUntilSmart(
			OR (
				NOT(isMainContentExists),
				AND (
					isMainContentExists,
					NOT(isMainContentEmpty)
				)
			),
			{ timeout: 10 }
		);
		throwIfAborted();

		// 🔁 Main loop: iterate through page states dynamically
		automationLoop:
		while (getExecutionSignal() && !getExecutionSignal().aborted) {

			console.log("GETTING PAGE...")
			const page = await getPage();
			console.log("PAGE:::", page);

			// Determine current page and act accordingly
			switch (page) {
				case WORKDAY_PAGES.CANDIDATE_HOME_PAGE:
					if (!(await processCandidateHomePage())) break automationLoop;
					break;

				case WORKDAY_PAGES.JOB_SEARCH_PAGE:
					if (!(await processJobSearchPage())) break automationLoop;
					break;

				case WORKDAY_PAGES.DESCRIPTION_PAGE: 
					if (!(await processDescriptionPage())) break automationLoop;
					break;
				
				case WORKDAY_PAGES.AUTH_PAGE: 
					if (!(await processAuthPage())) break automationLoop;
					break;
				
				case WORKDAY_PAGES.INFO_PAGE: 
				case WORKDAY_PAGES.EXP_PAGE:
				case WORKDAY_PAGES.QUESTIONNAIRE_PAGE:
				case WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE:
				case WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE:
				case WORKDAY_PAGES.REVIEW_PAGE:
					if (!(await processApplicationFlow(page))) break automationLoop;
					break;

				case WORKDAY_PAGES.ALREADY_APPLIED_PAGE:
					console.log('[Workday] 🥳 Application Already Submitted — exiting loop.');
					notifyTabState({state: 'alreadySubmitted', executionResult: 'applied', running: false }, { updateUI: false });
					break automationLoop;

				case WORKDAY_PAGES.PAGE_NOT_EXISTS:
					console.log('[Workday] 🔎 Page does not exists — exiting loop.');
					notifyTabState({state: 'pageNotExists', executionResult: 'job_expired', running: false }, { updateUI: false });
					break automationLoop;

				default: 
					console.log('[Workday] ❓ Unrecognizable page — exiting loop.');
					notifyTabState({state: 'unsupported', running: false, executionResult: 'unsupported_platform'}, {updateUI: false});
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
				const hasPageError = [...document.querySelectorAll('[data-automation-id="errorHeading"] [aria-describedby^="hint"]')]
					.some(el => el.textContent.includes('Page Error'));
				if (hasPageError) {
					console.warn('[Workday] DOM failed to stabilize.');
					window.location.reload(true);
					await sleep(9); // currently loaded workday module instance will reset
					continue;
				}
				console.warn('[Workday] DOM failed to stabilize — exiting loop.');
				notifyTabState({state: 'unstable', running: false, executionResult: 'failed'}, {updateUI: false});
				break;
			}
			throwIfAborted();

			// Wait for DOM change after action
			if (!(await domChangeChecker.waitForDomChange({ timeout: 10 }))) {
				const hasPageError = [...document.querySelectorAll('[data-automation-id="errorHeading"] [aria-describedby^="hint"]')]
					.some(el => el.textContent.includes('Page Error'));
				if (hasPageError) {
					console.log('[Workday] DOM unchanged after action.');
					window.location.reload(true);
					await sleep(9); // currently loaded workday module instance will reset
					continue;
				}
				console.log('[Workday] DOM unchanged after action — exiting loop.');
				notifyTabState({state: 'unchanged', running: false, executionResult: 'failed'}, {updateUI: false});
				break;
			}
			domChangeChecker.setThreshold(0.36);
			throwIfAborted();
		}

		console.log('[Workday] ✅ Automation completed successfully.');
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
 * Stops an active Workday automation session gracefully.
 */
export function stopExecution() {
  abortExecution();
  console.log('[Greenhouse] 🛑 Abort signal dispatched.');
}