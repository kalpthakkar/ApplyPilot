// app/modules/ats/config/greenhouseConfig.js
import { DB_KEY_MAP } from '@shared/config/config.js';
import { LABEL_EMBEDDING_KEYS, LABEL_EMBEDDING_SELECTION } from '@shared/utils/labelUtils.js';
import { resolveAnswerValue, getKey, parseDate, getMonth, getYear, getLocalDate, isCurrentlyWorking } from '@shared/utils/utility.js';
import { FIELD_TYPE } from '@form/formUtils.js';
import { KNOWN_QUESTION_ACTION } from '@form/formResolver.js';


export const GREENHOUSE_PAGES = Object.freeze({
    APPLICATION_PAGE: 'APPLICATION_PAGE',
    CONFIRMATION_PAGE: 'CONFIRMATION_PAGE',
    JOB_SEARCH_PAGE: 'JOB_SEARCH_PAGE',
    PAGE_NOT_EXISTS: 'PAGE_NOT_EXISTS',
    UNKNOWN_PAGE: 'UNKNOWN_PAGE',
    // ... add more as needed
});


export const SELECTORS = {
    [GREENHOUSE_PAGES.APPLICATION_PAGE] : {
        form: `form[id="application_form"], form[id="application-form"]`,
        submitButton: `form[id="application_form"] [id="submit_buttons"] > input`,

        educationContainers: `[id="education_section"] [class="education"]`,
        educationAddButton: `[id="add_education"]`,
        educationDeleteButton: `.remove-background-field:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)`,
        educationDeleteButtons: `[id="education_section"] .remove-background-field:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)`,

        workExperienceContainers: `[id="employment_section"] [class="employment"]`,
        workExperienceAddButton: `[id="add_employment"]`,
        workExperienceDeleteButton: `.remove-background-field:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)`,
        workExperienceDeleteButtons: `[id="employment_section"] .remove-background-field:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)`,
        workExperienceCurrentlyWorkingCheckboxes: `form [name="job_application[employments][][current]"]`,

        deleteFileButtons: `button.remove, button[aria-label="Remove attachment"]`,
        resumeInput: `[data-presigned-form="resume"] [type="file"]:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)`,
        coverLetterInput: `[data-presigned-form="cover_letter"] [type="file"]:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)`,
        securityCodeInput: `[id="security_code_fields"] div.field > input`,
        securityCodeEnabledInput: `[id="security_code_fields"] div.field > input:not(:disabled)`,
    },
    [GREENHOUSE_PAGES.CONFIRMATION_PAGE] : {
        confirmationPageIdentifier: `[id="submission_received"], [id="application_confirmation"]`
    },
    [GREENHOUSE_PAGES.JOB_SEARCH_PAGE] : {
        jobSearchPageIdentifier: `.filters #keyword-filter`
    }
};


/* --------------------------------------------------------------------------
 * 💎 KNOWN ELEMENTS ⚙️ ALREADY KNOWN ELEMENTS
 * ------------------------------------------------------------------------ */
/**
 * Generate dynamic QUESTIONS object for Greenhouse forms
 * 
 * Each object typically contains:
*   • `type` {string}                → Expected field type (e.g., 'multiselect', 'radio')
*   • `dbAnswerKey` {string|function}  → Database key or compatible function (to fetch formated value) for answer.
*   • `value` {any}                  → Predefined answer(s) to fill into the field
*   • `elementValidator` {function}  → Function that returns true if a given field element matches this candidate
*   • `action` {enum}                → KNOWN_QUESTION_ACTION flow controller (default: KNOWN_QUESTION_ACTION.RESOLVE)
*   • `locators` {array[string]}     → Optional array of string selectors (overrides field elements) - enabling recovery if element is lost.
*   • `timeout` {number}             → Optional timeout in seconds for interacting with this field
*   • `notes` {string}               → Optional description or notes for reference
 */
export const KNOWN_QUESTIONS = {
    FIRST_NAME: {
        type: 'text',
        dbAnswerKey: DB_KEY_MAP.FIRST_NAME,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'first_name' || el.getAttribute('name') == 'job_application[first_name]',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'First Name*'
    },
    LAST_NAME: {
        type: 'text',
        dbAnswerKey: DB_KEY_MAP.LAST_NAME,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'last_name' || el.getAttribute('name') == 'job_application[last_name]',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Last Name*'
    },
    EMAIL: {
        type: 'text',
        dbAnswerKey: DB_KEY_MAP.EMAIL,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'email' || el.getAttribute('name') == 'job_application[email]',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Email Address*'
    },
    PHONE_NUMBER: {
        type: 'text',
        dbAnswerKey: DB_KEY_MAP.PHONE_NUMBER,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'phone' || el.getAttribute('name') == 'job_application[phone]',                    
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Phone Number*'
    },
    LOCATION_CITY: {
        type: 'text',
        dbAnswerKey: DB_KEY_MAP.CITY,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') == 'job_application[location]',                    
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Location (city)*'
    },
    DUMMY_HIDDEN: {
        type: 'text',
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'dev-field-1' || el.getAttribute('name') == 'dev_field_1',                    
        action: KNOWN_QUESTION_ACTION.FORCE_SKIP,
        notes: 'Dummy*'
    },
    RESUME_UPLOAD: {
        type: 'file',
        dbAnswerKey: DB_KEY_MAP.RESUME_PATH,
        value: undefined,
        elementValidator: (el) => { return el == document.querySelector(SELECTORS.APPLICATION_PAGE.resumeInput)},
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Resume*'
    },
    COVER_LETTER_UPLOAD: {
        type: 'file',
        dbAnswerKey: DB_KEY_MAP.RESUME_PATH,
        value: undefined,
        elementValidator: (el) => { return el == document.querySelector(SELECTORS.APPLICATION_PAGE.coverLetterInput)},
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Cover Letter*'
    },
    EDUCATION_SCHOOL: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.SELECT, FIELD_TYPE.HIDDEN],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_SCHOOL,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_SCHOOL), undefined),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][school_name_id]" || el.id?.startsWith('education_school_name_'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'School*'
    },
    EDUCATION_DEGREE: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.SELECT, FIELD_TYPE.HIDDEN],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_DEGREE,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_DEGREE), []),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][degree_id]" || el.id?.startsWith('education_degree_'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Degree*'
    },
    EDUCATION_MAJOR: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.SELECT, FIELD_TYPE.HIDDEN],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_MAJOR,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_MAJOR), []),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][discipline_id]" || el.id?.startsWith('education_discipline_'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Discipline*'
    },
    EDUCATION_START_DATE_MONTH: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EDUCATION_START_DATE,
        value: db => getMonth( resolveAnswerValue( db, getKey(DB_KEY_MAP.EDUCATION_START_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][start_date][month]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Month'
    },
    EDUCATION_START_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EDUCATION_START_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.EDUCATION_START_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][start_date][year]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Year'
    },
    EDUCATION_END_DATE_MONTH: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EDUCATION_END_DATE,
        value: db => getMonth( resolveAnswerValue( db, getKey(DB_KEY_MAP.EDUCATION_END_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][end_date][month]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Month'
    },
    EDUCATION_END_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EDUCATION_END_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.EDUCATION_END_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[educations][][end_date][year]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Year'
    },
    WORK_EXP_COMPANY: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_COMPANY_NAME,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_COMPANY_NAME), undefined),
        elementValidator: (el) => el.getAttribute('name') === "job_application[employments][][company_name]" || el.id?.startsWith('employment_company_name_'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Company*'
    },
    WORK_EXP_JOB_TITLE: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_JOB_TITLE,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_JOB_TITLE), undefined),
        elementValidator: (el) => el.getAttribute('name') === "job_application[employments][][title]" || el.id?.startsWith('employment_title_'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Job Title*'
    },
    WORK_EXP_CURRENTLY_WORKING: {
        type: FIELD_TYPE.CHECKBOX,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_END_DATE,
        value: db => {
            return isCurrentlyWorking(resolveAnswerValue(db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_END_DATE), undefined));
        },
        elementValidator: (el) => el.getAttribute("name") === "job_application[employments][][current]",
        action: KNOWN_QUESTION_ACTION.FORCE_SKIP, // Synced during page initialization.
        notes: 'I currently work here'
    },
    WORK_EXP_START_DATE_MONTH: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_START_DATE,
        value: db => getMonth( resolveAnswerValue( db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_START_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[employments][][start_date][month]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Month'
    },
    WORK_EXP_START_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_START_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_START_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[employments][][start_date][year]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Year'
    },
    WORK_EXP_END_DATE_MONTH: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_END_DATE,
        value: db => getMonth( resolveAnswerValue( db, 'endDate', undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[employments][][end_date][month]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Month'
    },
    WORK_EXP_END_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_END_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_END_DATE), undefined ) ),
        elementValidator: (el) => el.getAttribute('name') === "job_application[employments][][end_date][year]",
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Year'
    },
    TODAY_DAY: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DATE],
        dbAnswerKey: undefined,
        value: db => getLocalDate('dd'),
        elementValidator: (el) => el.classList.contains("day"),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Today day*'
    },
    TODAY_MONTH: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DATE],
        dbAnswerKey: undefined,
        value: db => getLocalDate('mm'),
        elementValidator: (el) => el.classList.contains("month"),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Today month*'
    },
    TODAY_YEAR: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DATE],
        dbAnswerKey: undefined,
        value: db => getLocalDate('yyyy'),
        elementValidator: (el) => el.classList.contains("year"),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Today year*'
    },
    GENDER: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.GENDER,
        value: db => {
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.GENDER, undefined);

            const result = [];
            if (dbAnswer != null) result.push(dbAnswer);
            if (dbAnswer == null || dbAnswer === "Decline to state") {
                const atsOptionalLabels = ["Decline To Self Identify"];
                result.push(...atsOptionalLabels);
            }

            // Remove duplicates
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.getAttribute('name') === 'job_application[gender]' || el.id === 'job_application_gender',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Gender'
    },
    HISPANIC_OR_LATINO: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.HISPANIC_OR_LATINO,
        value: db => resolveAnswerValue( db, DB_KEY_MAP.HISPANIC_OR_LATINO, undefined ),
        elementValidator: (el) => el.getAttribute('name') === 'job_application[hispanic_ethnicity]' || el.id === 'job_application_hispanic_ethnicity',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Hispanic or Latino*'
    },
    VETERAN_STATUS: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.VETERAN_STATUS,
        value: db => {
            
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.VETERAN_STATUS, undefined);

            // Flexible mapping for boolean values → each key maps to a list of ATS labels
            const booleanLabelMap = {
                true: ["I identify as a veteran"],
                false: ["I am not a veteran"]
            };

            let result = [];

            if (typeof dbAnswer === "boolean") {
                result.push(...(booleanLabelMap[dbAnswer] || []));  // <-- spread here
            } else if (dbAnswer == null || dbAnswer === "Decline to state") {
                const atsOptionalLabels = ["I don't wish to answer"];
                result.push(...atsOptionalLabels);
            } else {
                result.push(dbAnswer);
            }

            // Ensure uniqueness
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.getAttribute('name') === 'job_application[veteran_status]' || el.id === 'job_application_veteran_status',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Veteran Status*'
    },
    DISABILITY_STATUS: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.DISABILITY_STATUS,
        value: db => {
            
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.DISABILITY_STATUS, undefined);

            // Flexible mapping for boolean values → each key maps to a list of ATS labels
            const booleanLabelMap = {
                true: ["Yes, I have a disability, or have had one in the past"],
                false: ["No, I do not have a disability and have not had one in the past"]
            };

            let result = [];

            if (typeof dbAnswer === "boolean") {
                result.push(...(booleanLabelMap[dbAnswer] || []));  // <-- spread here
            } else if (dbAnswer == null || dbAnswer === "Decline to state") {
                const atsOptionalLabels = ["I do not want to answer"];
                result.push(...atsOptionalLabels);
            } else {
                result.push(dbAnswer);
            }

            // Ensure uniqueness
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.getAttribute('name') === 'job_application[disability_status]' || el.id === 'job_application_disability_status',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Disability Status*'
    },
}

/* ============================================================================
 * 🔑 KEYS & CONSTANTS
 * ========================================================================== */
const KNOWN_QUESTION_KEYS = Object.freeze( Object.fromEntries(Object.keys(KNOWN_QUESTIONS).map(k => [k, k])) );
export const KNOWN_QUESTION_SELECTION = Object.freeze({ 
    ALL: Object.keys(KNOWN_QUESTIONS), 
    NONE: [] 
});

export function getKnownQuestionKeys(page) {

    if (!Object.values(GREENHOUSE_PAGES).includes(page)) throw new Error(`Invalid page: ${page}`);

    function allExcept(...excludedKeys) {
        return KNOWN_QUESTION_SELECTION.ALL.filter(k => !excludedKeys.includes(k));
    }

    switch (page) {

        case GREENHOUSE_PAGES.APPLICATION_PAGE:
            return KNOWN_QUESTION_SELECTION.ALL;
            // return allExcept(
            //     KNOWN_QUESTION_KEYS.PASSWORD,
            //     KNOWN_QUESTION_KEYS.SECONDARY_PASSWORD,
            //     KNOWN_QUESTION_KEYS.CREATE_ACCOUNT_CONCENT,
            // );

        default:
            return KNOWN_QUESTION_SELECTION.ALL;
    }

}

export function getLabelEmbeddingKeys(page) {

    if (!Object.values(GREENHOUSE_PAGES).includes(page)) throw new Error(`Invalid page: ${page}`);

    function allExcept(...excludedKeys) {
        return LABEL_EMBEDDING_SELECTION.ALL.filter(k => !excludedKeys.includes(k));
    }

    switch (page) {

        // For selection (may not be up-to-date): https://onlinegdb.com/64TRPnPgf
        
        case GREENHOUSE_PAGES.APPLICATION_PAGE:
            return LABEL_EMBEDDING_SELECTION.ALL;

        default:
            return LABEL_EMBEDDING_SELECTION.ALL;

    }
}
