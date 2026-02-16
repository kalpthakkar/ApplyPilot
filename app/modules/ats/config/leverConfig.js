// app/modules/ats/config/leverConfig.js
import { DB_KEY_MAP } from '@shared/config/config.js';
import { LABEL_EMBEDDING_KEYS, LABEL_EMBEDDING_SELECTION } from '@shared/utils/labelUtils.js';
import { resolveAnswerValue, getKey, parseDate, getMonth, getYear, getLocalDate, isCurrentlyWorking } from '@shared/utils/utility.js';
import { FIELD_TYPE } from '@form/formUtils.js';
import { KNOWN_QUESTION_ACTION } from '@form/formResolver.js';


export const LEVER_PAGES = Object.freeze({
    DESCRIPTION_PAGE: 'DESCRIPTION_PAGE',
    APPLICATION_PAGE: 'APPLICATION_PAGE',
    CONFIRMATION_PAGE: 'CONFIRMATION_PAGE',
    JOB_SEARCH_PAGE: 'JOB_SEARCH_PAGE',
    PAGE_NOT_EXISTS: 'PAGE_NOT_EXISTS',
    UNKNOWN_PAGE: 'UNKNOWN_PAGE',
    // ... add more as needed
});


export const SELECTORS = {
    [LEVER_PAGES.DESCRIPTION_PAGE]: {
        descriptionPageIdentifier: `.posting-header a.postings-btn`
    },
    [LEVER_PAGES.APPLICATION_PAGE] : {
        submitButton: `form #btn-submit`,
    },
    [LEVER_PAGES.CONFIRMATION_PAGE] : {
        confirmationPageIdentifier: `[data-qa="msg-submit-success"]`
    },
    [LEVER_PAGES.JOB_SEARCH_PAGE] : {
        jobSearchPageIdentifier: `.list-page`
    },
    [LEVER_PAGES.CLOUDFLARE_ERROR_PAGE] : {
        cloudflareErrorPageIdentifier: `#cf-error-details`
    }
};


/* --------------------------------------------------------------------------
 * 💎 KNOWN ELEMENTS ⚙️ ALREADY KNOWN ELEMENTS
 * ------------------------------------------------------------------------ */
/**
 * Generate dynamic QUESTIONS object for Lever forms
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
    RESUME_UPLOAD: {
        type: 'file',
        dbAnswerKey: DB_KEY_MAP.RESUME_PATH,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'resume',
        action: KNOWN_QUESTION_ACTION.FORCE_SKIP,
        notes: 'Resume/CV*'
    },
    FULL_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: undefined,
        value: db => {
            const first = (db[DB_KEY_MAP.FIRST_NAME] || "").trim();
            const last = (db[DB_KEY_MAP.LAST_NAME] || "").trim();
            if (!first && !last) return null;
            if (!first) return last;
            if (!last) return first;
            return `${first} ${last}`;
        },
        elementValidator: (el) => el.getAttribute('name') == 'name',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Full Name or Signature*'
    },
    PRONOUNCE: {
        type: FIELD_TYPE.CHECKBOX,
        dbAnswerKey: undefined,
        value: db => {
            const atsOptionalLabels = ["Use name only"];
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.GENDER, undefined);

            const result = [];
            if (dbAnswer === "Male") result.push("He/him");
            else if (dbAnswer === "Female") result.push("She/her");
            else if (dbAnswer === "Non-Binary") result.push("They/them")

            if (dbAnswer == null || dbAnswer === "Decline to state") {
                result.push(...atsOptionalLabels);
            }
            
            // Remove duplicates
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.getAttribute('name') === 'pronouns',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Full Name or Signature*'
    },
    EMAIL: {
        type: [FIELD_TYPE.EMAIL, FIELD_TYPE.TEXT],
        dbAnswerKey: DB_KEY_MAP.EMAIL,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'email',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Email*'
    },
    PHONE_NUMBER: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.PHONE_NUMBER,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') == 'phone',                    
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Phone Number*'
    },
    CURRENT_LOCATION: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.ADDRESSES,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'location-input' && el.getAttribute('name') == 'location',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Current Location*'
    },
    CURRENT_COMPANY: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_COMPANY_NAME,
        value: db => {
            const first = resolveAnswerValue(db, 'workExperiences[0]', undefined);
            return first ? resolveAnswerValue(db, 'workExperiences[0].company', undefined) : undefined;
        },
        elementValidator: (el) => el.getAttribute('data-qa') == 'org-input' && el.getAttribute('name') == 'org',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Current Location*'
    },
    LINKEDIN: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: DB_KEY_MAP.LINKEDIN,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'urls[LinkedIn]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'LinkedIn*'
    },
    GITHUB: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: DB_KEY_MAP.GITHUB,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'urls[GitHub]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'GitHub*'
    },
    PORTFOLIO: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: DB_KEY_MAP.PORTFOLIO,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'urls[Portfolio]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Portfolio*'
    },
    FACEBOOK: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'urls[Facebook]',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Facebook'
    },
    TWITTER: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'urls[Twitter]',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Twitter'
    },
    OTHER_WEBSITE_URL: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: undefined,
        value: db => {
            const urls = resolveAnswerValue(db, 'otherURLs', []);
            return Array.isArray(urls) && urls.length > 0
                ? urls[0]
                : undefined;
        },
        elementValidator: (el) => el.getAttribute('name') === 'urls[Other]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Other website'
    },
    GENDER: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.GENDER,
        value: db => {
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.GENDER, undefined);
            if (dbAnswer === "Decline to state") return ["Decline to self-identify"];
            else if (dbAnswer != null) return [dbAnswer];
            else return undefined;
        },
        elementValidator: (el) => el.getAttribute('name') === 'eeo[gender]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Gender*'
    },
    RACE: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.ETHNICITY,
        value: db => {
            const dbEthnicity = resolveAnswerValue( db, DB_KEY_MAP.ETHNICITY, undefined ); // Array
            if (!Array.isArray(dbEthnicity) || !dbEthnicity.length) {
                return undefined;
            }

            // Push ATS specific options for mapped settings
            if (dbEthnicity.includes("South Asian")) {
                dbEthnicity.push("Asian (Not Hispanic or Latino)");
            }
            return dbEthnicity;
        },
        elementValidator: (el) => el.getAttribute('name') === 'eeo[race]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Race*'
    },
    VETERAN_STATUS: {
        type: [FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.VETERAN_STATUS,
        value: db => {
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.VETERAN_STATUS, undefined);

            // Flexible mapping for boolean values → each key maps to a list of ATS labels
            const booleanLabelMap = {
                true: ["I am a veteran"],
                false: ["I am not a veteran"]
            };

            if (dbAnswer === "Decline to state") return ["Decline to self-identify"];
            if (typeof dbAnswer === "boolean") return booleanLabelMap[dbAnswer]
            return undefined;

        },
        elementValidator: (el) => el.getAttribute('name') === 'eeo[veteran]',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Veteran Status*'
    },
    CONCENT: {
        type: [FIELD_TYPE.CHECKBOX],
        dbAnswerKey: undefined,
        value: db => { return true },
        elementValidator: (el) => el.getAttribute('name')?.startsWith('consent['),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Concent checkbox*'
    },
    DEMOGRAPHIC_SURVEY_LOCATION : {
        type: [FIELD_TYPE.SELECT],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('data-qa') === "candidate-location-select",
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'What is your location?'
    }
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

    if (!Object.values(LEVER_PAGES).includes(page)) throw new Error(`Invalid page: ${page}`);

    function allExcept(...excludedKeys) {
        return KNOWN_QUESTION_SELECTION.ALL.filter(k => !excludedKeys.includes(k));
    }

    switch (page) {

        case LEVER_PAGES.APPLICATION_PAGE:
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

    if (!Object.values(LEVER_PAGES).includes(page)) throw new Error(`Invalid page: ${page}`);

    function allExcept(...excludedKeys) {
        return LABEL_EMBEDDING_SELECTION.ALL.filter(k => !excludedKeys.includes(k));
    }

    switch (page) {

        // For selection (may not be up-to-date): https://onlinegdb.com/64TRPnPgf
        
        case LEVER_PAGES.APPLICATION_PAGE:
            return LABEL_EMBEDDING_SELECTION.ALL;

        default:
            return LABEL_EMBEDDING_SELECTION.ALL;

    }
}
