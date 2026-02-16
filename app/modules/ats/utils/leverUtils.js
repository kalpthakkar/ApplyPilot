// ============================================================================
// 📁 Global Dependencies
// ============================================================================
import { sleep, getTabState, notifyTabState, throwIfAborted, resolveValidElements, getJobId, getKey, getLocalDate, resolveAnswerValue, getNearestAddress, getBestResume, stringToJson, toTimestampTZ, isCurrentlyWorking } from '@shared/utils/utility.js';
import { DB_KEY_MAP } from '@shared/config/config.js';

// ============================================================================
// 📁 Form Dependencies
// ============================================================================
import { FIELD_TYPE, FIELD_VALIDATOR, similarity, filterCheckboxLocators, normalizeResolver, syncContainersSimple, getContainerIndex, getDatabaseIndex, removeContainerSimple, normalizeInputValue, normalizeRadioAnswers, normalizeCheckboxAnswers, normalizeDropdownAnswers, resolveResume, forceCommitFields } from '@form/formUtils.js';
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
// 📁 Lever Dependencies
// ============================================================================
import { SELECTORS, LEVER_PAGES, KNOWN_QUESTIONS, getKnownQuestionKeys, getLabelEmbeddingKeys } from '@ats/config/leverConfig.js';


// ============================================================================
// 🧩 Config
// ============================================================================
const USER_DB = await (await fetch(chrome.runtime.getURL('web/userData.json'))).json();

const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)
const containsAny = (str, items) => items.some(item => str?.includes(item));


/* --------------------------------------------------------------------------
 * 🍭 getPage()
 * ------------------------------------------------------------------------ */
export async function getPage() {
    if (
        el(SELECTORS[LEVER_PAGES.APPLICATION_PAGE].submitButton)
    ) {
        return LEVER_PAGES.APPLICATION_PAGE;
    } else if (
        el(SELECTORS[LEVER_PAGES.DESCRIPTION_PAGE].descriptionPageIdentifier)
    ) {
        return LEVER_PAGES.DESCRIPTION_PAGE;
    } else if (
        el(SELECTORS[LEVER_PAGES.CONFIRMATION_PAGE].confirmationPageIdentifier)
        || (window.location.pathname).endsWith('/thanks')
    ) {
        return LEVER_PAGES.CONFIRMATION_PAGE;
    } else if (
        el(SELECTORS[LEVER_PAGES.JOB_SEARCH_PAGE].jobSearchPageIdentifier)
        || (window.location.pathname).endsWith('/careers')
    ) {
        return LEVER_PAGES.JOB_SEARCH_PAGE;
    } else if (
        el(SELECTORS[LEVER_PAGES.CLOUDFLARE_ERROR_PAGE].cloudflareErrorPageIdentifier)
    ) {
        return LEVER_PAGES.CLOUDFLARE_ERROR_PAGE;
    }     
    return LEVER_PAGES.UNKNOWN_PAGE;
}

/* --------------------------------------------------------------------------
 * 🌱 initializePage(page)
 * ------------------------------------------------------------------------ */
export async function initializePage(page) {
    switch (page) {

        case LEVER_PAGES.APPLICATION_PAGE: {

            /** ------------------------------------------
             * 📁 Upload Resume
             ------------------------------------------ */
            if (el(`input[name="resume"]`)) {
                const resumePath = await resolveResume(
                    resolveAnswerValue(USER_DB, DB_KEY_MAP.RESUME)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_RESUME_CONTAINER_IDX))], 
                    await getJobDetails(),
                    { 
                        ignoreLLM: !Boolean(resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_RESUME, false)),
                        timeoutSeconds: 15
                    }
                );
                if (resumePath) {
                    const res = await uploadFiles(
                        [el(`input[name="resume"]`)], 
                        resumePath, 
                        {
                            filenameSelector: '.application-form .application-question.resume .filename', 
                            progressSelector: `.application-form .application-question.resume .resume-upload-success[style]:not([style='']):not([style='display: inline;'])`, 
                            timeout: 15000,
                            allowMultiple: false
                        }
                    );
                    await sleep(2); // Allow DOM to settle
                    if (!res.success) {
                        console.warn(`⚠️ Failed to upload resume. Response:`, res)
                        return false;
                        // return true; // Patch - response likely incorrect | inefficient upload detection
                    }
                } else {
                    console.warn(`⚠️ Failed fetching resume path.`)
                }
            }

            return true;
        }
    }
    return true;
}

/* --------------------------------------------------------------------------
 * 🔰 initNewIteration()
 * ------------------------------------------------------------------------ */
export async function initNewIteration() {
    // pass
}

/* --------------------------------------------------------------------------
 * 🔍 getQuestions()
 * ------------------------------------------------------------------------ */
export async function getQuestions({ errorOnly = null, forceSkipValidatorBank = [] } = {}) {

    async function getAllQuestions({ forceSkipValidatorBank = [] } = {}) {

        /**
         * Find main question containers in the page
         * @returns {NodeListOf<HTMLElement>}
         */
        function findQuestions() {
            // Constrained: .application-form ul li.application-question
            return els(`
                .application-form .application-question,
                .application-form .application-additional
            `);
        }
        
        function getLabelText(question) {
            // ---- Guard: invalid input ---------------------------------------------
            if (!(question instanceof Element)) {
                return '';
            }

            // ---- Helper: extract text excluding labels that contain inputs ----------
            function getCleanText(container) {
                if (container.classList.contains('application-additional')) {
                    return 'Additional information';
                }

                let labelText = container
                    .querySelector('.application-label, .default-label')
                    ?.textContent?.trim() ?? '';

                if (
                    labelText === '' &&
                    container.querySelectorAll('label').length === 1
                ) {
                    labelText = container
                    .querySelector('label')
                    ?.textContent?.trim() ?? '';
                }

                return labelText;
            }


            // ---- Step 1: locate label/legend ---------------------------------------
            const rawLabelText = getCleanText(question)

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


            // ---- Step 4: format return values --------------------------------------
            let labelText = finalLabelText.trim();

            return labelText;
        }


        /**
         * Find all associated fields for a given element
         * Handles labels, nested inputs, nearby inputs, and ARIA dropdowns
         * @param {HTMLElement} el 
         * @returns {HTMLElement[]} Array of associated input elements
         */
        function findAssociatedFields(el) {

            // 'surveysResponse' are hidden fields
            const elements = [
                ...el.querySelectorAll(
                    "input:not([name^='surveysResponse']), \
                    textarea:not([name^='surveysResponse']), \
                    select:not([name^='surveysResponse'])"
                )
            ];
            // const elements = [...el.querySelectorAll('input, textarea, select')];

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
        const questions = findQuestions();
        const segregationRules = [];
        for (const question of questions) {
            const labelText = getLabelText(question);
            let fields;
            fields = findAssociatedFields(question);
            const fieldGroups = createFieldGroups(fields, segregationRules);
            for (fields of fieldGroups) {
                if (resolveValidElements(fields, forceSkipValidatorBank, 'OR').length) continue;
                const baseField = selectBaseField(fields);
                const type = getFieldType(baseField);
                const required = (labelText?.endsWith('*')) ? true : isAnyRequired([question, ...fields]) ? true : false
                if (fields.length) results.push({ labelText, fields, type, required });
            }
        }
        return results;
    }

    const allQuestions = await getAllQuestions({forceSkipValidatorBank});
    if (!errorOnly) {
        return allQuestions
    } else {
        return allQuestions.filter(q => q.required && !isQuestionSet(q));
    }
}

/* --------------------------------------------------------------------------
 * 📄 getJobDetails()
 * ------------------------------------------------------------------------ */
async function getJobDetails() {

    const tabStore = await getTabState();
    const jobDetails = {};
    const jobData = stringToJson(el(`[data-qa="additional-cards"] input`)?.getAttribute('value'));

    // JobTitle
    const title = el(`.posting-header h2`)?.textContent || el(`head [property="og:title"]`)?.getAttribute(`content`) || tabStore?.jobData?.title;
    if (title) jobDetails['title'] = title

    // Company Name
    const company = el(`.main-header-logo img`)?.getAttribute('alt')?.split(' logo')[0]?.trimEnd() || tabStore?.jobData?.company
    if (company) jobDetails['company'] = company

    // Job Location
    let locations = [];
    let location = el(`.posting-header .posting-categories .location`)?.textContent;
    if (location) {
        locations.push(location)
    }
    if (Array.isArray(tabStore?.jobData?.locations)) {
        locations.push(...tabStore.jobData.locations.filter(Boolean));
    }
    if (locations.length) jobDetails['locations'] = locations
    
    // Posting Date
    // const jobPostedDate = jobData?.datePosted
    const publishTimeISO = toTimestampTZ(jobData?.createdAt) || tabStore?.publishTimeISO
    if (publishTimeISO) jobDetails['publishTimeISO'] = publishTimeISO

    // Assuming jobData.description contains HTML string
    const jobSummary = el(`head [property="og:description"]`)?.getAttribute(`content`)
    if (jobSummary) jobDetails['summary'] = jobSummary
    const jobDescription = jobSummary || tabStore?.jobData?.summary; // Extract the plain text
    if (jobDescription) jobDetails['description'] = jobDescription

    // Employment Type
    const employmentType = el(`.posting-header .posting-categories .commitment`)?.textContent?.replace(/[\s/]+$/, '') || tabStore?.jobData?.employmentType;
    if (employmentType) jobDetails['employmentType'] = employmentType
    
    // Work Modal
    const workModal = el(`.posting-header .posting-categories .workplaceTypes`)?.textContent?.replace(/[\s/]+$/, '') || tabStore?.jobData?.workModel;
    if (workModal) jobDetails['workModel'] = workModal;

    if (tabStore?.jobData?.seniority) jobDetails['seniority'] = tabStore?.jobData?.seniority
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
        let applyURL;
        if ((el(`.posting-header a.postings-btn`)?.getAttribute('href') ?? '').endsWith('/apply')) {
            applyURL = el(`.posting-header a.postings-btn`)?.getAttribute('href');
        } else if ((el(`[property="og:url"]`)?.getAttribute('content') ?? '').endsWith('/apply')) {
            applyURL = el(`[property="og:url"]`)?.getAttribute('content');
        } else {
            applyURL = window.location.href;    
        }
        const jobDetails = await getJobDetails();

        const soft_data = {
            applyURL: applyURL,
            title: jobDetails?.title,
            company: jobDetails?.company,
            locations: jobDetails?.locations,
            summary: jobDetails?.summary,
            employmentType: jobDetails?.employmentType,
            workModel: jobDetails?.workModel,
            publishTimeISO: jobDetails?.publishTimeISO,
        }
        const jobId = await getJobId(applyURL);
        const jobData = await fetchJobDataByKey(jobId.id);
        notifyTabState({
            jobId: jobId,
            jobData: jobData, // fetched from DB - supports automation
            soft_data: soft_data, // scraped from webpage - supports automation & post DB updation
            source: 'lever'
        }, {updateUI: false});
    }
}

/* --------------------------------------------------------------------------
 * 🧠 resolveAnswer(question, locators, matchedQuestion, labelEmbeddingKeys)
 * ------------------------------------------------------------------------ */
async function resolveAnswer(question, locators, matchedQuestion, labelEmbeddingKeys) {

    let val;
    let dbAnswerKey;
    const jobData = await getJobDetails();

    // ----------- ELEMENT MATCH (STRONGEST SIGNAL) -----------
    if (matchedQuestion) {

        // Push new locators if explicitly provided (locators <- Push Array[string Selectors])
        if (matchedQuestion.hasOwnProperty("locators")) locators.push(...matchedQuestion.locators);

        dbAnswerKey = matchedQuestion?.dbAnswerKey;
        const hasNestedKey = (dbAnswerKey?.split(".").length > 1);
        const dbNestedKey = dbAnswerKey?.split(".")[1];
        
        // ---------- SPECIAL DB KEYS ----------

        // ========== CURRENT LOCATION ==========
        if (dbAnswerKey === DB_KEY_MAP.ADDRESSES) { 
            const searchQueries = await getLocationSearchQueries();
            return {
                status: RESOLUTION_STATUS.ANSWERED,
                value: searchQueries,
                locators,
                source: "element",
                meta: {dbAnswerKey}
            };
        }

        // ========== RESUME ==========
        else if (hasNestedKey && dbAnswerKey.startsWith(DB_KEY_MAP.RESUME)) {
            return {
                status: RESOLUTION_STATUS.SKIPPED,
                reason: "Resume resolved during initialiation step.",
            }
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
            if (resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_ADDRESS, false)) address = (await getNearestAddress(jobData?.locations));
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
            const val = await resolveResume(
                resolveAnswerValue(USER_DB, DB_KEY_MAP.RESUME)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_RESUME_CONTAINER_IDX))], 
                jobData,
                { 
                    ignoreLLM: resolveAnswerValue(USER_DB, DB_KEY_MAP.USE_LLM_RESUME, false) 
                }
            );
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
    if (val == null && [FIELD_TYPE.FILE].includes(question.type)) {
        val = await resolveResume(
            resolveAnswerValue(USER_DB, DB_KEY_MAP.RESUME)[Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_RESUME_CONTAINER_IDX))], 
            jobData,
            { 
                ignoreLLM: true // precision not needed for unknown file type.
            }
        );
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



/* -------------------------------------------------------------------------- */
/* 📍 getLocationSearchQueries                                               */
/* -------------------------------------------------------------------------- */

async function getLocationSearchQueries() {

    async function buildQueries() {

        function substringVariants(text) {
            const words = text.trim().split(/\s+/);
            const result = [];

            for (let i = words.length; i >= 2; i--) {
                result.push(words.slice(0, i).join(" "));
            }

            return result;
        }

        const jobDetails = await getJobDetails();

        let locations = jobDetails?.locations;

        if (!Array.isArray(locations)) {
            locations = [];
        }

        const allQueries = [];

        for (const location of locations) {

            if (typeof location !== "string" || !location.trim()) {
                continue;
            }

            allQueries.push(...substringVariants(location));

        }

        return allQueries;
    }

    const tabState = await getTabState();

    let queries = tabState?.leverLocationSearchQueries;

    if (Array.isArray(queries) && queries.length > 0) {
        return queries;
    }

    queries = await buildQueries();

    const primaryAddress =
        resolveAnswerValue(USER_DB, DB_KEY_MAP.ADDRESSES)[
            Number(resolveAnswerValue(USER_DB, DB_KEY_MAP.PRIMARY_ADDRESS_CONTAINER_IDX))
        ];

    if (primaryAddress?.state && primaryAddress?.country)
        queries.push(`${primaryAddress.state}, ${primaryAddress.country}`);

    if (primaryAddress?.city && primaryAddress?.state)
        queries.push(`${primaryAddress.city}, ${primaryAddress.state}`);

    if (primaryAddress?.city)
        queries.push(primaryAddress.city);

    notifyTabState(
        { leverLocationSearchQueries: queries },
        { updateUI: false }
    );

    return queries;
}

/* -------------------------------------------------------------------------- */
/* 📍 selectLocation                                                         */
/* -------------------------------------------------------------------------- */

export async function selectLocation({threshold = 75, queries = null, selectAtLeastOne = true} = {}) {

    const root = document.querySelector('[data-qa="structured-contact-location-question"]');
    if (!root) return null;

    const input = root.querySelector('#location-input');
    if (!(input instanceof HTMLInputElement)) return null;

    queries = queries ?? await getLocationSearchQueries();

    if (!Array.isArray(queries) || !queries.length)
        queries = ["Remote"];

    /* ------------------------------------------------------------------ */
    /* Helpers                                                            */
    /* ------------------------------------------------------------------ */

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

    /* ------------------------------------------------------------------ */
    /* Extract hCaptcha token                                             */
    /* ------------------------------------------------------------------ */
    async function getHCaptchaToken() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: "getLeverLocationToken" },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(response?.token || null);
                }
            );
        });
    }


    const hcaptchaToken = await getHCaptchaToken();

    if (!hcaptchaToken) {
        console.warn("[Lever] hCaptcha token missing. Received:", hcaptchaToken);
        return null;
    }

    /* ------------------------------------------------------------------ */
    /* Lever API fetch                                                    */
    /* ------------------------------------------------------------------ */

    async function fetchLocations(query) {

        const url =
            `https://jobs.lever.co/searchLocations` +
            `?text=${encodeURIComponent(query)}` +
            `&hcaptchaResponse=${encodeURIComponent(hcaptchaToken)}`;

        const res =
            await fetch(url, {
                method: "GET",
                credentials: "include"
            });

        if (!res.ok)
            return [];

        return await res.json();
    }


    /* ------------------------------------------------------------------ */
    /* Dispatch real typing events                                        */
    /* ------------------------------------------------------------------ */

    function dispatchTypingEvents(el) {

        el.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                composed: true,
                inputType: "insertText"
            })
        );

        el.dispatchEvent(
            new Event("change", {
                bubbles: true
            })
        );

        el.dispatchEvent(
            new KeyboardEvent("keydown", {
                bubbles: true,
                key: "a"
            })
        );

        el.dispatchEvent(
            new KeyboardEvent("keyup", {
                bubbles: true,
                key: "a"
            })
        );
    }


    async function typeQuery(text) {

        input.focus();

        nativeSetter.call(input, "");

        dispatchTypingEvents(input);

        await sleep(100);

        nativeSetter.call(input, text);

        dispatchTypingEvents(input);
    }


    /* ------------------------------------------------------------------ */
    /* Wait for Lever dropdown options                                    */
    /* ------------------------------------------------------------------ */

    async function waitForDropdown(timeout = 6000) {

        const start = Date.now();

        while (Date.now() - start < timeout) {

            const options =
                root.querySelectorAll('.dropdown-container [id^="location-"]');

            if (options.length)
                return Array.from(options);

            await sleep(100);
        }

        return [];
    }


    /* ------------------------------------------------------------------ */
    /* Real click (required by Lever React state)                         */
    /* ------------------------------------------------------------------ */

    function realClick(el) {

        const rect = el.getBoundingClientRect();

        const opts = {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        };

        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new PointerEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
    }


    /* ------------------------------------------------------------------ */
    /* Similarity scoring                                                 */
    /* ------------------------------------------------------------------ */

    function similarity(a, b) {

        a = a.toLowerCase();
        b = b.toLowerCase();

        if (b.includes(a))
            return 100;

        let matches = 0;

        for (const ch of a)
            if (b.includes(ch))
                matches++;

        return matches / a.length * 100;
    }


    /* ------------------------------------------------------------------ */
    /* Main search loop                                                   */
    /* ------------------------------------------------------------------ */

    let bestOverall = null;

    for (const query of queries) {

        let apiResults;

        try {
            apiResults = await fetchLocations(query);
        } catch {
            continue;
        }

        if (!apiResults.length)
            continue;

        await typeQuery(query);

        const options = await waitForDropdown();

        if (!options.length) continue;


        const ranked =
            options.map(el => ({
                el,
                label: el.textContent.trim(),
                score: similarity(query, el.textContent.trim())
            })).sort((a, b) => b.score - a.score);


        const best = ranked[0];

        if (!best) 
            continue;

        if (!bestOverall || best.score > bestOverall.score)
            bestOverall = best;

        if (best.score >= threshold) {
            realClick(best.el);
            await sleep(200);
            return {label: best.label, forced: false};
        }
    }


    /* ------------------------------------------------------------------ */
    /* Fallback                                                           */
    /* ------------------------------------------------------------------ */

    if (selectAtLeastOne && bestOverall) {

        realClick(bestOverall.el);

        await sleep(200);

        return {

            label: bestOverall.label,

            forced: true
        };
    }

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
    const knownQuestionCurrentLocation = resolveValidElements(
        locators,
        [
            FIELD_VALIDATOR.text,
            el =>
                el.name === "location" ||
                el.dataset?.qa === "location-input"
        ],
        "AND"
    );
    if (knownQuestionCurrentLocation.length) {
        return async () => {
            try {
                const response = await selectLocation({threshold: 60, queries: val, selectAtLeastOne: question.required});
                if (!response && question.required) {
                    return {
                        status: EXECUTION_STATUS.ERROR,
                        reason: "Failed to select location"
                    };
                }
                return {
                    status: EXECUTION_STATUS.OK
                };
            }
            catch (err) {
                return {
                    status: EXECUTION_STATUS.ERROR,
                    reason: "Location selection failed",
                    error: err.message
                };
            }
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
            
            const blacklist = ["Select...", "Please select", "Select One", "--"];

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

                const res = await uploadFiles(locators, val, {filenameSelector: '.application-form .application-question.resume .filename', progressSelector: `.application-form .application-question.resume .resume-upload-success[style]:not([style='']):not([style='display: inline;'])`, allowMultiple: false});

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

        case 'file': {
            return Boolean(document.querySelector(`.resume-upload-success`)?.style.display.startsWith('inline'))
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
			// FIELD_TYPE.DROPDOWN does not exists in Lever
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

