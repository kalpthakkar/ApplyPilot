// ============================================================================
// 📁 Global Dependencies
// ============================================================================
import { sleep, getTabState, notifyTabState, throwIfAborted, resolveValidElements, getJobId, getKey, getLocalDate, resolveAnswerValue, getNearestAddress, getBestResume, toTimestampTZ, isCurrentlyWorking } from '@shared/utils/utility.js';
import { DB_KEY_MAP } from '@shared/config/config.js';

// ============================================================================
// 📁 Form Dependencies
// ============================================================================
import { FIELD_TYPE, FIELD_VALIDATOR, similarity, filterCheckboxLocators, normalizeResolver, syncContainersSimple, getContainerIndex, getDatabaseIndex, removeContainerSimple, normalizeInputValue, normalizeRadioAnswers, normalizeCheckboxAnswers, normalizeDropdownAnswers } from '@form/formUtils.js';
import { click, clickAll, fillInput, radioSelect, checkboxSelect, selectField, uploadFiles } from '@form/formHandlers.js';
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
// 📁 GreenHouse Dependencies
// ============================================================================
import { SELECTORS, GREENHOUSE_PAGES, KNOWN_QUESTIONS, getKnownQuestionKeys, getLabelEmbeddingKeys } from '@ats/config/greenhouseConfig.js';


// ============================================================================
// 🧩 Config
// ============================================================================
const USER_DB = await (await fetch(chrome.runtime.getURL('web/userData.json'))).json();

const failedEducationDatabaseIdx = new Set(); // Holds DB index
const failedEducationContainers = new Set(); // Holds Container index
const failedWorkExperienceDatabaseIdx = new Set(); // Holds DB index
const failedWorkExpContainers = new Set(); // Holds Container index

const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)
const containsAny = (str, items) => items.some(item => str?.includes(item));


/* --------------------------------------------------------------------------
 * 🍭 getPage()
 * ------------------------------------------------------------------------ */
export async function getPage() {
    if (
        el(SELECTORS[GREENHOUSE_PAGES.APPLICATION_PAGE].form)
    ) {
        return GREENHOUSE_PAGES.APPLICATION_PAGE;
    } else if (
        el(SELECTORS[GREENHOUSE_PAGES.CONFIRMATION_PAGE].confirmationPageIdentifier)
    ) {
        return GREENHOUSE_PAGES.CONFIRMATION_PAGE;
    } else if (
        el(SELECTORS[GREENHOUSE_PAGES.JOB_SEARCH_PAGE].jobSearchPageIdentifier)
    ) {
        return GREENHOUSE_PAGES.JOB_SEARCH_PAGE;
    }
    else if (
        el('[id="main"]')?.textContent?.includes("Sorry, but we can't find that page.")
    ) {
        return GREENHOUSE_PAGES.PAGE_NOT_EXISTS;
    }
    return GREENHOUSE_PAGES.UNKNOWN_PAGE;
}

/* --------------------------------------------------------------------------
 * 🌱 initializePage(page)
 * ------------------------------------------------------------------------ */
export async function initializePage(page) {
    switch (page) {

        case GREENHOUSE_PAGES.APPLICATION_PAGE: {

            if (
                window.location.hostname.startsWith('job-boards.') 
                && window.location.hostname.endsWith('.greenhouse.io')
            ) {
                const jobId = window.location.pathname?.split('/').pop();
                window.location.href = `https://boards.greenhouse.io/embed/job_app?token=${jobId}`;
                await sleep(9); // currently loaded greenshouse module instance will reset
                return true;
            }

			/** ------------------------------------------
			 * 🧬 Sync Work Experience, & Education
			 ------------------------------------------ */

            // ----- Education -----
            // Fetch number of containers already open
            const educationContainerCount = document.querySelectorAll(SELECTORS.APPLICATION_PAGE.educationContainers).length;
            // Get user background from DB
            const userEducationHistoryCount = resolveAnswerValue(USER_DB, DB_KEY_MAP.EDUCATION, []).length;
            // Sync containers with DB edu count
            await syncContainersSimple({ // Sync education experience containers
                currentCount: educationContainerCount,
                targetCount: userEducationHistoryCount - failedEducationDatabaseIdx.size,
                addButtonSelector: SELECTORS.APPLICATION_PAGE.educationAddButton,
                deleteButtonsSelector: SELECTORS.APPLICATION_PAGE.educationDeleteButtons
            });

            // ----- Work Experience -----
            // Fetch number of containers already open
            const workExpContainersCount = document.querySelectorAll(SELECTORS.APPLICATION_PAGE.workExperienceContainers).length;
            // Get user background from DB
            const userWorkExpCount = resolveAnswerValue(USER_DB, DB_KEY_MAP.WORK_EXPERIENCES, []).length;
            // Sync containers with DB work count
            await syncContainersSimple({ // Sync work experience containers
                currentCount: workExpContainersCount,
                targetCount: userWorkExpCount - failedWorkExperienceDatabaseIdx.size,
                addButtonSelector: SELECTORS.APPLICATION_PAGE.workExperienceAddButton,
                deleteButtonsSelector: SELECTORS.APPLICATION_PAGE.workExperienceDeleteButtons
            });
            // Sync: I currently work here (checkboxes)
            const workContainers = document.querySelectorAll(SELECTORS.APPLICATION_PAGE.workExperienceContainers);
            for (let workContainerIdx = 0; workContainerIdx < workContainers.length; workContainerIdx++) {
                const dbAnswerKeyIdx = getDatabaseIndex(workContainerIdx, failedWorkExperienceDatabaseIdx)
                const fullWorkExperience = resolveAnswerValue(USER_DB, DB_KEY_MAP.WORK_EXPERIENCES, []);
                const containerEndDate = resolveAnswerValue(fullWorkExperience[dbAnswerKeyIdx], getKey(DB_KEY_MAP.WORK_EXPERIENCES_END_DATE), undefined);
                if (isCurrentlyWorking(containerEndDate)) {
                    await click(els(SELECTORS.APPLICATION_PAGE.workExperienceCurrentlyWorkingCheckboxes)[workContainerIdx])
                }
            }

            /** ------------------------------------------
             * 🗑️ Remove all pre-uploaded resume files
             ------------------------------------------ */
            for (const deleteFileBtn of els(SELECTORS.APPLICATION_PAGE.deleteFileButtons)) {
                await click(deleteFileBtn);
            }
        }
    }
    return true;
}

/* --------------------------------------------------------------------------
 * 🔰 initNewIteration()
 * ------------------------------------------------------------------------ */
export async function initNewIteration() {
	// Reset container trackers - ensures safe parallel execution. 
	failedWorkExpContainers.length = 0;
	failedEducationContainers.length = 0;
}

/* --------------------------------------------------------------------------
 * 🔍 getQuestions()
 * ------------------------------------------------------------------------ */
async function getQuestions({ errorOnly = null, forceSkipValidatorBank = [] } = {}) {

    /**
     * Find main question containers in the page
     * @returns {NodeListOf<HTMLElement>}
     */
	function findQuestions(errorOnly) {

        if (!errorOnly) {
            return els(`
                [id="main_fields"] div.field, 
                [data-presigned-form="resume"] [type="file"],
                [data-presigned-form="cover_letter"] [type="file"],
                [id="custom_fields"] div.field, 
                [id="demographic_questions"] div.field,
                [id="eeoc_fields"] div.field,
                [id="data_compliance"] div.field
            `);
        }
		const errorAlerts = document.querySelectorAll('[class="field-error-msg"]');
		const questionsWithErrors = new Set();

		errorAlerts.forEach(alert => {
			const questionContainer = alert.closest('div.field');
			if (questionContainer) {
				questionsWithErrors.add(questionContainer);
			}
		});

		return Array.from(questionsWithErrors);
	}

    function getLabelText(question) {
        // ---- Guard: invalid input ---------------------------------------------
        if (!(question instanceof Element)) {
            return ['', ''];
        }

        // ---- Helper: extract text excluding labels that contain inputs ----------
        function getCleanText(container) {
            if (!(container instanceof Element)) return '';

            const clone = container.cloneNode(true);

            clone.querySelectorAll('label').forEach(label => {
                if (label.querySelector('input')) {
                    label.remove();
                }
            });

            return clone.textContent?.trim() ?? '';
        }

        // ---- Step 1: locate label/legend ---------------------------------------
        const tentativeLabel = question.querySelector('label, legend');
        let rawLabelText = '';

        const hasInputLabel =
            tentativeLabel?.querySelector('input') instanceof Element;

        const hasMultipleTopLevelLabels =
            question.querySelectorAll(':scope > label, :scope > legend').length > 1;

        if (hasInputLabel && hasMultipleTopLevelLabels) {
            rawLabelText = getCleanText(question);
        } else {
            rawLabelText = tentativeLabel?.textContent?.trim() ?? '';
        }

        // ---- Step 2: normalize text safely -------------------------------------
        const normalizedText = String(rawLabelText);

        const withoutOptionSuffix =
            normalizedText.split('--')[0].trim();

        const withoutPleaseSelect =
            withoutOptionSuffix.replace(
                /\s+Please select(?!\s+(your|the)\b)[\s\S]*$/i,
                ''
            ).trim();

        const finalLabelText =
            withoutPleaseSelect.split('--')[0].trim();

        // ---- Step 3: split main / sub label safely ------------------------------
        const [mainLabel = '', subLabel = ''] =
            (finalLabelText ?? '').split(/\?\s*\*\s*\n/);

        // ---- Step 4: format return values --------------------------------------
        let labelText = mainLabel.trim();
        const subLabelText = subLabel.trim();

        if (subLabelText) {
            labelText += '? *';
        }

        return [labelText, subLabelText];
    }


	/**
     * Find all associated fields for a given element
     * Handles labels, nested inputs, nearby inputs, and ARIA dropdowns
     * @param {HTMLElement} el 
     * @returns {HTMLElement[]} Array of associated input elements
     */
	function findAssociatedFields(el) {

        const elements = [...el.querySelectorAll('[aria-haspopup="listbox"], [role="combobox"], input, textarea, select')];

        return elements.filter(el => {
            const style = window.getComputedStyle(el);

            if (el.type === 'file') {
                return true;
            }

            if (el.tagName === "INPUT" && el.style.display === 'none' && Boolean(el.getAttribute('data-url'))) {
                return true
            }

            if (el.tagName === 'SELECT') {
                return !el.disabled;
            }

            // Exclude .select2-focusser or other non-select elements
            if (
                el.classList.contains('select2-focusser') 
                || el.classList.contains('select2-offscreen')
                || el.classList.contains('select2-input')
                || el.id.includes('autogen2')
            ) {
                return false; // Exclude custom Select2 elements
            }

            // Exclude hidden or disabled like.
            if (style.display === 'none' || style.visibility === 'hidden' || el.classList.contains('hidden') || el.type === 'hidden' || el.disabled) {
                return false;
            }
            return true;

        });

	}

	/**
	 * Split or preserve fields into logical groups based on modular rules.
	 * @param {HTMLElement[]} fields 
	 * @param {Array<{name:string,test:(el:HTMLElement)=>boolean,splitIndividually?:boolean}>} segregationRules 
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

        const selectEl = fields.find(el =>
			el.tagName === 'SELECT' &&
			!el.disabled
		);
        if (selectEl) return selectEl;

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
			name: 'date-text', 
			test: (el) => el.type === 'text' 
                && (
                    ['[start_date]', '[end_date]', '[month]', '[year]'].some(str => el.getAttribute('name')?.includes(str))
                    || ['DD', 'MM', 'YYYY'].includes(el.getAttribute('placeholder'))
                ),
			splitIndividually: true, // each matching element becomes its own group (`false` to keep matches together)
		}
	];

	for (const question of questions) {
        const [labelText, subLabelText] = getLabelText(question);
        let fields;
        if (!!question.querySelector(`[id="resume_fieldset"]`) || !!question.querySelector(`[data-field="resume"]`)) {
            const resumeField = el(`[data-presigned-form="resume"] [type="file"]`);
            if (!!resumeField) fields = [resumeField]
        } else if (!!question.querySelector(`[id="cover_letter_fieldset"]`) || !!question.querySelector(`[data-field="cover_letter"]`)) {
            const coverLetterField = el(`[data-presigned-form="cover_letter"] [type="file"]`);
            if (!!coverLetterField) fields = [coverLetterField]
        } else {
            fields = findAssociatedFields(question);
        }
		const fieldGroups = createFieldGroups(fields, segregationRules);
		for (fields of fieldGroups) {
            if (resolveValidElements(fields, forceSkipValidatorBank, 'OR').length) continue;
			const baseField = selectBaseField(fields);
			const type = getFieldType(baseField);
            const required = (labelText?.endsWith('*')) ? true : isAnyRequired([question, ...fields]) ? true : false
			if (fields.length) results.push({ labelText, subLabelText, fields, type, required });
		}
	}
	return results;
}

/* --------------------------------------------------------------------------
 * 📄 getJobDetails()
 * ------------------------------------------------------------------------ */
async function getJobDetails() {

    const tabStore = await getTabState();
    const jobDetails = {}

    // Step 1: Extract the raw JSON string from the script tag
    let jsonString = el(`[type="application/ld+json"]`)?.innerHTML ?? '{}';

    // Step 2: Decode any HTML entities (like \u003c or \u003e)
    jsonString = jsonString?.replace(/\\u003c/g, '<')?.replace(/\\u003e/g, '>');

    // Step 3: Parse the string into a JavaScript object
    let jobData = JSON.parse(jsonString);

    // Step 4: Use the parsed object
    
    // JobTitle
    const title = jobData?.title || tabStore?.jobData?.title;
    if (title) jobDetails['title'] = title

    // Company Name
    const company = jobData?.hiringOrganization?.name || tabStore?.jobData?.company
    if (company) jobDetails['company'] = company

    // Job Location
    let locations = [
        [
            el(`[id="header"] [class="location"]`)?.textContent?.trim(),
            jobData?.jobLocation?.address?.addressLocality
        ].filter(Boolean).join(' • ')
    ];
    if (Array.isArray(tabStore?.jobData?.locations)) {
        locations.push(...tabStore.jobData.locations.filter(Boolean));
    }
    if (locations.length) jobDetails['locations'] = locations
    
    // Posting Date
    // const jobPostedDate = jobData?.datePosted
    const publishTimeISO = toTimestampTZ(jobData?.datePosted) || tabStore?.publishTimeISO
    if (publishTimeISO) jobDetails['publishTimeISO'] = publishTimeISO

    // Assuming jobData.description contains HTML string
    let jobDescriptionHTML = jobData?.description;
    let tempDiv = document.createElement("div"); // Create a temporary element to parse the HTML string
    tempDiv.innerHTML = jobDescriptionHTML;
    const jobDescriptionText = tempDiv.textContent || tempDiv.innerText || tabStore?.jobData?.summary; // Extract the plain text
    if (jobDescriptionText) jobDetails['description'] = jobDescriptionText

    if (tabStore?.jobData?.employmentType) jobDetails['employmentType'] = tabStore?.jobData?.employmentType
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
    if (tabStore?.jobId == null) {
        const applyURL = window.location.href;
        const jobDetails = await getJobDetails();

        const soft_data = {
            applyURL: applyURL,
            title: jobDetails?.title,
            company: jobDetails?.company,
            locations: jobDetails?.locations,
            // description: jobDetails?.description,
            publishTimeISO: jobDetails?.publishTimeISO,
        }
        const jobId = await getJobId(applyURL);
        const jobData = await fetchJobDataByKey(jobId.id);
        notifyTabState({
            jobId: jobId,
            jobData: jobData, // fetched from DB - supports automation
            soft_data: soft_data, // scraped from webpage - supports automation & post DB updation
            source: 'greenhouse'
        }, {updateUI: false});
    }
}

/* --------------------------------------------------------------------------
 * 🧠 resolveAnswer(question, locators, matchedQuestion, labelEmbeddingKeys)
 * ------------------------------------------------------------------------ */
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
        const validLocators = resolveValidElements(locators, [FIELD_VALIDATOR.text, (el) => containsAny(el.getAttribute('class'), ['start-date', 'end-date']) || containsAny(el.getAttribute('placeholder'), ['MM', 'YYYY'])], 'AND');
        if (validLocators.length) {
            if (validLocators[0].classList.contains("day") || validLocators[0].getAttribute('placeholder') === 'DD') {
                return getLocalDate('dd');
            }
            else if (validLocators[0].classList.contains("month") || validLocators[0].getAttribute('placeholder') === 'MM') {
                return getLocalDate('mm');
            }
            else if (validLocators[0].classList.contains("year") || validLocators[0].getAttribute('placeholder') === 'YYYY') {
                return getLocalDate('yyyy');
            }
        } else {
            // console.log("Valid Locators NOT Found");
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
        if (hasNestedKey && dbAnswerKey.startsWith(DB_KEY_MAP.ADDRESSES)) { 

            // ========== LOCATION (CITY) ==========
            if (DB_KEY_MAP.CITY.endsWith(dbNestedKey)) { // Location (City)
                const searchQueries = await getLocationSearchQueries();
                return {
                    status: RESOLUTION_STATUS.ANSWERED,
                    value: searchQueries,
                    locators,
                    source: "element",
                    meta: {dbAnswerKey}
                };
            }  

        }
        // ========== EDUCATION ==========
        else if (hasNestedKey && dbAnswerKey.startsWith(DB_KEY_MAP.EDUCATION)) {
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
            const containerIdx = getContainerIndex({locator: questionElement, containerSelector: SELECTORS.APPLICATION_PAGE.educationContainers});
            // Get database index (to answer this container)
            const dbAnswerKeyIdx = getDatabaseIndex(containerIdx, failedEducationDatabaseIdx)
            // Get full education history
            const fullEducationHistory = resolveAnswerValue(USER_DB, DB_KEY_MAP.EDUCATION, []);

            // Does container contain delete button.
            const containDeleteButton = Boolean(els(SELECTORS.APPLICATION_PAGE.educationContainers)[containerIdx].querySelector(SELECTORS.APPLICATION_PAGE.educationDeleteButton))

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
                            return {
                                status: RESOLUTION_STATUS.ANSWERED,
                                value: val,
                                locators,
                                source: "element",
                                meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx}
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

            if (val == null) {
                if (!question.required) {
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
                            return {
                                status: RESOLUTION_STATUS.ANSWERED,
                                value: val,
                                locators,
                                source: "element",
                                meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx}
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
                meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx}
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
            const containerIdx = getContainerIndex({locator: questionElement, containerSelector: SELECTORS.APPLICATION_PAGE.workExperienceContainers});
            // Get database index (to answer this container)
            const dbAnswerKeyIdx = getDatabaseIndex(containerIdx, failedWorkExperienceDatabaseIdx)
            // Get full work history
            const fullWorkExperience = resolveAnswerValue(USER_DB, DB_KEY_MAP.WORK_EXPERIENCES, []);

            // Does container contain delete button.
            const containDeleteButton = Boolean(els(SELECTORS.APPLICATION_PAGE.workExperienceContainers)[containerIdx]?.querySelector(SELECTORS.APPLICATION_PAGE.workExperienceDeleteButton))

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
                                meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx}
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
                                meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx}
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
                meta: {dbAnswerKey, dbAnswerKeyIdx, containerIdx}
            };
        }


        // ========== RESUME ==========
        else if (hasNestedKey && dbAnswerKey.startsWith(DB_KEY_MAP.RESUME)) {

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

            if (val != null) {
                return {
                    status: RESOLUTION_STATUS.ANSWERED,
                    value: val,
                    locators,
                    source: "element",
                    meta: {dbAnswerKey, dbAnswerKeyIdx: null, containerIdx: null}
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
        if (hasNestedKey && dbAnswerKey.startsWith(DB_KEY_MAP.ADDRESSES)) {
            
            let address;
            // Request server via background.js
            if (resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_ADDRESS, false)) address = (await getNearestAddress(await getJobDetails()?.locations));
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
        else if (hasNestedKey && dbAnswerKey.startsWith(DB_KEY_MAP.RESUME)) {
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
        else if (hasNestedKey && dbAnswerKey.startsWith('today')) {

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
        promptHint: `Resolve: "${(question.label?.textContent ?? '').trim()}"`,
        meta: {matchedLabelCandidates: matchedLabelCandidates}
    };
}

/* --------------------------------------------------------------------------
 * 📍 selectLocation
 * ------------------------------------------------------------------------ */
async function getLocationSearchQueries() {
    
    async function buildQueries() {
        // Helper function to generate substrings for a single string
        function substringVariants(text) {
            const words = text.trim().split(/\s+/);
            const result = [];
            for (let i = words.length; i >= 2; i--) result.push(words.slice(0, i).join(" "));
            return result;
        }

        // Fetch job details and extract locations
        const jobDetails = await getJobDetails();  // Await the job details first
        let locations = jobDetails?.locations;     // Now access locations safely

        // Debugging: Log the locations to see what is being returned
        // console.log("Fetched locations:", locations);

        // Ensure locations is always an array, even if null or undefined
        if (!Array.isArray(locations)) {
            // console.error("Invalid data: locations should be an array or empty.");
            locations = [];  // Set locations to an empty array for safety
        }

        if (locations.length === 0) {
            // console.warn("No locations provided. Returning empty query.");
            return [];  // Return empty array if no locations are provided
        }

        // Initialize an empty array to store all queries
        const allQueries = [];

        // Process each location and generate its substring variants
        for (const location of locations) {
            // Ensure that location is a non-empty string
            if (typeof location !== "string" || location.trim() === "") {
                // console.warn(`Invalid location entry: "${location}". Skipping this entry.`);
                continue;
            }

            // Generate substring variants for each valid location
            const locationQueries = substringVariants(location);
            // console.log(`Generated variants for "${location}":`, locationQueries); // Log the generated substrings
            allQueries.push(...locationQueries);  // Append location-specific queries to the final result
        }

        return allQueries;  // Return the combined list of queries
    }

    const tabState = await getTabState();
    let searchQueries = tabState?.locationSearchQueries;
    if (Array.isArray(searchQueries) && searchQueries?.length > 0) {
        return searchQueries;
    }

    // Logic to build optimized location search query.
    searchQueries = await buildQueries();
    const primaryAddress = resolveAnswerValue(USER_DB, DB_KEY_MAP.ADDRESSES)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_ADDRESS_CONTAINER_IDX))]
    if (primaryAddress['state'] && primaryAddress['country']) searchQueries.push(primaryAddress['state'] + ', ' + primaryAddress['country']);
    if (primaryAddress['city'] && primaryAddress['state']) searchQueries.push(primaryAddress['city'] + ', ' + primaryAddress['state']);
    if (primaryAddress['city']) searchQueries.push(primaryAddress['city']);
    notifyTabState({ locationSearchQueries: searchQueries }, { updateUI: false });
    return searchQueries;

}

export async function selectLocation({threshold = 80, queries = null, selectAtLeastOne = true, layers = 'locality,localadmin,borough', apiKey = 'ge-39f1178289d5d0c5' } = {}) {

    const input = el(`[name="job_application[location]"]`);
    if (!(input instanceof HTMLInputElement)) return;


    queries = queries ?? await getLocationSearchQueries();
    if (!(Array.isArray(queries) && queries.length > 0)) queries = ["Remote"]

    const autoComplete = input.closest('auto-complete');
    if (!autoComplete) return;

    const baseUrl =
        autoComplete.dataset.baseUrl ||
        'https://api-geocode-earth-proxy.greenhouse.io/';

    const endpoint = `${baseUrl}v1/autocomplete`;

    let bestOverall = null;

    /* -------------------------------------------------- */
    /* Helpers                                            */
    /* -------------------------------------------------- */

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function fetchFeatures(text) {
        const url =
            `${endpoint}?api_key=${apiKey}` +
            `&layers=${encodeURIComponent(layers)}` +
            `&text=${encodeURIComponent(text)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Pelias fetch failed');
        const json = await res.json();
        return json?.features || [];
    }

    function rank(query, features) {
        return features
            .map(f => ({
                feature: f,
                label: f.properties?.label || '',
                score: similarity(query, f.properties?.label || '')
            }))
            .filter(r => r.label)
            .sort((a, b) => b.score - a.score);
    }

    function dispatchRealClick(el) {
        const rect = el.getBoundingClientRect();
        const opts = {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            pointerType: 'mouse',
            isPrimary: true
        };

        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    async function commitByClick(label) {
        input.focus();
        input.value = label;
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));

        await sleep(1250); // allow dropdown to render

        const options = Array.from(
            autoComplete.querySelectorAll('li[role="option"]')
        );

        // const target = options.find(
        //     li => li.textContent.trim() === label
        // );
        const target = options[0];

        if (!target) {
            throw new Error('Option not found in dropdown');
        }

        dispatchRealClick(target);
        await sleep(100);

        return true;
    }

    /* -------------------------------------------------- */
    /* Main search loop                                   */
    /* -------------------------------------------------- */
    for (const q of queries.filter(Boolean)) {
        let features;
        try {
            features = await fetchFeatures(q);
        } catch {
            continue;
        }

        if (!features.length) continue;

        const ranked = rank(q, features);
        if (!ranked.length) continue;

        const best = ranked[0];

        if (!bestOverall || best.score > bestOverall.score) {
            bestOverall = best;
        }

        if (best.score >= threshold) {
            await commitByClick(best.label);
            return { label: best.label, forced: false };
        }
    }

    /* -------------------------------------------------- */
    /* Fallback logic                                     */
    /* -------------------------------------------------- */

    if (selectAtLeastOne) {
        if (bestOverall) {
            await commitByClick(bestOverall.label);
            return { label: bestOverall.label, forced: true };
        }

        const features = await fetchFeatures('');
        if (features.length) {
            const label = features[0].properties?.label;
            if (label) {
                await commitByClick(label);
                return { label, forced: true };
            }
        }
    }

    return null;
}

/* --------------------------------------------------------------------------
 * 🎓 resolveAndSelectBestOption
 * ------------------------------------------------------------------------ */
/**
 * Robust similarity-based option resolution for async Select2-style endpoints.
 * Designed for automation-safe form filling (Workday-style UIs).
 *
 * -----------------------------------------------------------------------------------------
 * FEATURES
 * -----------------------------------------------------------------------------------------
 * • Multi-query search with early exit on threshold hit
 * • Similarity scoring using deterministic helper (similarity)
 * • Best-match preservation across failed queries
 * • Threshold-based acceptance
 * • Optional forced selection (selectAtLeastOne)
 * • Safe fallback to empty search when no results are found
 * • Updates hidden input value + visible Select2 label
 *
 * -----------------------------------------------------------------------------------------
 * PARAMETERS
 * -----------------------------------------------------------------------------------------
 * @param {HTMLInputElement} locator
 *   → The hidden Select2-backed input element
 *
 * @param {string[]} queries
 *   → Ordered list of candidate query strings (priority order)
 *
 * @param {Object} options
 * @param {number} [options.threshold=80]
 *   → Minimum similarity score required to accept a match
 *
 * @param {boolean} [options.selectAtLeastOne=false]
 *   → If true, guarantees a selection even when threshold is not met
 *
 * @param {number} [options.page=1]
 *   → Pagination page (if supported by API)
 *
 * -----------------------------------------------------------------------------------------
 * RETURNS
 * -----------------------------------------------------------------------------------------
 * @returns {Promise<{
 *   id: string | number,
 *   text: string,
 *   score: number,
 *   forced: boolean
 * } | null>}
 *
 * =========================================================================================
 */
// ---------- USAGE ----------
// await resolveAndSelectBestOption(
//     document.querySelector(
//         'input[name="job_application[educations][][school_name_id]"]'
//     ),
//     [
//         'University of Central Florida',
//         'UCF',
//         'Central Florida University'
//     ],
//     {
//         threshold: 82,
//         selectAtLeastOne: true
//     }
// );
async function selectSchoolName(locator, queries = [], {threshold = 80, selectAtLeastOne = false, page = 1} = {}) {
    
    if (!(locator instanceof HTMLInputElement)) {
        throw new Error('resolveAndSelectBestOption(): hiddenInput must be an HTMLInputElement');
    }

    const dataUrl = locator.getAttribute('data-url');
    if (!dataUrl) {
        console.warn('⚠️ No data-url found on hidden input');
        return null;
    }

    // Normalize queries
    const searchQueries = Array.isArray(queries)
        ? queries.filter(q => typeof q === 'string' && q.trim())
        : [];

    let bestOverall = null; // { id, text, score }

    /**
     * ---------------------------------------------
     * 🔍 Fetch options for a given search term
     * ---------------------------------------------
     */
    async function fetchOptions(term) {
        const url =
            term != null
                ? `${dataUrl}?term=${encodeURIComponent(term)}&page=${page}`
                : `${dataUrl}?page=${page}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = await res.json();
        return Array.isArray(data?.items) ? data.items : [];
    }

    /**
     * ---------------------------------------------
     * 🧠 Score options using similarity()
     * ---------------------------------------------
     */
    function scoreOptions(query, items) {
        return items
            .map(item => {
                if (!item?.text) return null;
                return {
                    id: item.id,
                    text: item.text,
                    score: similarity(query, item.text)
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
    }

    /**
     * ---------------------------------------------
     * 🎯 Apply selection to DOM
     * ---------------------------------------------
     */
    function applySelection(option, forced = false) {
        locator.value = option.id;

        const field = locator.closest('.field');
        if (field) {
            const chosen = field.querySelector('.select2-chosen');
            if (chosen) chosen.textContent = option.text;
        }

        return {
            ...option,
            forced
        };
    }

    // =====================================================================================
    // 🔁 MAIN SEARCH LOOP (priority-based)
    // =====================================================================================
    for (const query of searchQueries) {
        let items;
        try {
            items = await fetchOptions(query);
        } catch (err) {
            console.warn('⚠️ Fetch failed for query:', query, err);
            continue;
        }

        if (!items.length) continue;

        const ranked = scoreOptions(query, items);
        if (!ranked.length) continue;

        const top = ranked[0];

        // Preserve best overall match
        if (!bestOverall || top.score > bestOverall.score) {
            bestOverall = top;
        }

        // Early exit if threshold satisfied
        if (top.score >= threshold) {
            return applySelection(top, false);
        }
    }

    // =====================================================================================
    // 🧯 FALLBACK LOGIC
    // =====================================================================================
    if (selectAtLeastOne) {

        // 1️⃣ Use best overall match (even below threshold)
        if (bestOverall) {
            return applySelection(bestOverall, true);
        }

        // 2️⃣ No queries or no results → empty search fallback
        try {
            const items = await fetchOptions(null);
            if (items.length) {
                const fallback = {
                    id: items[0].id,
                    text: items[0].text,
                    score: 0
                };
                return applySelection(fallback, true);
            }
        } catch (err) {
            console.warn('⚠️ Fallback empty search failed', err);
        }
    }

    // ❌ Nothing selected
    return null;
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

    /* ------------------------------------------
    * 🧫 Handle Exceptional Known Questions
    * ------------------------------------------ */
    const knownQuestionLocationCity = resolveValidElements(locators, [FIELD_VALIDATOR.text, (el) => el.getAttribute('name') == 'job_application[location]'], 'AND');
    if (knownQuestionLocationCity.length) {
        return async () => {  /** Resolved right before Click - not during parallel execution because dropdown, etc unsets the selected location  */
            let response;
            try {
                // function throws error / or / returns null or {label: string, forced: bool}
                response = await selectLocation({ threshold: 60, queries: val, selectAtLeastOne: (question.required) ? true : false })  
            }
            catch (err) {
                return {
                    status: EXECUTION_STATUS.ERROR,
                    reason: `Failed to execute 'selectLocation' function. Tried values: ${val}`,
                    error: err.message
                };              
            }
            if (response == null && question.required) {
                return {
                    status: EXECUTION_STATUS.ERROR,
                    reason: `Failed to select location. Tried values: ${val}`,
                    error: `Failed to select location.`
                };
            }
            return { status: EXECUTION_STATUS.OK };
        };
    }

    const knownQuestionSchoolName = resolveValidElements(locators, [(el) => el.getAttribute('name') === "job_application[educations][][school_name_id]" || el.id?.startsWith('education_school_name_')], 'AND');
    if (knownQuestionSchoolName.length) {
        let normalizedAnswers;
        try {
            normalizedAnswers = normalizeDropdownAnswers(val);
            normalizedAnswers.push('Other')
        } catch (err) {
            if (question.required)
            return async () => { 
                return {
                    status: EXECUTION_STATUS.ERROR,
                    reason: `Failed to normalize value: ${val}`,
                    error: err.message
                };
            };
        }
        return async () => { 
            let response;
            try {
                response = await selectSchoolName(knownQuestionSchoolName[0], normalizedAnswers, { threshold: 60,  selectAtLeastOne: (question.required) ? true : false });
            }
            catch (err) {
                return {
                    status: EXECUTION_STATUS.ERROR,
                    reason: `Failed to execute 'selectSchoolName' function. Tried values: ${normalizedAnswers}`,
                    error: err.message
                }; 
            }
            if (response == null && question.required) {
                return {
                    status: EXECUTION_STATUS.ERROR,
                    reason: `Failed to select school name. Tried values: ${normalizedAnswers}`,
                    error: `Failed to select school name.`
                };
            }
            return { status: EXECUTION_STATUS.OK };

        };
    }

    /* ------------------------------------------
    * 🧫 Handle General Questions
    * ------------------------------------------ */
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

            if (question?.label?.textContent.includes('salary')) {
                console.log("SALARY QUESTION... LEFT-ATTEMPT:", payload.remainingAttempts)
            }
            if (
                payload.remainingAttempts === 1 
                && (
                    question?.label?.textContent.includes('salary')
                    || question?.label?.textContent.includes('compensation')
                )
            ) {
                console.log("SALARY QUESTION IN INIT VAL...", normalizedValue, ' || Type:', typeof normalizedValue)
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
                console.log("SALARY QUESTION IN FINAL VAL...", normalizedValue, " || Type: ", typeof normalizedValue)
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
            else if (optionCount <= 8) threshold = question.required ? 85 : 85;
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
                    
                    // ... add logic here
                    
                    return maxSelections;
                }

                let maxSelections = maxSelectionSettings();
                if ((payload?.remainingAttempts == 0) && question.required && ( maxSelections === 0 )) {
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

        case 'select': {

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
                        reason: "No usable <select> answers.",
                    };
                };
            }

            let threshold = question.required 
                ? 75  // Need confidence on options as well, else rely on LLM. 
                : 75; // Select the best from candidates whose match is above this threshold (note: could be 0 such options - leading no selection).

            if ((payload?.remainingAttempts == 0) && question.required ) {
                threshold = 0  // Select the best option (ensures atleast one selection)
            }
            
            const blacklist = ["Please select", "Select One", "--"];

            return async () => {
                const res = await selectField(
                    locators, 
                    normalizedAnswers, 
                    {
                        threshold: threshold, 
                        useAverage: false,
                        blacklist: blacklist,
                        mode: 'select', 
                    }
                );
                if (!res?.success) {
                    return {
                        status: EXECUTION_STATUS.ERROR,
                        reason: "select_failed",
                        meta: { value: normalizedAnswers, options: res?.options ?? (Array.isArray(res?.ranked) ? [...new Set(res.ranked.map(r => r.text))] : []) }
                    };
                }
                return { status: EXECUTION_STATUS.OK };
            };
        }

        case 'file': {

            return async () => {

                const res = await uploadFiles(locators, val, {filenameSelector: `[id="resume_filename"], [id="cover_letter_filename"]`, allowMultiple: false});

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
 * 🧼 applyCorrection(correction)
 * ------------------------------------------------------------------------ */
async function applyCorrection(correction) {

    switch (correction.type) {
        
        case CORRECTION_TYPE.REMOVE_EDU_CONTAINER: {

			// `failedEducationDatabaseIdx`: Persist across all iterations.
			failedEducationDatabaseIdx.add(correction.dbAnswerKeyIdx); // Skip this database key in upcoming iterations.

            if (!failedEducationContainers.has(correction.containerIdx)) { // One time deletion per iteration.
                failedEducationContainers.add(correction.containerIdx); // Resets every iteration.
                await removeContainerSimple({
                    removeButtonSelector: SELECTORS.APPLICATION_PAGE.educationDeleteButtons,
                    index: correction.containerIdx - [...failedEducationContainers].filter(i => i < correction.containerIdx).length,
                });
            }
            break;
        }

        case CORRECTION_TYPE.REMOVE_WORK_CONTAINER: {

            // `failedWorkExperienceDatabaseIdx`: Persist across all iterations.
			failedWorkExperienceDatabaseIdx.add(correction.dbAnswerKeyIdx); // Skip this database key in upcoming iterations.

            if (!failedWorkExpContainers.has(correction.containerIdx)) { // One time deletion per iteration.
                failedWorkExpContainers.add(correction.containerIdx); // Resets every iteration.
                await removeContainerSimple({
                    removeButtonSelector: SELECTORS.APPLICATION_PAGE.workExperienceDeleteButtons,
                    index: correction.containerIdx - [...failedWorkExpContainers].filter(i => i < correction.containerIdx).length,
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

    /* ------------------------------------------
    * 🧫 Handle Exceptional Known Questions
    * ------------------------------------------ */ 
    const knownQuestionLocationCity = resolveValidElements(locators, [FIELD_VALIDATOR.text, (el) => el.getAttribute('name') == 'job_application[location]'], 'AND');
    if (knownQuestionLocationCity.length) {
        const resolveInputSelect = normalizeResolver(knownQuestionLocationCity, { mode: 'single' });
        const inputEl = resolveInputSelect();
        return Boolean(inputEl?.closest('div.field')?.querySelector(`[id="job_application_location"]`)?.value);
    }
    
    /* ------------------------------------------
    * 🧫 Handle Exceptional Known Questions
    * ------------------------------------------ */ 
    const knownQuestionSchoolName = resolveValidElements(locators, [(el) => el.getAttribute('name') === "job_application[educations][][school_name_id]" || el.id?.startsWith('education_school_name_')], 'AND');
    if (knownQuestionSchoolName.length) {
        const resolveInputSelect = normalizeResolver(knownQuestionSchoolName, { mode: 'single' });
        const inputSelect = resolveInputSelect();
        return !!inputSelect.value;
    }
    
    /* ------------------------------------------
    * 🧫 Handle General Questions
    * ------------------------------------------ */
    switch (question.type) {

        case 'password':
        case 'text':
        case 'email':
        case 'number':
        case 'tel':
        case 'url':
        case 'search':
        case 'textarea': {
            const resolveInput = normalizeResolver(locators, { mode: 'single' });
            const input = resolveInput();
            if (!input) return false;
            return input.value.trim() !== '';
        }

        case 'radio': {
            // Multi-mode because radios are multiple elements
            const resolveRadios = normalizeResolver(locators, { mode: 'multi' });
            const radios = resolveRadios();
            if (!radios || !radios.length) return false;
            return radios.some(radio => radio.checked);
        }
        
        case 'checkbox': {
            // Multi-mode because checkboxes can be multiple elements
            const resolveCheckboxes = normalizeResolver(locators, { mode: 'multi' });
            const checkboxes = resolveCheckboxes();
            if (!checkboxes || !checkboxes.length) return false;
            return checkboxes.some(checkbox => checkbox.checked);
        }

        case 'select': {
            const resolveSelect = normalizeResolver(locators, { mode: 'single' });
            const select = resolveSelect();
            if (!(select instanceof HTMLSelectElement)) return false;
            return !!select.value;
        }

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

    /* ------------------------------------------
    * 🧫 Handle Exceptional Known Questions
    * ------------------------------------------ */ 
    const knownQuestionSchoolName = resolveValidElements(locators, [(el) => el.getAttribute('name') === "job_application[educations][][school_name_id]" || el.id?.startsWith('education_school_name_')], 'AND');
    if (knownQuestionSchoolName.length) {
        return [];
    }

    /* ------------------------------------------
    * 🧫 Handle General Questions
    * ------------------------------------------ */
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
		case FIELD_TYPE.SELECT: {
			options = (await selectField( locators, [], { mode: 'inspect' } )).options;
			break;
		}
		case FIELD_TYPE.DROPDOWN: {
			// FIELD_TYPE.DROPDOWN does not exists in Greenhouse
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
}


/* --------------------------------------------------------------------------
 * 🧠 fetchGreenhouseVerificationPasscode()
 * ------------------------------------------------------------------------ */
export async function fetchGreenhouseVerificationPasscode() {
    console.group('[Greenhouse] fetchVerificationPasscode');

    let attempt = 0;
    const maxAttempts = 3;
    let waitTime = 4;

    while (attempt < maxAttempts) {
        attempt++;
        console.log(`[Greenhouse] Checking Gmail (Attempt ${attempt}/${maxAttempts})...`);

        const response = await chrome.runtime.sendMessage({
            action: 'fetchRecentVerificationPasscode',
            query: '(from:greenhouse) and is:unread ',
            topKSearch: 2,
            maxAgeMinutes: 1,
        });

        if (response?.success && response.passcode) {
            console.log('[Greenhouse] ✅ Passcode found:', response.passcode);
            console.groupEnd();
            return response.passcode;
        }

        console.log(`[Greenhouse] No passcode yet — retrying in ${waitTime}s...`);
        await sleep(waitTime);
        waitTime = Math.min(waitTime * 2, 20);
    }

    console.warn('[Greenhouse] Verification passcode not found.');
    console.groupEnd();
    return null;
}

export async function resolveSecurityCodeQuestion(passCode) {

    if (!passCode) return false;

    // Fill Passcode
    const res = await fillInput(
        el(SELECTORS[GREENHOUSE_PAGES.APPLICATION_PAGE].securityCodeInput), 
        passCode, 
        {dispatchFocus: true}
    );

    // Return result
    if (!res?.success) {
        return false;
    }
    return true;
}



