// ============================================================================
// 📁 Global Dependencies
// ============================================================================
import { sleep, waitUntilSmart, notifyTabState, getTabState, resolveValidElements, toTimestampTZ, getJobId, getKey, isCurrentlyWorking, getLocalDate, getWebsites, resolveAnswerValue, getNearestAddress, getBestResume } from '@shared/utils/utility.js';
import { DB_KEY_MAP } from '@shared/config/config.js';

// ============================================================================
// 📁 Form Dependencies
// ============================================================================
import { FIELD_TYPE, FIELD_VALIDATOR, filterValidStringSelectors, filterValidHtmlElements, filterCheckboxLocators, normalizeResolver, clearFields, syncContainersSimple, getContainerIndex, getDatabaseIndex, removeContainerSimple, normalizeInputValue, normalizeRadioAnswers, normalizeCheckboxAnswers, normalizeDropdownAnswers, normalizeMultiselectValues } from '@form/formUtils.js';
import { click, clickAll, fillInput, radioSelect, checkboxSelect, dropdownSelect, multiselect, uploadFiles } from '@form/formHandlers.js';
import { KNOWN_QUESTION_ACTION, RESOLUTION_STATUS, EXECUTION_STATUS, CORRECTION_TYPE, resolveATSQuestions } from '@form/formResolver.js'

// ============================================================================
// 📁 Label Dependencies
// ============================================================================
import { matchQuestionWithLabelEmbeddings } from '@shared/utils/labelUtils.js';
import { LABEL_DEFINITIONS } from '@shared/config/labelConfig.js'

// ============================================================================
// 📁 ATS Dependencies
// ============================================================================
import {fetchJobDataByKey} from '@shared/utils/atsUtils.js';

// ============================================================================
// 📁 Workday Dependencies
// ============================================================================
import { SELECTORS, WORKDAY_PAGES, KNOWN_QUESTIONS, getKnownQuestionKeys, getLabelEmbeddingKeys } from '@ats/config/workdayConfig.js';


// ============================================================================
// 🧩 Config
// ============================================================================
const USER_DB = await (await fetch(chrome.runtime.getURL('web/userData.json'))).json();

const failedWorkExperienceDatabaseIdx = new Set(); // Holds DB index
const failedEducationDatabaseIdx = new Set(); // Holds DB index
const failedWebsiteDatabaseIdx = new Set(); // Holds DB index
const failedWorkExpContainers = new Set(); // Holds Container index
const failedEducationContainers = new Set(); // Holds Container index
const failedWebsiteContainers = new Set(); // Holds Container index

const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)


/* --------------------------------------------------------------------------
 * 🧭 waitUntilApplyFlowSettled()
 * ------------------------------------------------------------------------ */
export async function waitUntilApplyFlowSettled({ timeout = 10 } = {}) {

	const isApplyFlowLoading = () =>
		el('[data-automation-id="applyFlowPage"] > div:last-child')
			?.textContent.includes('Loading');
	const isApplyFlowHiddenCheck1 = () =>
		el('[data-automation-id="applyFlowPage"] > div:last-child')
			?.style.cssText.includes('display: none !important');
	const isApplyFlowHiddenCheck2 = () =>
		el('[data-automation-id="applyFlowPage"] > div.css-1j489tx')
			?.style.cssText.includes('display: none !important');
	const isAnyApplyFlowContainerLoading = () =>
		els('div.css-c67pb2 div.css-i19yjz')
			.some(el => el.textContent.trim() === 'Loading');

	const AND = (...conditions) => async () =>
	(await Promise.all(conditions.map(c => c()))).every(Boolean);
	const OR = (...conditions) => async () =>
	(await Promise.all(conditions.map(c => c()))).some(Boolean);
	const NOT = (condition) => async () =>
	!(await condition());

	await waitUntilSmart(
		AND (
			NOT(
				OR (
					isApplyFlowLoading,
					isApplyFlowHiddenCheck1,
					isApplyFlowHiddenCheck2
				)
			),
			NOT(isAnyApplyFlowContainerLoading)
		),
		{ timeout: timeout }
	);
	
}


/* --------------------------------------------------------------------------
 * 🍭 getPage()
 * ------------------------------------------------------------------------ */
export async function getPage() {

	const isApplyFlowPresent = () =>
  		!!el(`[data-automation-id="applyFlowPage"]`);
	if (isApplyFlowPresent()) {
		// Wait until application flow section to stable before deciding page.
		await waitUntilApplyFlowSettled({timeout: 10});
	}

	const currentStepLabel = el(`[data-automation-id="progressBarActiveStep"] > label:last-child`);
	const currentStepHeading = el(`[data-automation-id="applyFlowPage"] > div.css-1j489tx h2`);
	const currentStepLabelText = currentStepLabel?.textContent;
	const currentStepHeadingText = currentStepHeading?.textContent;
	

	if (
		el(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].candidatePageIdentifier)
	) {
		return WORKDAY_PAGES.CANDIDATE_HOME_PAGE;
	}
	else if (el(SELECTORS[WORKDAY_PAGES.JOB_SEARCH_PAGE].jobSearchPageIdentifier)) {
		return WORKDAY_PAGES.JOB_SEARCH_PAGE;
	}
	else if (
		el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].descriptionPageIdentifier)
		|| el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].applyButton) 
		|| el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].applyManuallyButton)
		|| el(SELECTORS[WORKDAY_PAGES.DESCRIPTION_PAGE].continueApplicationButton)
	) {
		return WORKDAY_PAGES.DESCRIPTION_PAGE;
	}
	else if (
		(currentStepLabelText === "Create Account/Sign In")
		|| el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].createAccountSubmitButton)
		|| el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInSubmitButton)
		|| el(SELECTORS[WORKDAY_PAGES.AUTH_PAGE].signInWithEmailButton)
	) {
		return WORKDAY_PAGES.AUTH_PAGE;
	}
	else if ([currentStepLabelText, currentStepHeadingText].includes("My Information")) {
		return WORKDAY_PAGES.INFO_PAGE;
	}
	else if ([currentStepLabelText, currentStepHeadingText].includes("My Experience")) {
		return WORKDAY_PAGES.EXP_PAGE;
	}
	else if (currentStepLabelText?.startsWith('Application Questions') || currentStepHeadingText?.startsWith('Application Questions')) {
		return WORKDAY_PAGES.QUESTIONNAIRE_PAGE;
	}
	else if ([currentStepLabelText, currentStepHeadingText].includes("Voluntary Disclosures")) {
		return WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE;
	}
	else if ([currentStepLabelText, currentStepHeadingText].includes("Self Identify")) {
		return WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE;
	}
	else if ([currentStepLabelText, currentStepHeadingText].includes("Review")) {
		return WORKDAY_PAGES.REVIEW_PAGE;
	}
	else if (el(SELECTORS[WORKDAY_PAGES.ALREADY_APPLIED_PAGE].alreadyAppliedPageIdentifier)) {
		return WORKDAY_PAGES.ALREADY_APPLIED_PAGE;
	}
	else if (el(SELECTORS[WORKDAY_PAGES.PAGE_NOT_EXISTS].pageNotExistsIdentifier)?.textContent.includes("The page you are looking for doesn't exist")) {
		return WORKDAY_PAGES.PAGE_NOT_EXISTS;
	}

	return WORKDAY_PAGES.UNKNOWN_PAGE;
}

/* --------------------------------------------------------------------------
 * 🌱 initializePage(page)
 * ------------------------------------------------------------------------ */
export async function initializePage(page) {

	async function clearSpinbuttons() {
		/** ------------------------------------------
		 * ↩️ Clear all spin buttons
		 ------------------------------------------ */
		for (const spinbutton of els(`input[role="spinbutton"]`)) {
			await clearFields(spinbutton);
		}
	}

	async function clearAllChips() {
		/** ------------------------------------------
		 * 📟 Remove all chips
		 ------------------------------------------ */
		let chipsToDeleteCap = 100;
		while (chipsToDeleteCap > 0 && !!el(`[data-automation-id="multiselectInputContainer"] ul li span`)) {
			const chipElement = el(`[data-automation-id="multiselectInputContainer"] ul li span`);
			if (!chipElement) break; // Stop if no element found
			chipElement.closest('div')?.click();
			await sleep(0.03);
			chipsToDeleteCap--;
		}
	}

	if ([WORKDAY_PAGES.EXP_PAGE, WORKDAY_PAGES.QUESTIONNAIRE_PAGE, WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE, WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE].includes(page)) {
		/** ------------------------------------------
		 * 📟 Remove all chips
		 ------------------------------------------ */
		await clearAllChips();

		/** ------------------------------------------
		 * ↩️ Clear all spin buttons
		 ------------------------------------------ */
		await clearSpinbuttons();
	}

	switch (page) {

		case WORKDAY_PAGES.CANDIDATE_HOME_PAGE: {
			// Ensure 'My Application' tab toggler exists.
			if (!el(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].myApplicationSectionToggler)) { 
				return false;
			}

			// Open 'My Application' block incase close.
			if (!el(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].myApplicationActiveButton)) { // If not open
				await click(el(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].myApplicationSectionToggler)); // open
				if (!el(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].myApplicationActiveButton)) { // If still not open
					return false; // failed to initialize.
				}
			}

			// Select active tab
			await click(el(SELECTORS[WORKDAY_PAGES.CANDIDATE_HOME_PAGE].myApplicationActiveButton));

			return true;
		}



		case WORKDAY_PAGES.EXP_PAGE: {

			/** ------------------------------------------
			 * 🧬 Sync Work Experience, Education, & Website Containers
			 ------------------------------------------ */

			// Fetch number of containers already open
			const workExpContainersCount = document.querySelectorAll(SELECTORS[WORKDAY_PAGES.EXP_PAGE].workExperienceContainers).length;
			// Get user background from DB
			const userWorkExpCount = resolveAnswerValue(USER_DB, DB_KEY_MAP.WORK_EXPERIENCES, []).length;
			// Sync containers with DB work count
			await syncContainersSimple({ // Sync work experience containers
				currentCount: workExpContainersCount,
				targetCount: userWorkExpCount - failedWorkExperienceDatabaseIdx.size,
				addButtonSelector: SELECTORS[WORKDAY_PAGES.EXP_PAGE].workExperienceAddButton,
				deleteButtonsSelector: SELECTORS[WORKDAY_PAGES.EXP_PAGE].workExperienceDeleteButtons
			});
			// Sync: I currently work here (checkboxes)
			const workContainers = document.querySelectorAll(SELECTORS[WORKDAY_PAGES.EXP_PAGE].workExperienceContainers);
			for (let workContainerIdx = 0; workContainerIdx < workContainers.length; workContainerIdx++) {
				const dbAnswerKeyIdx = getDatabaseIndex(workContainerIdx, failedWorkExperienceDatabaseIdx)
				const fullWorkExperience = resolveAnswerValue(USER_DB, DB_KEY_MAP.WORK_EXPERIENCES, []);
				const containerEndDate = resolveAnswerValue(fullWorkExperience[dbAnswerKeyIdx], getKey(DB_KEY_MAP.WORK_EXPERIENCES_END_DATE), undefined);
				if (isCurrentlyWorking(containerEndDate)) {
					await click(els(SELECTORS.EXP_PAGE.workExperienceCurrentlyWorkingCheckboxes)[workContainerIdx])
				}
			}

			// Fetch number of containers already open
			const educationContainerCount = document.querySelectorAll(SELECTORS[WORKDAY_PAGES.EXP_PAGE].educationContainers).length;
			// Get user background from DB
			const userEducationHistoryCount = resolveAnswerValue(USER_DB, DB_KEY_MAP.EDUCATION, []).length;
			// Sync containers with DB edu count
			await syncContainersSimple({ // Sync education experience containers
				currentCount: educationContainerCount,
				targetCount: userEducationHistoryCount - failedEducationDatabaseIdx.size,
				addButtonSelector: SELECTORS[WORKDAY_PAGES.EXP_PAGE].educationAddButton,
				deleteButtonsSelector: SELECTORS[WORKDAY_PAGES.EXP_PAGE].educationDeleteButtons
			});

			// Sync containers with DB URLs count
			// await clearFields(SELECTORS.EXP_PAGE.websiteContainers);
			await clickAll(SELECTORS[WORKDAY_PAGES.EXP_PAGE].websiteDeleteButtons, {timeout: 1500, delayMs: 50, max: 8});
			await syncContainersSimple({ // Sync website containers
				currentCount: 0,
				targetCount: getWebsites(USER_DB).length - failedWebsiteDatabaseIdx.size,
				addButtonSelector: SELECTORS[WORKDAY_PAGES.EXP_PAGE].websiteAddButton,
				deleteButtonsSelector: SELECTORS[WORKDAY_PAGES.EXP_PAGE].websiteDeleteButtons
			});

			/** ------------------------------------------
			 * 🗑️ Remove all pre-uploaded resume files
			 ------------------------------------------ */
			await clickAll(SELECTORS[WORKDAY_PAGES.EXP_PAGE].deleteFileButtons, {timeout: 1500, delayMs: 50, max: 5});

		}
	}
	return true;
}

/* --------------------------------------------------------------------------
 * 🔰 initNewIteration()
 * ------------------------------------------------------------------------ */
// Function to execute at the start of every new iteration
export async function initNewIteration() {
	// Reset container trackers - ensures safe parallel execution. 
	failedWorkExpContainers.length = 0;
	failedEducationContainers.length = 0;
	failedWebsiteContainers.length = 0;
}

/* --------------------------------------------------------------------------
 * 🔍 getQuestions()
 * ------------------------------------------------------------------------ */
/**
 *  🔍 Helper: Get All Questions
 * 
 * Parses a web page form to detect all question-like elements and their associated
 * input fields, automatically determining metadata such as field type and whether
 * the field is required.
 *
 * This function is designed for dynamic pages (e.g., React, Workday) where the
 * DOM may contain nested, custom, or ARIA-compliant input components. It is
 * fully non-destructive and does not modify the DOM.
 *
 * Features:
 *  - Detects question containers (divs, fieldsets) and "orphan" labels outside containers.
 *  - Finds associated fields via:
 *      • Label `for` attribute
 *      • Nested inputs inside labels
 *      • Nearby input/select/textarea elements in parent containers
 *      • ARIA-compliant dropdowns or custom components
 *  - Determines field type:
 *      radio, checkbox, text, password, email, number, tel, url, date, hidden, file,
 *      textarea, select, multiselect, dropdown, button, unknown
 *  - Handles radio/checkbox groups automatically by `name` attribute
 *  - Detects required fields using multiple strategies:
 *      • HTML `required` attribute
 *      • `aria-required` on element or descendants
 *      • Label ending with "*"
 *      • Fieldset legend ending with "*"
 *
 * @async
 * @function getQuestions
 * @returns {Promise<Array<Object>>} Resolves with an array of detected question objects:
 *   Each object contains:
 *     @property {HTMLElement|null} label - The label element associated with the question, if any
 *     @property {HTMLElement[]} fields - Array of input elements associated with the question
 *     @property {string} type - Field type (`radio`, `checkbox`, `text`, `select`, `multiselect`, `dropdown`, `button`, `unknown`, etc.)
 *     @property {boolean} required - True if the field is marked as required
 *
 * @example
 * const questions = await getQuestions();
 * questions.forEach(q => {
 *   console.log(q.label?.textContent, q.type, q.required, q.fields);
 * });
 *
 * @notes
 *  - Designed for dynamic or custom form components (supports ARIA attributes).
 *  - Does not perform any DOM modification or interaction.
 *  - Returns all detected questions including those with "orphan" labels not in main containers.
 */
export async function getQuestions({ errorOnly = null, forceSkipValidatorBank = [] } = {}) {

	/**
	 * Find main question containers in the page
	 * @param {boolean} errorOnly - whether to return only questions with errors
	 * @returns {NodeListOf<HTMLElement> | HTMLElement[]}
	 */
	function findQuestions(errorOnly) {
		if (!errorOnly) {
			return document.querySelectorAll('div.css-7t35fz, fieldset.css-1s9yhc');
		}

		const errorAlerts = document.querySelectorAll('[data-automation-id="inputAlert"]');
		const questionsWithErrors = new Set();

		errorAlerts.forEach(alert => {
			const questionContainer = alert.closest('div.css-7t35fz, fieldset.css-1s9yhc');
			if (questionContainer) {
				questionsWithErrors.add(questionContainer);
			}
		});

		return Array.from(questionsWithErrors);
	}

	/**
     * Find all associated fields for a given element
     * Handles labels, nested inputs, nearby inputs, and ARIA dropdowns
     * @param {HTMLElement} el 
     * @returns {HTMLElement[]} Array of associated input elements
     */
	function findAssociatedFields(el) {

		/**
         * Find the "base" input for a label element
         * 1️⃣ Checks label htmlFor
         * 2️⃣ Looks for nested input inside label
         * 3️⃣ Searches nearby container (div/fieldset)
         * @param {HTMLLabelElement} label 
         * @returns {HTMLElement|null}
         */
		function findBaseFieldForLabel(label) {
			// 1️⃣ <label for="inputId">
			if (label.htmlFor) {
				const forEl = document.getElementById(label.htmlFor);
				if (forEl && forEl.matches('input, button, textarea, select')) return forEl;
			}

			// Nested or nearby input
			return (
				label.querySelector('input, textarea, select') || // 2️⃣ Nested input
				label.closest('div, fieldset')?.querySelector('input, textarea, select') || // 3️⃣ Nearby input
				null
			);
		}

		// ---------- CASE 1: if element is a label ----------
		if (el.tagName === 'LABEL') {
			const baseField = findBaseFieldForLabel(el);
			if (baseField) {
				const { type, name } = baseField;

				// Group radio/checkbox by "name" attribute
				if ((type === 'radio' || type === 'checkbox') && name) {
					return [...document.querySelectorAll(`input[type="${type}"][name="${CSS.escape(name)}"]`)];
				}

				return [baseField];
			}
		}

		// ---------- CASE 2: general el container ----------
		return [...el.querySelectorAll('[aria-haspopup="listbox"], [role="combobox"], input, textarea, select')];
	}

	/**
	 * Split or preserve fields into logical groups based on modular rules.
	 * @param {HTMLElement[]} fields 
	 * @param {Array<{name:string,test:(el:HTMLElement)=>boolean,splitIndividually?:boolean}>} rules 
	 * @returns {HTMLElement[][]} Array of field groups
	 */
	function createFieldGroups(fields, segregationRules = []) {
		if (!Array.isArray(fields) || !fields.length) return [];
		const matchedGroups = [];
		const unmatched = new Set(fields);

		for (const rule of segregationRules) {
			const group = fields.filter(el => rule.test(el));
			if (!group.length) continue;

			if (rule.splitIndividually) {
			// Each element becomes its own subgroup
			for (const el of group) {
				matchedGroups.push([el]);
				unmatched.delete(el);
			}
			} else {
			// Keep all matches in a single group
			matchedGroups.push(group);
			group.forEach(el => unmatched.delete(el));
			}
		}

		// Any remaining unmatched fields are placed together in a single group
		if (unmatched.size) {
			matchedGroups.push([...unmatched]);
		}

		return matchedGroups;
	}

	 /**
     * Select the "base" field from a list of candidate fields
     * Priority:
     *  1️⃣ ARIA combobox/listbox (custom dropdown)
     *  2️⃣ Real form controls (input/textarea/select)
     *  3️⃣ Button (last resort)
     *  4️⃣ Fallback: first element
     * @param {HTMLElement[]} fields 
     * @returns {HTMLElement|null}
     */
	function selectBaseField(fields) {
		if (!Array.isArray(fields) || !fields.length) return null;

		// 1️⃣ ARIA combobox / listbox
		const ariaControl = fields.find(el =>
			el.getAttribute('role') === 'combobox' ||
			el.getAttribute('aria-haspopup') === 'listbox'
		);
		if (ariaControl) return ariaControl;

		// 2️⃣ Prefer real form controls
		const realControl = fields.find(el =>
			el.matches('input:not([type="hidden"]), textarea, select')
		);
		if (realControl) return realControl;

		// 3️⃣ Button as last resort
		const button = fields.find(el => el.tagName === 'BUTTON');
		if (button) return button;

		return fields[0] || null;
	}

	/**
     * Determine the type of a field
     * @param {HTMLElement} el 
     * @returns {string} Field type (radio, checkbox, text, select, multiselect, dropdown, button, unknown)
     */
	function getFieldType(el) {
		if (!el) return 'unknown';

		const tag = el.tagName.toLowerCase();

		// 1️⃣ Custom multiselect (your project-specific attribute)
		if (el.hasAttribute('data-uxi-multiselect-id')) {
			return 'multiselect';
		}

		// 2️⃣ Input types
		if (tag === 'input') {
			const type = el.type?.toLowerCase();

			if (type === 'radio') return 'radio';
			if (type === 'checkbox') return 'checkbox';
			if (type === 'text') return 'text';
			if (type === 'password') return 'password';
			if (type === 'email') return 'email';
			if (type === 'number') return 'number';
			if (type === 'tel') return 'tel';
			if (type === 'url') return 'url';
			if (type === 'date') return 'date';
			if (type === 'hidden') return 'hidden';
			if (type === 'file') return 'file';
		}

		// 3️⃣ Textarea
		if (tag === 'textarea') return 'textarea';

		// 4️⃣ Select (including single/multiple select)
		if (tag === 'select') {
			return el.multiple ? 'multiselect' : 'select';
		}

		// 5️⃣ Button dropdowns
		if (tag === 'button') {
			if (el.getAttribute('aria-haspopup') === 'listbox') return 'dropdown';
			return 'button';
		}

		// 6️⃣ ARIA-based dropdown detection (for custom components)
		if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
			return 'dropdown';
		}

		return 'unknown';
	}

	/**
     * Determine if any of the elements is required
     * Checks:
     *  - HTML required attribute
     *  - aria-required attribute
     *  - descendant aria-required
     *  - Label ending with *
     *  - Fieldset legend ending with *
     * @param {HTMLElement[]} elements 
     * @returns {boolean}
     */
	function isAnyRequired(elements = []) {
		for (const el of elements) {
			if (!(el instanceof HTMLElement)) continue;

			// 1️⃣ Native required attribute
			if (el.matches('input, textarea, select') && el.required) return true;

			// 2️⃣ aria-required on the element itself
			if (el.getAttribute('aria-required') === 'true') return true;

			// 3️⃣ aria-required on descendants (custom components)
			if (el.querySelector('[aria-required="true"]')) return true;

			// 4️⃣ Label text ends with *
			if (el.tagName === 'LABEL') {
				const text = el.textContent?.trim();
				if (text && /\*\s*$/.test(text)) return true;
			}

			// 5️⃣ Fieldset / legend convention (direct or nested)
			const legend = el.tagName === 'FIELDSET' ? el.querySelector('legend') : el.querySelector('fieldset legend');
			if (legend?.textContent?.trim().endsWith('*')) return true;
		}

		return false;
	}

	// ---------- MAIN LOGIC ----------
	const results = [];
	const questions = findQuestions(errorOnly);
	const segregationRules = [
		{
			name: 'spinbutton-text', 
			test: (el) => el.type === 'text' && el.getAttribute('role') === 'spinbutton',
			splitIndividually: true, // each matching element becomes its own group (`false` to keep matches together)
		}
	];
	for (const question of questions) {
		const label = question.querySelector('label, legend');
		let fields = findAssociatedFields(question);
		if (!fields.length && label) fields = findAssociatedFields(label);
		const fieldGroups = createFieldGroups(fields, segregationRules);
		for (fields of fieldGroups) {
			if (resolveValidElements(fields, forceSkipValidatorBank, 'OR').length) continue;
			const baseField = selectBaseField(fields);
			const type = getFieldType(baseField);
			const required = isAnyRequired([question, label, ...fields])
			if (fields.length) results.push({ label, fields, type, required });
		}
	}
	// ---------- Handle "orphan" labels not in question containers ----------
	if (!errorOnly) {
		const labels_diff = [...document.querySelectorAll('label.css-1ud5i8o, legend')].filter(label => ![...questions].some(q => q.contains(label)));
		for (const new_label of labels_diff) {
			const fields = findAssociatedFields(new_label);
			if (resolveValidElements(fields, forceSkipValidatorBank, 'OR').length) continue;
			const baseField = selectBaseField(fields);
			const type = getFieldType(baseField);
			const required = isAnyRequired([new_label, ...fields])
			if (fields.length) results.push({ label: new_label, fields, type, required });
		}
	}

	return results;
}

/* --------------------------------------------------------------------------
 * 📄 getJobDetails()
 * ------------------------------------------------------------------------ */
async function getJobDetails() {

	function extractFromOG() {
		const safe = (selector, attr = 'content') =>
			document.querySelector(selector)?.getAttribute(attr) || null;

		return {
			jobTitle: safe(`meta[property="og:title"]`),
			jobDescription: safe(`meta[property="og:description"]`),
			jobURL: safe(`meta[property="og:url"]`)
		};
	}

	function extractJobPostingFromJSONLD() {
		const scripts = Array.from(
			document.querySelectorAll('script[type="application/ld+json"]')
		);

		for (const script of scripts) {
			try {
				const json = JSON.parse(script.textContent);

				// Some sites wrap JobPosting in arrays
				const candidates = Array.isArray(json) ? json : [json];

				for (const item of candidates) {
					if (item?.['@type'] === 'JobPosting') {
					return {
						jobTitle: item.title || null,
						jobDescription: item.description || null,
						datePosted: item.datePosted || null,
						employmentType: item.employmentType || null,

						jobId:
						item.identifier?.value ||
						item.identifier?.name ||
						null,

						companyName:
						item.hiringOrganization?.name || null,

						jobLocation:
						item.jobLocation?.address?.addressLocality || null,

						jobCountry:
						item.jobLocation?.address?.addressCountry || null
					};
					}
				}
			} catch {
			// Ignore invalid JSON-LD blocks
			}
		}

		return null;
	}
	
	function mergeJobDetails(primary, fallback) {
		const result = { ...fallback };

		for (const key in primary) {
			if (primary[key]) {
			result[key] = primary[key];
			}
		}

		return result;
	}

	const ogData = extractFromOG();
	const jsonLDData = extractJobPostingFromJSONLD();
	const merged = mergeJobDetails(ogData, jsonLDData || {});

	const tabStore = await getTabState();
    const jobDetails = {}

	const title = merged.jobTitle || tabStore?.jobData?.title;
	if (title) jobDetails['title'] = title

	const company = merged.companyName || tabStore?.jobData?.company;
	if (company) jobDetails['company'] = company;

	const jobDescriptionText = merged.jobDescription || tabStore?.jobData?.summary;
	if (jobDescriptionText) jobDetails['description'] = jobDescriptionText;

    const locations = [];
	if (merged.jobLocation) locations.push(merged.jobLocation)
	if (merged.jobCountry) locations.push(merged.jobCountry)
    if (Array.isArray(tabStore?.jobData?.locations)) {
        locations.push(...tabStore.jobData.locations.filter(Boolean));
    }
    if (locations.length) jobDetails['locations'] = locations
    
    const publishTimeISO = toTimestampTZ(merged.datePosted) || tabStore?.publishTimeISO
    if (publishTimeISO) jobDetails['publishTimeISO'] = publishTimeISO

	const employmentType = merged.employmentType || tabStore?.jobData?.employmentType;
	if (employmentType) jobDetails['employmentType'] = employmentType;

    if (tabStore?.jobData?.seniority) jobDetails['seniority'] = tabStore?.jobData?.seniority
    if (tabStore?.jobData?.workModel) jobDetails['workModel'] = tabStore?.jobData?.workModel
    if (tabStore?.jobData?.skills) jobDetails['skills'] = tabStore?.jobData?.skills
    if (tabStore?.jobData?.minSalary) jobDetails['minSalary'] = tabStore?.jobData?.minSalary
    if (tabStore?.jobData?.maxSalary) jobDetails['maxSalary'] = tabStore?.jobData?.maxSalary
    if ([true,false].includes(tabStore?.jobData?.isRemote)) jobDetails['isRemote'] = tabStore?.jobData?.isRemote // only add if explicitly mentioned (non-null)
    if ([true,false].includes(tabStore?.jobData?.isVisaSponsor)) jobDetails['isVisaSponsor'] = tabStore?.jobData?.isVisaSponsor // only add if explicitly mentioned (non-null)
    if ([true].includes(tabStore?.jobData?.isCitizenOnly)) jobDetails['isCitizenOnly'] = tabStore?.jobData?.isCitizenOnly // only add if there's strict citizenship requirement.
    if ([true].includes(tabStore?.jobData?.isClearanceRequired)) jobDetails['isClearanceRequired'] = tabStore?.jobData?.isClearanceRequired // only add if there's strict clearance requirement.
    if ([true].includes(tabStore?.jobData?.isWorkAuthRequired)) jobDetails['isWorkAuthRequired'] = tabStore?.jobData?.isWorkAuthRequired // only add if there's strict authorization requirement.

	return jobDetails
}


/* --------------------------------------------------------------------------
 * ℹ️ initExecutionPayload()
 * ------------------------------------------------------------------------ */
export async function initExecutionPayload() {
	const tabStore = await getTabState()
	if (tabStore?.applyURL == null) {
		const applyURL = window.location.href;
		const jobDetails = await getJobDetails();

		const soft_data = {
			applyURL: applyURL,
			title: jobDetails?.title,
			// description: jobDetails?.description,  // big description (not storage efficient)
			locations: jobDetails?.locations,
			// country: jobDetails?.country, // currently we use only 'locations' (type: array) in schema
			company: jobDetails?.company,
			employmentType: jobDetails?.employmentType,
			publishTimeISO: jobDetails?.publishTimeISO,
		}
        const jobId = await getJobId(applyURL);
        const jobData = await fetchJobDataByKey(jobId.id);
		notifyTabState({
			jobId: jobId,
            jobData: jobData, // fetched from DB - supports automation
            soft_data: soft_data, // scraped from webpage - supports automation & post DB updation
			source: 'workday'
		}, {updateUI: false});
	}
}




/* --------------------------------------------------------------------------
 * 📚 getChipContainer(multiselectLocators)
 * ------------------------------------------------------------------------ */
function getChipContainer(multiselectLocators) {
	
    // Filter strings that exist in the DOM
	const stringSelectors = filterValidStringSelectors(multiselectLocators);
	// Filter HTMLElements that are in the DOM
	const htmlElements = filterValidHtmlElements(multiselectLocators);

	let chipContainerLocator; // HTMLElement
	// Handle string selectors first
	if (stringSelectors && stringSelectors.length) {
		// Map each selector to its closest container and remove nulls
		const containers = stringSelectors
			.map(sel => document.querySelector(sel)?.closest('[data-automation-id="multiselectInputContainer"]'))
			.filter(Boolean);
		// Take the first valid container as HTMLElement
		chipContainerLocator = containers[0] || null;
	} 
	// Handle direct HTMLElements
	else if (htmlElements && htmlElements.length) {
		// Map each element to its closest container and remove nulls
		const containers = htmlElements
			.map(el => el?.closest('[data-automation-id="multiselectInputContainer"]'))
			.filter(Boolean);
		// Take the first valid container as HTMLElement
		chipContainerLocator = containers[0] || null;
	}
	return chipContainerLocator;

}

/* --------------------------------------------------------------------------
 * 🚀 formManager(question, locators, val)
 * ------------------------------------------------------------------------ */
async function formManager(
	question, 
	locators, 
	val, 
	payload = {} // contains key 'remainingAttempts' (type:number) & 'resolutionRequests' key containing configuration keys passed by 'resolveAnswer' fxn (special requests for the given question)
) {

	// locators ---> Array[HTMLElement || string Selectors]  
	if (!Array.isArray(locators) || !locators.length) {
		return async () => { 
			return {
				status: EXECUTION_STATUS.ERROR,
				reason: "Unknown locators. Must be of type array",
				error: undefined
			};
		};
	}
	
	// val ---> any (non empty)
	if (val == null) {
		return async () => { 
			return {
				status: EXECUTION_STATUS.ERROR,
				reason: "Unknown value.",
				error: undefined
			};
		};
	}

	switch (question.type) {

		case 'text':
        case 'email':
        case 'password':
        case 'number':
        case 'tel':
        case 'url':
		case 'search':
        case 'textarea': {

			let normalizedValue;
			try {
				normalizedValue = normalizeInputValue(val, question.type);
			} catch (err) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: `Failed to normalize value: ${val}`,
						error: err.message
					};
				};
			}

			if (normalizedValue == null) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "Normalized value of type null or undefined",
						error: undefined,
					};
				};
			}

			if (
				question.type === FIELD_TYPE.TEXT
				&& payload.remainingAttempts <= 1 
				&& (
					question?.label?.textContent.includes('salary')
					|| question?.label?.textContent.includes('compensation')
				)
			) {
				// Type: Array[] of strings <- contains extracted number in their base form.
				const normalizedNumberStrings = normalizedValue.match(/\d[\d,]*/g)?.map(n => n.replace(/,/g, '')) ?? [];
				if (normalizedNumberStrings.length) { // numbers exist in answer
					normalizedValue = normalizedNumberStrings[0]
				} else { // numbers does not exist in answer
					const salary = resolveAnswerValue(USER_DB, DB_KEY_MAP.SALARY_EXPECTATIONS, {min: 80000, max: 80000})
					const min = Number(salary.min);
					const max = Number(salary.max);
					if (Number.isNaN(min) || Number.isNaN(max)) {
						if (question.required) {
							normalizedValue = "80000";
						} else {
							return async () => {  return { status: EXECUTION_STATUS.OK }; };
						}
					} else if (min === max) {
						normalizedValue = String(min);
					} else {
						normalizedValue = String(Math.floor((min + max) / 2));
					}
				}
			}

			let dispatchFocus = true;
			const spinButton = resolveValidElements(locators, [FIELD_VALIDATOR.text, (el) => el.getAttribute('role') == "spinbutton" && el.getAttribute('aria-label') != null], 'AND');
			if (spinButton.length) dispatchFocus = false;

			return async () => {
				const res = await fillInput(locators, normalizedValue, {dispatchFocus: dispatchFocus});
				if (!res?.success) {
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "fillInput_failed",
						error: undefined,
					};
				}
				return { status: EXECUTION_STATUS.OK };
			};
		}

		case 'radio': {

			let normalizedAnswers;

			try {
				normalizedAnswers = normalizeRadioAnswers(val);
			} catch (err) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: `Failed to normalize value: ${val}`,
						error: err.message
					};
				};
			}

			if (!normalizedAnswers) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "Normalized value of type null or undefined",
						error: undefined,
					};
				};
			}

			let threshold = question.required 
				? 65  // Need confidence on options as well, else rely on LLM. 
				: 65; // Select the best from candidates whose match is above this threshold (note: could be 0 such options - leading no selection).

			if ((payload?.remainingAttempts == 0) && question.required ) {
				threshold = 0  // Select the best option (ensures atleast one selection)
			}

			return async () => {
				const res = await radioSelect(
					locators, 
					normalizedAnswers, 
					{
						threshold: threshold
					}
				);
				if (!res?.success) {
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "radioSelect_failed",
						error: undefined,
						meta: {options: res?.options ?? []}
					};
				}
				return { status: EXECUTION_STATUS.OK };
			};

		}
		
		case 'checkbox': {

			/* --------------------------------------------------
			* 1️⃣ Resolve valid checkbox locators
			* -------------------------------------------------- */
			const validCheckboxes = filterCheckboxLocators(locators);
			const optionCount = validCheckboxes.length;

			if (!optionCount) return async () => { 
				return {
					status: EXECUTION_STATUS.ERROR,
					reason: `No checkboxes found for ${question.type} using given locators.`,
					error: undefined
				};
			};

			/* --------------------------------------------------
			* 2️⃣ Normalize input value
			* -------------------------------------------------- */
			let normalizedValues;
			try {
				normalizedValues = normalizeCheckboxAnswers(val);
			} catch (err) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: `Failed to normalize value: ${val}`,
						error: err.message
					};
				};
			}

			if (normalizedValues == null) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "Normalized value of type null or undefined",
						error: undefined,
					};
				};
			}

			/* --------------------------------------------------
			* 3️⃣ Determine selection constraints
			* -------------------------------------------------- */
			// Dynamic threshold based on option count
			let threshold;
			if (optionCount <= 2) threshold = question.required ? 70 : 60;
			else if (optionCount <= 4) threshold = question.required ? 75 : 65;
			else if (optionCount <= 8) threshold = question.required ? 78 : 72;
			else threshold = question.required ? 85 : 80;

            /* -----------------------------------
            * Min Selection
            * ----------------------------------- */
            let minSelections = 0;
            if (question.required) {
                if (
                    (validCheckboxes.length === 1)
                    || ((payload?.remainingAttempts === 0) && (!Boolean(minSelections)))
                ) {
                    minSelections = 1;
                }
            }

            /* -----------------------------------
            * Max Selection
            * ----------------------------------- */   
            function getMaxSelection(db, validCheckboxes) {

                function maxSelectionSettings() {
                    let maxSelections = null;
                    
                    if (resolveValidElements(validCheckboxes, [el => el.id.endsWith('ethnicityMulti')]).length) {
                        const dbEthnicityLength = resolveAnswerValue( db, DB_KEY_MAP.ETHNICITY, [] ).length;
                        maxSelections = dbEthnicityLength;
                        if (question.required && maxSelections < 1) {
                            maxSelections = null
                        } 
                        return maxSelections;
                    }
                    else if (resolveValidElements(validCheckboxes, [el => el.id.endsWith('disabilityStatus')]).length) {
                        return 1;
                    }
                    
                    return maxSelections;
                }

                let maxSelections = maxSelectionSettings();
                if ((payload?.remainingAttempts == 0) && question.required && (maxSelections === 0)) {
                    maxSelections = 1  // Select the best option (ensures atleast one selection)
                }
                return maxSelections;
            }
            const db = await (await fetch(chrome.runtime.getURL('web/userData.json'))).json();
            const maxSelections = getMaxSelection(db, validCheckboxes)

            /* -----------------------------------
            * Exact Selection
            * ----------------------------------- */ 
            let exactSelections = null;
            if (question.required) {
                if (
                    (validCheckboxes.length === 1)
                    || ((payload?.remainingAttempts === 0) && (maxSelections <= 1))
                ) {
                    exactSelections = 1;
                }
            }

			/* --------------------------------------------------
			* 4️⃣ Return async handler
			* -------------------------------------------------- */
			return async () => {
				const res = await checkboxSelect(validCheckboxes, normalizedValues, {
					threshold,
					useAverage: false,
					minSelections,
					maxSelections: maxSelections,
					exactSelections: exactSelections,
					timeout: 1500
				});
				if (!res?.success) {
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "checkboxSelect_failed",
						error: res?.explanation ?? [],
						meta: {options: res?.options ?? []}
					};
				}
				return { status: EXECUTION_STATUS.OK };
			};
		}

		case 'dropdown': {

			let normalizedAnswers;

			try {
				normalizedAnswers = normalizeDropdownAnswers(val);
			} catch (err) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: `Failed to normalize value: ${val}`,
						error: err.message
					};
				};
			}

			if (!normalizedAnswers) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "No usable dropdown answers.",
					};
				};
			}

			let threshold = question.required 
				? 75  // Need confidence on options as well, else rely on LLM. 
				: 75; // Select the best from candidates whose match is above this threshold (note: could be 0 such options - leading no selection).

			if ((payload?.remainingAttempts == 0) && question.required ) {
				threshold = 0  // Select the best option (ensures atleast one selection)
			}
			
			const blacklist = ["Select One"]

			return async () => {
				const res = await dropdownSelect(
					locators, 
					normalizedAnswers, 
					{
						threshold: threshold, 
						useAverage: false, 
						blacklist: blacklist, 
						mode: 'select'
					}
				);
				if (!res?.success) {
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "dropdownSelect_failed",
						meta: { value: normalizedAnswers, options: res?.options ?? (Array.isArray(res?.ranked) ? [...new Set(res.ranked.map(r => r.text))] : []) }
					};
				}
				return { status: EXECUTION_STATUS.OK };
			};

		}

		case 'multiselect': {

			/* ------------------------------------------------
			* Resolve chip container
			* ------------------------------------------------ */
			const chipContainerLocator = getChipContainer(locators);
			if (!chipContainerLocator) return async () => {
				return {
					status: EXECUTION_STATUS.ERROR,
					reason: `Unable to resolve chipContainerLocator.`,
					error: undefined
				};
			};

			let normalizedValues;
			try {
				normalizedValues = normalizeMultiselectValues(val);
			} catch (err) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: `Failed to normalize value: ${val}`,
						error: err.message
					};
				};
			}

			if (normalizedValues == null) {
				return async () => { 
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: `Failed to normalize value: ${val}`,
						error: 'normalizeMultiselectValues() function returned `null`.'
					};
				};
			}

			// Append 'Other' as fallback for safety
			if (question.required) normalizedValues.push('Other');

			return async () => {
				const res = await multiselect(locators, normalizedValues, chipContainerLocator, {chipSelector: 'ul li[data-automation-id="menuItem"]', selectAllRelated: (payload?.resolutionRequests?.selectAllRelated || false),  maxChips: 'auto', minChips: (question.required) ? 1 : 0});
				console.log('Multiselect Response:', res);
				if (!res?.success) {
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: "multiselect_failed",
						error: undefined
					};
				}
				return { status: EXECUTION_STATUS.OK };
			};
		}

		case 'file': {

			return async () => {

				const res = await uploadFiles(locators, val, {progressSelector: "[data-automation-id='file-loading-dots']"});

				if (!res.success) {
					return {
						status: EXECUTION_STATUS.ERROR,
						reason: 'file_upload_failed',
						uploaded: res.uploaded,
						failed: res.failed,
						progressEvents: res.progressEvents
					};
				}

				return { status: EXECUTION_STATUS.OK };
			};
		}
		
		default: {
			return async () => { throw new Error(`Unknown type question: ${question} of type ${question.type}`); };
		}
	}
}

/* --------------------------------------------------------------------------
 * 🧠 resolveAnswer(question, locators, matchedQuestion, labelEmbeddingKeys)
 * ------------------------------------------------------------------------ */
/**
 * Note: returned dict can attach 'formRequest' key with its value being 
 * 'dict' type containing configurations for 'formManager' to handle.  
 */
async function resolveAnswer(question, locators, matchedQuestion, labelEmbeddingKeys) {

	async function resolveResume({ignoreLLM = false} = {}) {
		let resumePath;
		// Request server via background.js
		if (!ignoreLLM && resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_RESUME, false)) {
			const jobDetails = await getJobDetails();
			const jobLocations = jobDetails?.locations;
			const jobDescription = jobDetails?.title 
				? `Job Role: ${jobDetails?.title}\n\n${jobDetails?.description}` 
				: jobDetails?.description;
			// Request server via background.js
			resumePath = await getBestResume(jobLocations, jobDescription);
		}
		// Fallback to primary address
		if (resumePath == null){ 
			const primaryResume = resolveAnswerValue(USER_DB, DB_KEY_MAP.RESUME)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_RESUME_CONTAINER_IDX))];
			if ('resumeStoredPath' in primaryResume) resumePath = primaryResume['resumeStoredPath'];
		}
		// Return if valid
		if (resumePath != null) {
			const uploadsRootPath = 'web/uploads/';
			return uploadsRootPath + resumePath;
		}					
		return null;
	}

	function resolveTodaysDate(locators) {
		const validLocators = resolveValidElements(locators, [FIELD_VALIDATOR.text, (el) => el.getAttribute('role') == "spinbutton" && el.getAttribute('aria-label') != null], 'AND');
		if (validLocators.length) {
			switch (validLocators[0].getAttribute('aria-label')) {
				case 'Day': {
					return getLocalDate('dd');
				}
				case 'Month': {
					return getLocalDate('mm');
				}
				case "Year": {
					return getLocalDate('yyyy');
				}
			}
		} else {
			// console.log("Valid Locators NOT Found");
		}
		return null;
	}

	function resolveBirthDate(locators) {
		const validLocators = resolveValidElements(
			locators,
			[
				FIELD_VALIDATOR.text,
				(el) =>
					el.getAttribute('role') === "spinbutton" &&
					el.getAttribute('aria-label') != null
			],
			'AND'
		);

		if (!validLocators.length) return null;

		const rawBirthDate = resolveAnswerValue(USER_DB, DB_KEY_MAP.BIRTHDATE, false);

		if (!rawBirthDate) return null;

		const [year, month, day] = rawBirthDate.split('-');
		const birthDate = new Date(year, month - 1, day);

		switch (validLocators[0].getAttribute('aria-label')) {
			case 'Day':
				return getLocalDate('dd', birthDate);

			case 'Month':
				return getLocalDate('mm', birthDate);

			case 'Year':
				return getLocalDate('yyyy', birthDate);
		}

		return null;
	}


	let val;
	let dbAnswerKey;

	// ----------- ELEMENT MATCH (STRONGEST SIGNAL) -----------
	if (matchedQuestion) {

		// Push new locators if explicitly provided (locators <- Push Array[string Selectors])
		if (matchedQuestion.hasOwnProperty("locators")) locators.push(...matchedQuestion.locators);

		dbAnswerKey = matchedQuestion?.dbAnswerKey;
		const hasNestedKey = (dbAnswerKey?.split(".").length > 1);
		const dbNestedKey = dbAnswerKey?.split(".")[1];
		
		// ---------- SPECIAL DB KEYS ----------

		// ========== ADDRESS ==========
		if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.ADDRESSES)) {

			let address;
			// Request server via background.js
			if (resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_ADDRESS, false)) address = (await getNearestAddress(await getJobDetails()?.locations));
			// Fallback to primary address
			if (address == null) address = resolveAnswerValue(USER_DB, DB_KEY_MAP.ADDRESSES)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_ADDRESS_CONTAINER_IDX))];
			// Map key (like state, city, etc.) from address to 'val'
			if (address != null) val = address?.[dbNestedKey];
			
			// Return if valid
			if (val) {

				// Removes State abbreviation (two-letter codes) from answer.
				if (dbNestedKey === 'state') val = val.replace(/\s*\([A-Z]{2}\)$/, '');

				return {
					status: RESOLUTION_STATUS.ANSWERED,
					value: val,
					locators,
					source: "element",
					meta: {dbAnswerKey, dbAnswerKeyIdx: undefined, containerIdx: null}
				};
			}
			else if (matchedQuestion.action === KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE && !question.required) {
				return {
					status: RESOLUTION_STATUS.SKIPPED,
					reason: "Explicitly configured to skip when no data is present in database (safe: question either not mandatory or already set).",
				};
			}
			return {
				status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
				correction: {
					type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
					questionId: question,
				},
			};
		}

		// ========== WORK EXPERIENCE ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.WORK_EXPERIENCES)) {
			const questionElement = locators.find(l => l instanceof HTMLElement && l.isConnected) || null;
			if (!questionElement) {
				return {
					status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
					correction: {
						type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
						questionId: question,
					},
				};
			}

			// Get container index
			const containerIdx = getContainerIndex({locator: questionElement, containerSelector: SELECTORS.EXP_PAGE.workExperienceContainers});
			// Get database index (to answer this container)
			const dbAnswerKeyIdx = getDatabaseIndex(containerIdx, failedWorkExperienceDatabaseIdx)
			// Get full work history
			const fullWorkExperience = resolveAnswerValue(USER_DB, DB_KEY_MAP.WORK_EXPERIENCES, []);

			// Does container contain delete button.
			const containDeleteButton = Boolean(els(SELECTORS.EXP_PAGE.workExperienceContainers)[containerIdx]?.querySelector(SELECTORS.EXP_PAGE.workExperienceDeleteButton))

			// Verify container number resides within total work experience entries. 
			if (dbAnswerKeyIdx >= fullWorkExperience.length) {
				if (containDeleteButton) {
					return {
						status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
						correction: {
							type: CORRECTION_TYPE.REMOVE_WORK_CONTAINER,
							containerIdx: containerIdx,
							dbAnswerKeyIdx: dbAnswerKeyIdx
						},
					};
				}
				else {

					if (question.required) {
						val = resolveTodaysDate(locators); // Value will be set as per today's date (if question type matches date type validators)
						if (val != null) {
							return {
								status: RESOLUTION_STATUS.ANSWERED,
								value: val,
								locators,
								source: "element",
								meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
							};
						}
					}

					return {
						status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
						correction: {
							type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
							questionId: question,
						},
					};
				}
			}

			// Set the answer
			val = resolveAnswerValue(fullWorkExperience[dbAnswerKeyIdx], matchedQuestion.value, undefined);

			if (!val) {
				if (
					matchedQuestion?.action === KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE
					&& (
						(!question.required) 
						|| (question.required && isQuestionSet(question))
					)
				) {
					return {
						status: RESOLUTION_STATUS.SKIPPED,
						reason: "Explicitly configured to skip when no data is present in database (safe: question either not mandatory or already set).",
					};
				}
				else if (!question.required) {
					return {
						status: RESOLUTION_STATUS.SKIPPED,
						reason: "Optional work experience field with no data",
					};
				} 
				else {
					if (containDeleteButton) {
						return {
							status: RESOLUTION_STATUS.ERROR,
							correction: {
								type: CORRECTION_TYPE.REMOVE_WORK_CONTAINER,
								containerIdx: containerIdx,
								dbAnswerKeyIdx: dbAnswerKeyIdx
							}
						};
					}
					else {

						val = resolveTodaysDate(locators); // Value will be set as per today's date (if question type matches date type validators)
						if (val != null) {
							return {
								status: RESOLUTION_STATUS.ANSWERED,
								value: val,
								locators,
								source: "element",
								meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
							};
						}

						return {
							status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
							correction: {
								type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
								questionId: question,
							},
						};
					}
				}
			}

			return {
				status: RESOLUTION_STATUS.ANSWERED,
				value: val,
				locators,
				source: "element",
				meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
			};
		}

		// ========== EDUCATION ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.EDUCATION)) {
			const questionElement = locators.find(l => l instanceof HTMLElement && l.isConnected) || null;
			if (!questionElement) {
				return {
					status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
					correction: {
						type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
						questionId: question,
					}
				};
			}

			// Get container index
			const containerIdx = getContainerIndex({locator: questionElement, containerSelector: SELECTORS.EXP_PAGE.educationContainers});
			// Get database index (to answer this container)
			const dbAnswerKeyIdx = getDatabaseIndex(containerIdx, failedEducationDatabaseIdx)
			// Get full education history
			const fullEducationHistory = resolveAnswerValue(USER_DB, DB_KEY_MAP.EDUCATION, []);

			// Does container contain delete button.
			const containDeleteButton = Boolean(els(SELECTORS.EXP_PAGE.educationContainers)[containerIdx]?.querySelector(SELECTORS.EXP_PAGE.educationDeleteButton))

			// Verify container number resides within total education entries.
			if (dbAnswerKeyIdx >= fullEducationHistory.length) {
				if (containDeleteButton) {
					return {
						status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
						correction: {
							type: CORRECTION_TYPE.REMOVE_EDU_CONTAINER,
							containerIdx: containerIdx,
							dbAnswerKeyIdx: dbAnswerKeyIdx
						}
					};
				}
				else {
					if (question.required) {
						val = resolveTodaysDate(locators); // Value will be set as per today's date (if question type matches date type validators)
						if (val != null) {
							if (
								[FIELD_TYPE.DROPDOWN, 'multiselect'].includes(question.type)
								&& DB_KEY_MAP.EDUCATION_SCHOOL.includes(dbNestedKey)
								&& typeof val === 'string'
							) {
								val = [val, 'Other']
							}
							return {
								status: RESOLUTION_STATUS.ANSWERED,
								value: val,
								locators,
								source: "element",
								meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
							};
						}
					}
					return {
						status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
						correction: {
							type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
							questionId: question,
						},
					};
				}
			}

			// Set the answer
			val = resolveAnswerValue(fullEducationHistory[dbAnswerKeyIdx], matchedQuestion.value, undefined);

			if (!val) {
				if (
					matchedQuestion?.action === KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE
					&& (
						(!question.required) 
						|| (question.required && isQuestionSet(question))
					)
				) {
					return {
						status: RESOLUTION_STATUS.SKIPPED,
						reason: "Explicitly configured to skip when no data is present in database (safe: question either not mandatory or already set).",
					};
				}
				else if (!question.required) {
					return {
						status: RESOLUTION_STATUS.SKIPPED,
						reason: "Optional education field with no data",
					};
				} else {
					if (containDeleteButton) {
						return {
							status: RESOLUTION_STATUS.ERROR,
							correction: {
								type: CORRECTION_TYPE.REMOVE_EDU_CONTAINER,
								containerIdx: containerIdx,
								dbAnswerKeyIdx: dbAnswerKeyIdx
							}
						};
					}
					else {
						
						val = resolveTodaysDate(locators); // Value will be set as per today's date (if question type matches date type validators)
						if (val != null) {
							if (
								[FIELD_TYPE.DROPDOWN, 'multiselect'].includes(question.type)
								&& DB_KEY_MAP.EDUCATION_SCHOOL.includes(dbNestedKey)
								&& typeof val === 'string'
							) {
								val = [val, 'Other']
							}
							return {
								status: RESOLUTION_STATUS.ANSWERED,
								value: val,
								locators,
								source: "element",
								meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
							};
						}

						return {
							status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
							correction: {
								type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
								questionId: question,
							},
						};
					}
				}
			}

			return {
				status: RESOLUTION_STATUS.ANSWERED,
				value: val,
				locators,
				source: "element",
				meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
			};
		}

		// ========== SKILLS ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.SKILLS)) {
			
			const enabledUserSkillsSelection = resolveAnswerValue(USER_DB, DB_KEY_MAP.ENABLE_USER_SKILLS_SELECTION, false)
			const enabledJobSkillsSelection = resolveAnswerValue(USER_DB, DB_KEY_MAP.ENABLE_JOB_SKILLS_SELECTION, false)
			const enabledRelatedSkillsSelection = resolveAnswerValue(USER_DB, DB_KEY_MAP.ENABLE_RELATED_SKILLS_SELECTION, false)

			let skills = []
			if (enabledUserSkillsSelection || question.required) {
				const userSkills = resolveAnswerValue(USER_DB, DB_KEY_MAP.SKILLS, []);
				if (Array.isArray(userSkills) && userSkills.length > 0) {
					skills.push(...userSkills);
				}
			}
			if (enabledJobSkillsSelection) {
				const tabStore = await getTabState();
				const jobSkills = tabStore?.jobData?.skills;
				if (Array.isArray(jobSkills) && jobSkills.length > 0) {
					skills.push(...jobSkills);
				}	
			}
			if (question.required && skills.length === 0) { // Add generic skills to avoid failure
				skills = ["Problem-Solving", "Collaboration and Teamwork", "Digital Literacy", "Project Management", "Research Skills", "Networking", "Attention to Detail", "Cultural Competence"]
			}
			skills = [...new Set(skills)] // Deduplicate
			val = skills

			if ((val == null) || (Array.isArray(val) && val.length === 0)) {
				return {
					status: RESOLUTION_STATUS.SKIPPED,
					reason: 'Skill selection disabled or no skills available.'
				};
			}

			return {
				status: RESOLUTION_STATUS.ANSWERED,
				value: val,
				locators,
				source: "element",
				formRequest: {
					selectAllRelated: enabledRelatedSkillsSelection
				}
			};

		}

		// ========== WEBSITE ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith('website')) {
			const questionElement = locators.find(l => l instanceof HTMLElement && l.isConnected) || null;
			if (!questionElement) {
				return {
					status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
					correction: {
						type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
						questionId: question,
					},
				};
			}

			// Get container index
			const containerIdx = getContainerIndex({locator: questionElement, containerSelector: SELECTORS.EXP_PAGE.websiteContainers});
			// Get database index (to answer this container)
			const dbAnswerKeyIdx = getDatabaseIndex(containerIdx, failedWebsiteDatabaseIdx)
			// Get Websites from DB
			const userWebsites = getWebsites(USER_DB); // Array[string url]

			// Verify container number resides within total work experience entries. 
			if (dbAnswerKeyIdx >= userWebsites.length) {
				return {
					status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
					correction: {
						type: CORRECTION_TYPE.REMOVE_WEBSITE_CONTAINER,
						containerIdx: containerIdx,
						dbAnswerKeyIdx: dbAnswerKeyIdx
					},
				};
			}

			// Set the answer
			val = userWebsites[dbAnswerKeyIdx];

			if (val == null) {
				if (!question.required) {
					return {
						status: RESOLUTION_STATUS.SKIPPED,
						reason: "Optional website field with no data",
					};
				} else {
					return {
						status: RESOLUTION_STATUS.ERROR,
						correction: {
							type: CORRECTION_TYPE.REMOVE_WEBSITE_CONTAINER,
							containerIdx: containerIdx,
							dbAnswerKeyIdx: dbAnswerKeyIdx
						}
					};
				}
			}

			return {
				status: RESOLUTION_STATUS.ANSWERED,
				value: val,
				locators,
				source: "element",
				meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx, hint: val}
			};
		}

		// ========== RESUME ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.RESUME)) {

			const val = await resolveResume();
			if (val != null) {
				return {
					status: RESOLUTION_STATUS.ANSWERED,
					locators,
					value: val,
					source: "element",
					meta: {dbAnswerKey, dbAnswerKeyIdx: undefined, containerIdx: null}
				};	
			}
			return {
				status: RESOLUTION_STATUS.STRUCTURAL_FAILURE,
				correction: {
					type: CORRECTION_TYPE.MARK_QUESTION_FAILED,
					questionId: question,
				},
			};
		}

		// ---------- NON-SPECIAL (ORDINARY) DB KEYS (General Fields) ----------
		else {
			// ========== DIRECT ANSWER VIA VALUE ==========
			val =
				typeof matchedQuestion?.value === "function" ?
				resolveAnswerValue(USER_DB, matchedQuestion.value, undefined) : 	// Using DB Function
				matchedQuestion?.value;												// Using static assigned value

			// ========== DIRECT ANSWER VIA DATABASE KEY ==========
			if (val == null) {
				val = resolveAnswerValue(USER_DB, dbAnswerKey, undefined);
			}

			if (val === "" && !question.required) {
				return {
					status: RESOLUTION_STATUS.SKIPPED,
					reason: "Database holds empty string (safe: question because question is not mandatory).",
				};
			}
			else if (val != null && val !== "") {
				return {
					status: RESOLUTION_STATUS.ANSWERED,
					value: val,
					locators,
					source: "element",
					meta: {dbAnswerKey, dbAnswerKeyIdx: null, containerIdx: null}
				};
			}
			else if (
				matchedQuestion?.action === KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE
				&& (
					(!question.required) 
					|| (question.required && isQuestionSet(question))
				)
			) {
				return {
					status: RESOLUTION_STATUS.SKIPPED,
					reason: "Explicitly configured to skip when no data is present in database (safe: question either not mandatory or already set).",
				};
			}
			// Otherwise; proceed to label embeddings based resolution
		}
	}

	// ----------- LABEL MATCH (MEDIUM SIGNAL) -----------

	// Fetch all matching labels		| {key: string, similarityScore: number}[]
	const matchedLabelCandidates = await matchQuestionWithLabelEmbeddings(question, labelEmbeddingKeys, { earlyExit: false } );
	// Resolve the first candidate 		| string | null
	const bestLabelCandidateKey = (matchedLabelCandidates.length) ? matchedLabelCandidates[0].key : null;
	/** @type {{Object} LabelDefinition | null} */
	const matchedLabel = (bestLabelCandidateKey != null && bestLabelCandidateKey in LABEL_DEFINITIONS) ? LABEL_DEFINITIONS[bestLabelCandidateKey] : null;

	if (matchedLabel) {

		dbAnswerKey = matchedLabel.dbAnswerKey;
		const hasNestedKey = (dbAnswerKey?.split(".").length > 1);
		const dbNestedKey = dbAnswerKey?.split(".")[1];

		// ---------- SPECIAL DB KEYS ----------

		// ========== ADDRESS ==========
		if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.ADDRESSES)) {
			
			let address;
			// Request server via background.js
			if (resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_ADDRESS, false)) address = (await getNearestAddress(await getJobDetails()?.location));
			// Fallback to primary address
			if (address == null) address = resolveAnswerValue(USER_DB, DB_KEY_MAP.ADDRESSES)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_ADDRESS_CONTAINER_IDX))];
			// Map key (like state, city, etc.) from address to 'val'
			if (address != null) val = address?.[dbNestedKey];
			
			// Return if valid
			if (val != null) {
				return {
					status: RESOLUTION_STATUS.ANSWERED,
					value: val,
					locators,
					source: "label",
					meta: {dbAnswerKey, dbAnswerKeyIdx: undefined, containerIdx: null, matchedLabelCandidates: matchedLabelCandidates}
				};
			}
			// Proceed to Question Type based resolution
		}

		// ========== RESUME ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith(DB_KEY_MAP.RESUME)) {
			const val = await resolveResume();
			if (val != null) {
				return {
					status: RESOLUTION_STATUS.ANSWERED,
					locators,
					value: val,
					source: "label",
					meta: {dbAnswerKey, dbAnswerKeyIdx: undefined, containerIdx: null, matchedLabelCandidates: matchedLabelCandidates}
				};	
			}
			// Proceed to Question Type based resolution
		}

		// ========== START DATE ==========
		else if (hasNestedKey && dbAnswerKey?.startsWith('today')) {

			val = resolveTodaysDate(locators);

			if (val != null) {
				return {
					status: RESOLUTION_STATUS.ANSWERED,
					locators,
					value: val,
					source: "label",
					meta: {dbAnswerKey, dbAnswerKeyIdx: undefined, containerIdx: null, matchedLabelCandidates: matchedLabelCandidates}
				};
			}
			// Proceed to Question Type based resolution
		}

		// ---------- NON-SPECIAL (ORDINARY) DB KEYS (General Fields) ----------
		else {

			// ========== DIRECT ANSWER VIA VALUE ==========
			val =
				typeof matchedLabel.value === "function" ?
				matchedLabel.value(question, USER_DB) : 	// Using DB Function
				matchedLabel.value;							// Using static assigned value (schema sets 'undefined' if not function)

			// ========== DIRECT ANSWER VIA DATABASE KEY ==========
			if (val == null) {
				val = resolveAnswerValue(USER_DB, dbAnswerKey, undefined);
			}

			if (val != null) {

				const isStringArray = v => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string');

				const isBooleanForChoiceField = (v, type) =>
					typeof v === 'boolean' &&
					[FIELD_TYPE.RADIO, FIELD_TYPE.CHECKBOX, FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT].includes(type);

				if (typeof val === 'string' || isStringArray(val) || isBooleanForChoiceField(val, question.type)) {

					/** Boolean types (`true`/`false`) are returned for questions type: 
					 * Radio, Checkbox, Select, and Dropdown 
					 * - Try with the most common (Yes/No) option types, 
					 * - Otherwise fallback to subsequent resolution methods on failure. */
					
					/** Convert boolean `val` to "Yes"/"No" for supported field types */
					const shouldConvert =
						(question.type !== FIELD_TYPE.CHECKBOX)
						|| (question.type === FIELD_TYPE.CHECKBOX && resolveValidElements(locators, [FIELD_VALIDATOR[FIELD_TYPE.CHECKBOX]]).length > 1);

					if (typeof val === 'boolean' && shouldConvert) {
						val = val ? 'Yes' : 'No';
					}

					return {
						status: RESOLUTION_STATUS.ANSWERED,
						value: val,
						locators,
						source: "label",
						meta: {dbAnswerKey, dbAnswerKeyIdx: null, containerIdx: null, matchedLabelCandidates: matchedLabelCandidates}
					};

				}
			}
			// Otherwise; proceed to Question Type based resolution
		}
	}
	// Otherwise; proceed to Question Type based resolution


	// ----------- QUESTION TYPE MATCH (DIRECT SIGNAL) -----------
	if ([FIELD_TYPE.TEXT, FIELD_TYPE.DATE].includes(question.type)) {
		if ((question?.labelText ?? '').toLowerCase().includes('birth')) {
			val = resolveBirthDate(locators);
		} else {
			val = resolveTodaysDate(locators);
		}
	}
	if (val == null && [FIELD_TYPE.FILE].includes(question.type)) {
		val = await resolveResume({ignoreLLM: true}); // precision not needed for unknown file type.
	}
	if (
        question.type === 'checkbox'
        && locators.length === 1 
        && containsAny(question?.labelText, ['Acknowledge', 'Confirm', 'I consent', 'I agree', 'I confirm'])
    ) {
        val = true;
    }
	if (val != null) {
		return {
			status: RESOLUTION_STATUS.ANSWERED,
			locators,
			value: val,
			source: "question-type",
			meta: {dbAnswerKey: null, dbAnswerKeyIdx: null, containerIdx: null, matchedLabelCandidates: matchedLabelCandidates}
		};	
	}
	// Otherwise; proceed to Core LLM based resolution


	// ----------- FINAL DECISION: NEEDS LLM -----------
	return {
		status: RESOLUTION_STATUS.NEEDS_LLM,
		promptHint: `Resolve: "${question.label?.textContent?.trim()}"`,
		meta: {matchedLabelCandidates: matchedLabelCandidates}
	};
}

/* --------------------------------------------------------------------------
 * 🛠️ applyCorrection(correction)
 * ------------------------------------------------------------------------ */
async function applyCorrection(correction) {

	switch (correction.type) {

		case CORRECTION_TYPE.REMOVE_WORK_CONTAINER: {

			// `failedWorkExperienceDatabaseIdx`: Persist across all iterations.
			failedWorkExperienceDatabaseIdx.add(correction.dbAnswerKeyIdx); // Skip this database key in upcoming iterations.

			if (!failedWorkExpContainers.has(correction.containerIdx)) { // One time deletion per iteration.
				failedWorkExpContainers.add(correction.containerIdx); // Resets every iteration.
				await removeContainerSimple({
					removeButtonSelector: SELECTORS.EXP_PAGE.workExperienceDeleteButtons,
					index: correction.containerIdx - [...failedWorkExpContainers].filter(i => i < correction.containerIdx).length,
				});
			}
			break;
		}
		
		case CORRECTION_TYPE.REMOVE_EDU_CONTAINER: {

			console.warn(`Correction Requested For Education::: `, {containerIdx: correction.containerIdx, dbAnswerKeyIdx: correction.dbAnswerKeyIdx})
			console.log("Pre correction states failedEducationContainers:::", failedEducationContainers)
			console.log("Pre correction states failedEducationDatabaseIdx", correction.dbAnswerKeyIdx)

			// `failedEducationDatabaseIdx`: Persist across all iterations.
			failedEducationDatabaseIdx.add(correction.dbAnswerKeyIdx); // Skip this database key in upcoming iterations.

			if (!failedEducationContainers.has(correction.containerIdx)) { // One time deletion per iteration.
				failedEducationContainers.add(correction.containerIdx); // Resets every iteration.
				await removeContainerSimple({
					removeButtonSelector: SELECTORS.EXP_PAGE.educationDeleteButtons,
					index: correction.containerIdx - [...failedEducationContainers].filter(i => i < correction.containerIdx).length,
				});
			}
			break;
		}

		case CORRECTION_TYPE.REMOVE_WEBSITE_CONTAINER: {

			// `failedWebsiteDatabaseIdx`: Persist across all iterations.
			failedWebsiteDatabaseIdx.add(correction.dbAnswerKeyIdx); // Skip this database key in upcoming iterations.

			if (!failedWebsiteContainers.has(correction.containerIdx)) { // One time deletion per iteration.
				failedWebsiteContainers.add(correction.containerIdx); // Resets every iteration.
				await removeContainerSimple({
					removeButtonSelector: SELECTORS.EXP_PAGE.websiteDeleteButtons,
					index: correction.containerIdx - [...failedWebsiteContainers].filter(i => i < correction.containerIdx).length,
				});
			}
			break;
		}

		case CORRECTION_TYPE.MARK_QUESTION_FAILED: {

			console.warn("Marking question as failed:", correction.questionId);
			break;
		}
		
		default: {
			console.warn("❓ Unknown correction:", correction);
		}	
	}
}

/* --------------------------------------------------------------------------
 * ✅ isQuestionSet(question)
 * ------------------------------------------------------------------------ */
export function isQuestionSet(question) {

	const locators = FIELD_VALIDATOR.hasOwnProperty(question.type) ? question.fields.filter(FIELD_VALIDATOR[question.type]) : question.fields;
	if (!locators.length) return false;

	switch (question.type) {

		case 'password':
		case 'text':
        case 'email':
        case 'number':
        case 'tel':
        case 'url':
		case 'search':
        case 'textarea':
			const resolveInput = normalizeResolver(locators, { mode: 'single' });
			const input = resolveInput();
			if (!input) return false;
			return input.value.trim() !== '';

		case 'radio':
		    // Multi-mode because radios are multiple elements
			const resolveRadios = normalizeResolver(locators, { mode: 'multi' });
			const radios = resolveRadios();
			if (!radios || !radios.length) return false;
			return radios.some(radio => radio.checked);
		
		case 'checkbox':
			// Multi-mode because checkboxes can be multiple elements
			const resolveCheckboxes = normalizeResolver(locators, { mode: 'multi' });
			const checkboxes = resolveCheckboxes();
			if (!checkboxes || !checkboxes.length) return false;
			return checkboxes.some(checkbox => checkbox.checked);

		case 'dropdown':
			const resolveDropdown = normalizeResolver(locators, { mode: 'single' });
			const dropdown = resolveDropdown();
			if (!dropdown) return false;
			return dropdown?.value ? true : false;

		case 'multiselect':		
			const chipContainerLocator = getChipContainer(locators); // Always treat as single container
			const resolveChipContainer = normalizeResolver(chipContainerLocator, { mode: 'single' });
			const container = resolveChipContainer();
			if (!container) return false;
			const chipSelector = 'li';
			const chips = [...container.querySelectorAll(chipSelector)];
			return chips.length > 0;

		default:
			return false;
	}
}

/* --------------------------------------------------------------------------
 * ❓ getOptions(locators, questionType)
 * ------------------------------------------------------------------------ */
async function getOptions(
	locators, 
	questionType // Can be removed later by creating utility to auto detect from locators (making more modular), but currently the caller has access to it so not need.
) {

	let options = null;

	switch (questionType) {
		case FIELD_TYPE.RADIO: {
			options = (await radioSelect( locators, [], { mode: 'inspect' } )).options;
			break;
		}
		case FIELD_TYPE.CHECKBOX: {
			options = (await checkboxSelect( locators, [], { mode: 'inspect' } )).options;
			break;
		}
		case FIELD_TYPE.DROPDOWN: {
			options = (await dropdownSelect( locators, [], { mode: 'inspect' } )).options;
			break;
		}
		case FIELD_TYPE.SELECT: {
			// FIELD_TYPE.SELECT does not exists in WorkDay
			break;
		}
		default: {
			break;
		}
	}

	return options
}

/* --------------------------------------------------------------------------
 * 🧠 resolveQuestions()
 * ------------------------------------------------------------------------ */
export const resolveQuestions = async (
	page,
	{
		errorOnly = false,
		maxIterations = 6,
		maxAttemptsPerQuestion = 3,
		batchDelayMs = 200,
	} = {}
) => {

	const knownQuestionKeys = getKnownQuestionKeys(page);
	const labelEmbeddingKeys = getLabelEmbeddingKeys(page);

	return resolveATSQuestions(
		// IMPORTANT: preserve getQuestions signature
		(opts = {}) => getQuestions({ ...opts, errorOnly }),

		KNOWN_QUESTIONS,
		knownQuestionKeys,
		labelEmbeddingKeys,

		isQuestionSet,

		getOptions,

		// IMPORTANT: preserve resolveAnswer signature
		(question, locators, matchedQuestion, lek) =>
		resolveAnswer(question, locators, matchedQuestion, lek),

		formManager,
		applyCorrection,
		getJobDetails,

		{
			errorOnly,
			maxIterations,
			maxAttemptsPerQuestion,
			batchDelayMs,
			initNewIteration,
		}
	);
};



// export async function removeErrorContainers() {

// 	await sleep(2)
// 	const errorQuestions = await getQuestions({errorOnly: true});	
// 	for (const errorQuestion of errorQuestions) {
// 		const questionElement = errorQuestion.fields.find(l => l instanceof HTMLElement && l.isConnected) || null;
// 		if (questionElement &&  questionElement?.id?.startsWith('webAddress') && questionElement?.id?.endsWith('url')){
// 			// Get container index
// 			const containerIdx = getContainerIndex({locator: questionElement, containerSelector: SELECTORS.EXP_PAGE.websiteContainers});
// 			// Get database index (to answer this container)
// 			const dbAnswerKeyIdx = getDatabaseIndex(containerIdx, failedWebsiteDatabaseIdx)
// 			await applyCorrection({ type: CORRECTION_TYPE.REMOVE_WEBSITE_CONTAINER, containerIdx, dbAnswerKeyIdx });
// 		}
// 	}
// }
