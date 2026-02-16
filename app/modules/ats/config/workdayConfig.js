// app/modules/ats/config/workdayConfig.js
import { DB_KEY_MAP } from '@shared/config/config.js';
import { LABEL_EMBEDDING_KEYS, LABEL_EMBEDDING_SELECTION } from '@shared/utils/labelUtils.js';
import { resolveAnswerValue, getKey, parseDate, getMonth, getYear, isCurrentlyWorking, getLocalDate } from '@shared/utils/utility.js';
import { FIELD_TYPE } from '@form/formUtils.js';
import { KNOWN_QUESTION_ACTION } from '@form/formResolver.js';

export const WORKDAY_PAGES = Object.freeze({
    CANDIDATE_HOME_PAGE: 'CANDIDATE_HOME_PAGE',
    JOB_SEARCH_PAGE: 'JOB_SEARCH_PAGE',
    DESCRIPTION_PAGE: 'DESCRIPTION_PAGE',
    AUTH_PAGE: 'AUTH_PAGE',
    INFO_PAGE: 'INFO_PAGE',
    EXP_PAGE: 'EXP_PAGE',
    QUESTIONNAIRE_PAGE: 'QUESTIONNAIRE_PAGE',
    VOLUNTARY_DISCLOSURE_PAGE: 'VOLUNTARY_DISCLOSURE_PAGE',
    SELF_IDENTIFICATION_PAGE: 'SELF_IDENTIFICATION_PAGE',
    REVIEW_PAGE: 'REVIEW_PAGE',
    ALREADY_APPLIED_PAGE: 'ALREADY_APPLIED_PAGE',
    PAGE_NOT_EXISTS: 'PAGE_NOT_EXISTS',
    UNKNOWN_PAGE: 'UNKNOWN_PAGE'
    // ... add more as needed
});

export const SELECTORS = {
    [WORKDAY_PAGES.CANDIDATE_HOME_PAGE] : {
        candidatePageIdentifier: `[data-automation-id="CandidateHomePage"]`,
        signInNavButton: `[data-automation-id="utilityButtonSignIn"]`,
        candidateHomeTaskModal: `[data-automation-id="candidateHomeTaskModal"]`,
        myApplicationSection: `[data-automation-id="applicationsSectionHeading"]`,
        myApplicationSectionToggler: `[data-automation-id="applicationsSectionHeading-CHEVRON"]`,
        myApplicationTabList: `[data-automation-id="applicationsSectionHeading"] [role="tablist"]`,
        myApplicationActiveButton: `[data-automation-id="applicationsSectionHeading"] [role="tablist"] button`,
        myApplicationInactiveButton: `[data-automation-id="applicationsSectionHeading"] [role="tablist"] button:last-child`,
        myApplicationTabPanel: `[data-automation-id="applicationsSectionHeading"] [role="tabpanel"]`,
        perApplicationTitle: `[data-automation-id="applicationsSectionHeading"] [role="tabpanel"] [data-automation-id="applicationTitle"]`,
        perApplicationURL: `[data-automation-id="applicationsSectionHeading"] [role="tabpanel"] [data-automation-id="applicationTitle"] a`,
        perApplicationStatus: `[data-automation-id="applicationsSectionHeading"] [role="tabpanel"] [data-automation-id="applicationStatus"] span:first-child`,
        perApplicationActionMenuToggler: `[data-automation-id="applicationsSectionHeading"] [role="tabpanel"] table tr td button`,
        continueApplicationActionMenuItem: `a[role="menuitem"][data-automation-id="continueApplication"]`, 
    },
    [WORKDAY_PAGES.JOB_SEARCH_PAGE] : {
        jobSearchPageIdentifier: `[id="mainContent"] [data-automation-id="jobSearchPage"]`,
        signInPopupDialog: `[data-automation-id="popUpDialog"]`,
    },
	[WORKDAY_PAGES.DESCRIPTION_PAGE] : {
        descriptionPageIdentifier: `[data-automation-id="jobPostingPage"]`,
		applyButton: `[data-automation-id="adventureButton"]`,
        locationText: `[data-automation-id="locations"] dd`,
		applyManuallyButton: `[data-automation-id="applyManually"]`,
		useMyLastApplication: `[data-automation-id="useMyLastApplication"]`,
        continueApplicationButton: `[data-automation-id="continueButton"]`,
        viewApplicationButton: `[data-automation-id="viewButton"]`,
    },
    [WORKDAY_PAGES.AUTH_PAGE] : {
		email: `[data-automation-id="email"]`,
		password: `[data-automation-id="password"]`,
		verifyPassword: `[data-automation-id="verifyPassword"]`,
		createAccountCheckbox: `[data-automation-id="createAccountCheckbox"]`,
		// createAccountSubmitButton: `[aria-label="Create Account"]`,
        createAccountSubmitButton: `[data-automation-id="createAccountSubmitButton"]`,
        signInWithEmailButton: `[data-automation-id="SignInWithEmailButton"]`,
		// signInSubmitButton: `[data-automation-id="signInContent"] button[type="submit"]`,
        signInSubmitButton: `[data-automation-id="signInSubmitButton"]`,
		signInLink: `[data-automation-id="signInLink"]`,
		createAccountLink: `[data-automation-id="createAccountLink"]`,
		inputAlert: `[data-automation-id="inputAlert"]`,
	},
    [WORKDAY_PAGES.INFO_PAGE] : {
        infoPageIdentifier: `[data-automation-id="applyFlowMyInfoPage"]`, // not in use
        applyFlowProgressButton: `[data-automation-id="pageFooterNextButton"]`,
        applyFlowPage: `[data-automation-id="applyFlowPage"]`,
    },
    [WORKDAY_PAGES.EXP_PAGE] : {
        experiencePageIdentifier: `[data-automation-id="applyFlowMyExpPage"]`, // not in use
        workExperienceGroup: `[aria-labelledby^="Work-"][aria-labelledby$="section"]`,
        workExperienceContainers: `[aria-labelledby^="Work-"][aria-labelledby$="section"] > [role="group"]`,
        workExperienceAddButton: `[aria-labelledby^="Work-"][aria-labelledby$="section"] [data-automation-id="add-button"]`,
        workExperienceDeleteButton: `:scope > div:first-of-type button`, // Delete selector in container
        workExperienceDeleteButtons: `[aria-labelledby^="Work-"][aria-labelledby$="section"] > [role="group"] > div > button`,
        workExperienceCurrentlyWorkingCheckboxes: `[aria-labelledby^="Work-"][aria-labelledby$="section"] > [role="group"] input[name="currentlyWorkHere"]`,
        educationGroup: `[aria-labelledby^="Education-"][aria-labelledby$="section"], [aria-labelledby^="Schooling-"][aria-labelledby$="section"]`,
        educationContainers: `[aria-labelledby^="Education-"][aria-labelledby$="section"] > [role="group"], [aria-labelledby^="Schooling-"][aria-labelledby$="section"] > [role="group"]`,
        educationAddButton: `[aria-labelledby^="Education-"][aria-labelledby$="section"] [data-automation-id="add-button"], [aria-labelledby^="Schooling-"][aria-labelledby$="section"] [data-automation-id="add-button"]`,
        educationDeleteButton: `:scope > div:first-of-type button`, // Delete selector in container
        educationDeleteButtons: `[aria-labelledby^="Education-"][aria-labelledby$="section"] > [role="group"] > div > button, [aria-labelledby^="Schooling-"][aria-labelledby$="section"] > [role="group"] > div > button`,
        deleteFileButtons: `[data-automation-id="delete-file"]`,
        websiteSection: `[aria-labelledby*="Website"][aria-labelledby$="section"]`,
        websiteContainers: `[aria-labelledby*="Website"][aria-labelledby$="section"] [role="group"]`,
        websiteAddButton: `[aria-labelledby*="Website"][aria-labelledby$="section"] [data-automation-id="add-button"]`,
        websiteDeleteButtons: `[aria-labelledby*="Website"][aria-labelledby$="section"] [role="group"] button`,
        applyFlowProgressButton: `[data-automation-id="pageFooterNextButton"]`,
        applyFlowPage: `[data-automation-id="applyFlowPage"]`,
    },
    [WORKDAY_PAGES.QUESTIONNAIRE_PAGE] : {
        questionnairePageIdentifier: `[data-automation-id="applyFlowPrimaryQuestionsPage"]`, // not in use
        applyFlowProgressButton: `[data-automation-id="pageFooterNextButton"]`,
        applyFlowPage: `[data-automation-id="applyFlowPage"]`,
    },
    [WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE] : {
        applyFlowProgressButton: `[data-automation-id="pageFooterNextButton"]`,
        applyFlowPage: `[data-automation-id="applyFlowPage"]`,
    },
    [WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE] : {
        applyFlowProgressButton: `[data-automation-id="pageFooterNextButton"]`,
        applyFlowPage: `[data-automation-id="applyFlowPage"]`,
    },
    [WORKDAY_PAGES.REVIEW_PAGE] : {
        applyFlowProgressButton: `[data-automation-id="pageFooterNextButton"]`,
        applyFlowPage: `[data-automation-id="applyFlowPage"]`,
    },
    [WORKDAY_PAGES.ALREADY_APPLIED_PAGE] : {
        alreadyAppliedPageIdentifier: `[id="mainContent"] [data-automation-id="alreadyAppliedPage"]`,
    },
    [WORKDAY_PAGES.PAGE_NOT_EXISTS] : {
        pageNotExistsIdentifier: `[id="mainContent"] [data-automation-id="errorContainer"] [data-automation-id="errorMessage"]`,
    }
    
};

export const PASSWORD_TYPE = Object.freeze({
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  // ... add more as needed
});
let currentPasswordType = PASSWORD_TYPE.PRIMARY;
export function setPasswordType(passwordType) {
    if (!Object.values(PASSWORD_TYPE).includes(passwordType)) throw new Error(`Invalid password type: ${passwordType}`);
    currentPasswordType = passwordType;
}


/* --------------------------------------------------------------------------
 * 💎 KNOWN ELEMENTS ⚙️ ALREADY KNOWN ELEMENTS
 * ------------------------------------------------------------------------ */
/**
 * Generate dynamic QUESTIONS object for Workday forms
 * 
 * Each object typically contains:
*   • `type` {string}                → Expected field type (e.g., 'multiselect', 'radio')
*   • `dbAnswerKey` {string|function}  → Database key or compatible function (to fetch formated value) for answer.
*   • `value` {any}                  → Predefined answer(s) to fill into the field
*   • `elementValidator` {function}  → Function that returns true if a given field element matches this candidate
*   • `action` {enum}                → KNOWN_QUESTION_ACTION flow controller
*   • `locators` {array[string]}     → Optional array of string selectors (overrides field elements) - enabling recovery if element is lost.
*   • `timeout` {number}             → Optional timeout in seconds for interacting with this field
*   • `notes` {string}               → Optional description or notes for reference
 */
export const KNOWN_QUESTIONS = {
	EMAIL: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EMAIL,
        value: undefined,
        elementValidator: (el) => el.getAttribute('data-automation-id') == 'email',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Email Address*'
    },
    PASSWORD: {
		type: 'password',
        dbAnswerKey: undefined,
        value: db => { return resolveAnswerValue(db, (currentPasswordType === PASSWORD_TYPE.SECONDARY) ? DB_KEY_MAP.SECONDARY_PASSWORD : DB_KEY_MAP.PASSWORD);  },
        elementValidator: (el) => ['password', 'verifyPassword'].includes(el.getAttribute('data-automation-id')),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Password or Verify Password*'
	},
    CREATE_ACCOUNT_CONCENT: {
        type: FIELD_TYPE.CHECKBOX,
        dbAnswerKey: undefined,
        value: true,
        elementValidator: (el) => el.getAttribute('data-automation-id') == 'createAccountCheckbox',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Concent Checkbox'
    },
    SOURCE: {
        type: [FIELD_TYPE.MULTISELECT, FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: ["Company Website", "site", "website", "career", "corporate", "other"],
        elementValidator: (el) => el.getAttribute('id') == 'source--source',
        timeout: 15,
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'How Did You Hear About Us?*'
    },
    IS_PREVIOUS_WORKER: {
        type: FIELD_TYPE.RADIO,
        dbAnswerKey: undefined,
        value: ["No"],
        elementValidator: (el) => el.getAttribute('name') == 'candidateIsPreviousWorker',
        timeout: 5,
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Have you previously worked for our organization? If so, please provide the information below:*'
    },
    COUNTRY: {
        type: FIELD_TYPE.DROPDOWN,
        dbAnswerKey: undefined,
        value: ["United States of America"],
        elementValidator: (el) => el.getAttribute('id') == 'country--country',
        timeout: 5,
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Country*'
    },
    LEGAL_NAME_PREFIX: {
        type: FIELD_TYPE.DROPDOWN,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--title' || el.getAttribute('name') == 'legalName--title',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Legal Name Prefix*'
    },
    LEGAL_NAME_SUFFIX: {
        type: FIELD_TYPE.DROPDOWN,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--social' || el.getAttribute('name') == 'legalName--social',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Legal Name Suffix*'
    },
    FIRST_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.FIRST_NAME,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--firstName' || el.getAttribute('name') == 'legalName--firstName',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'First Name*'
    },
    MIDDLE_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--middleName' || el.getAttribute('name') == 'legalName--middleName',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Middle Name*'
    },
    LAST_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.LAST_NAME,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--lastName' || el.getAttribute('name') == 'legalName--lastName',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Last Name*'
    },
    LOCAL_FIRST_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.FIRST_NAME,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--firstNameLocal' || el.getAttribute('name') == 'legalName--firstNameLocal',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Local Given Name(s)'
    },
    LOCAL_LAST_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.LAST_NAME,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--legalName--lastNameLocal' || el.getAttribute('name') == 'legalName--lastNameLocal',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Local Family Name'
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
        elementValidator: (el) => el.getAttribute('name') == 'name' || el.getAttribute('id') == 'selfIdentifiedDisabilityData--name',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Full Name or Signature*'
    },
    HAS_PREFERRED_NAME: {
        type: FIELD_TYPE.CHECKBOX,
        dbAnswerKey: undefined,
        value: db => Boolean(resolveAnswerValue(db, DB_KEY_MAP.PREFERRED_NAME)),
        elementValidator: (el) => el.getAttribute('id') == 'name--preferredCheck' || el.getAttribute('name') == 'preferredCheck',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'I have a preferred name'
    },
    PREFERRED_NAME_PREFIX: {
        type: FIELD_TYPE.DROPDOWN,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--preferredName--title' || el.getAttribute('name') == 'preferredName--title',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Preferred Name Prefix*'
    },
    PREFERRED_NAME_SUFFIX: {
        type: FIELD_TYPE.DROPDOWN,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--preferredName--social' || el.getAttribute('name') == 'preferredName--social',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Preferred Name Suffix*'
    },
    PREFERRED_FIRST_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.FIRST_NAME,
        value: db => {
            const preferredName = resolveAnswerValue(db, DB_KEY_MAP.PREFERRED_NAME)?.trim();
            return preferredName ? preferredName.split(' ')[0] : undefined;
        },
        elementValidator: (el) => el.getAttribute('id') == 'name--preferredName--firstName' || el.getAttribute('name') == 'preferredName--firstName',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Preferred First Name'
    },
    PREFERRED_MIDDLE_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'name--preferredName--middleName' || el.getAttribute('name') == 'preferredName--middleName',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Preferred Middle Name*'
    },
    PREFERRED_LAST_NAME: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.LAST_NAME,
        value: db => {
            const preferredName = resolveAnswerValue(db, DB_KEY_MAP.PREFERRED_NAME)?.trim();
            return preferredName.split(' ').length > 1 ? preferredName.split(' ').slice(-1)[0] : undefined;
        },
        elementValidator: (el) => el.getAttribute('id') == 'name--preferredName--lastName' || el.getAttribute('name') == 'preferredName--lastName',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Preferred Last Name'
    },
    ADDRESS_LINE_1: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.ADDRESS_LINE_1,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'address--addressLine1' || el.getAttribute('name') == 'addressLine1',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Address Line 1*'
    },
    ADDRESS_LINE_2: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.ADDRESS_LINE_2,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'address--addressLine2' || el.getAttribute('name') == 'addressLine2',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Address Line 2'
    },
    CITY: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.CITY,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'address--city' || el.getAttribute('name') == 'city',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'City*'
    },
    STATE: {
        type: ['text', 'dropdown'],
        dbAnswerKey: DB_KEY_MAP.STATE,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'address--countryRegion' || el.getAttribute('name') == 'countryRegion',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'State*'
    },
    POSTAL_CODE: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.POSTAL_CODE,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'address--postalCode' || el.getAttribute('name') == 'postalCode',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Postal Code*'
    },
    COUNTY: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: undefined,
        value: db => { return '-' },
        elementValidator: (el) => el.getAttribute('id') == 'address--regionSubdivision1' || el.getAttribute('name') == 'regionSubdivision1',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'County'
    },
    EMAIL_INFO: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.EMAIL],
        dbAnswerKey: DB_KEY_MAP.EMAIL,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'emailAddress--emailAddress' || el.getAttribute('name') == 'emailAddress',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Email*'
    },
    PHONE_DEVICE_TYPE: {
        type: FIELD_TYPE.DROPDOWN,
        dbAnswerKey: undefined,
        value: ["Mobile","Landline","Cell"],
        elementValidator: (el) => el.getAttribute('id') == 'phoneNumber--phoneType' || el.getAttribute('name') == 'phoneType',
        locators: ['button[id="phoneNumber--phoneType"]', 'button[name="phoneType"]'],
        timeout: 7,
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Phone Device Type*'
    },
    COUNTRY_PHONE_CODE: {
        type: FIELD_TYPE.MULTISELECT,
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.id === 'phoneNumber--countryPhoneCode',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Country Phone Code*'
    },
    PHONE_NUMBER: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.PHONE_NUMBER,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'phoneNumber--phoneNumber' || el.getAttribute('name') == 'phoneNumber',                    
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Phone Number*'
    },
    PHONE_EXTENSION: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.PHONE_EXTENSION,
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'phoneNumber--extension' || el.getAttribute('name') == 'extension',
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Phone Extension'
    },
    WORK_EXP_JOB_TITLE: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_JOB_TITLE,
        value: db => db.workExperiences.map(w => w.jobTitle),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('jobTitle'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Job Title*'
    },
    WORK_EXP_COMPANY: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_COMPANY_NAME,
        value: db => db.workExperiences.map(w => w.company),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('companyName'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Company*'
    },
    WORK_EXP_LOCATION: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_LOCATION,
        value: db => db.workExperiences.map(w => w.location),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('location'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Location'
    },
    WORK_EXP_CURRENTLY_WORKING: {
        type: FIELD_TYPE.CHECKBOX,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_END_DATE,
        value: db => {
            const endDate = resolveAnswerValue(db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_END_DATE), undefined);
            return isCurrentlyWorking(endDate);
        },
        elementValidator: (el) => el.getAttribute("name") === "currentlyWorkHere" || (el.id?.startsWith('workExperience') && el.id?.endsWith('currentlyWorkHere')),
        action: KNOWN_QUESTION_ACTION.FORCE_SKIP, // Synced during page initialization.
        notes: 'I currently work here'
    },
    WORK_EXP_START_DATE_MONTH: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_START_DATE,
        value: db => getMonth( resolveAnswerValue( db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_START_DATE), undefined ) ),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('startDate-dateSectionMonth-input'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Month'
    },
    WORK_EXP_START_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_START_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_START_DATE), undefined ) ),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('startDate-dateSectionYear-input'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Year'
    },
    WORK_EXP_END_DATE_MONTH: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_END_DATE,
        value: db => getMonth( resolveAnswerValue( db, 'endDate', undefined ) ),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('endDate-dateSectionMonth-input'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Month'
    },
    WORK_EXP_END_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_END_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.WORK_EXPERIENCES_END_DATE), undefined ) ),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('endDate-dateSectionYear-input'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Year'
    },
    WORK_EXP_ROLE_DESCRIPTION: {
        type: 'textarea',
        dbAnswerKey: DB_KEY_MAP.WORK_EXPERIENCES_ROLE_DESCRIPTION,
        value: db => resolveAnswerValue(db,getKey(DB_KEY_MAP.WORK_EXPERIENCES_ROLE_DESCRIPTION),undefined),
        elementValidator: (el) => el.id?.startsWith('workExperience') && el.id?.endsWith('roleDescription'),
        action: KNOWN_QUESTION_ACTION.SKIP_IF_DATA_UNAVAILABLE,
        notes: 'Role Description'
    },
    EDUCATION_SCHOOL: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.MULTISELECT],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_SCHOOL,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_SCHOOL), undefined),
        elementValidator: (el) => el.id?.startsWith('education') && (el.id?.endsWith('schoolName') || el.id?.endsWith('school')),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'School Name*'
    },
    EDUCATION_DEGREE: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DROPDOWN, FIELD_TYPE.MULTISELECT],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_DEGREE,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_DEGREE), []),
        elementValidator: (el) => el.id?.startsWith('education') && el.id?.endsWith('degree'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Degree*'
    },
    EDUCATION_MAJOR: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DROPDOWN, FIELD_TYPE.MULTISELECT],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_MAJOR,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_MAJOR), []),
        elementValidator: (el) => el.id?.startsWith('education') && el.id?.endsWith('fieldOfStudy'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Field of Study*'
    },
    EDUCATION_GPA: {
        type: ['text','number'],
        dbAnswerKey: DB_KEY_MAP.EDUCATION_GPA,
        value: db => resolveAnswerValue(db, getKey(DB_KEY_MAP.EDUCATION_GPA), undefined),
        elementValidator: (el) => el.id?.startsWith('education') && el.id?.endsWith('gradeAverage'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'GPA*'
    },
    EDUCATION_START_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EDUCATION_START_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.EDUCATION_START_DATE), undefined ) ),
        elementValidator: (el) => el.id?.startsWith('education') && el.id.includes('firstYearAttended'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'From* Start Year'
    },
    EDUCATION_END_DATE_YEAR: {
        type: FIELD_TYPE.TEXT,
        dbAnswerKey: DB_KEY_MAP.EDUCATION_END_DATE,
        value: db => getYear( resolveAnswerValue( db, getKey(DB_KEY_MAP.EDUCATION_END_DATE), undefined ) ),
        elementValidator: (el) => el.id?.startsWith('education') && el.id.includes('lastYearAttended'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'To* End Year'
    },
    LANGUAGE: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: db => { return "English" },
        elementValidator: (el) => el.getAttribute('name') === 'language',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Language*'
    },
    IS_FLUENT: {
        type: [FIELD_TYPE.CHECKBOX],
        dbAnswerKey: undefined,
        value: db => { return true },
        elementValidator: (el) => el.getAttribute('name') === 'native' && el.id?.startsWith('language'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'I am fluent in this language.*'
    },
    COMPREHENSION: {
        type: [FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: db => { return ["Advance", "Fluent"] },
        elementValidator: (el) => el.getAttribute('aria-label')?.startsWith('Comprehension') && el.id?.startsWith('language'),
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Comprehension*'
    },
    READING: {
        type: [FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: db => { return ["Advance", "Fluent"] },
        elementValidator: (el) => el.getAttribute('aria-label')?.startsWith('Reading') && el.id?.startsWith('language'),
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Reading*'
    },
    SPEAKING: {
        type: [FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: db => { return ["Advance", "Fluent"] },
        elementValidator: (el) => el.getAttribute('aria-label')?.startsWith('Speaking') && el.id?.startsWith('language'),
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Speaking*'
    },
    WRITING: {
        type: [FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: db => { return ["Advance", "Fluent"] },
        elementValidator: (el) => el.getAttribute('aria-label')?.startsWith('Writing') && el.id?.startsWith('language'),
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Writing*'
    },
    SKILLS: {
        type: FIELD_TYPE.MULTISELECT,
        dbAnswerKey: DB_KEY_MAP.SKILLS + '.skills',
        value: undefined,
        elementValidator: (el) => el.getAttribute('id') == 'skills--skills',
        timeout: 100,
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Skills*'
    },
    RESUME_UPLOAD: {
        type: 'file',
        dbAnswerKey: DB_KEY_MAP.RESUME_PATH,
        value: undefined,
        elementValidator: (el) => el.getAttribute('data-automation-id') == 'file-upload-input-ref',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Upload a file (5MB max)*'
    },
    WEBSITE: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: 'website.url',
        value: undefined,
        timeout: 30,
        elementValidator: (el) => el.id?.startsWith('webAddress') && el.id?.endsWith('url'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Website*'
    },
    LINKEDIN: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: DB_KEY_MAP.LINKEDIN,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'linkedInAccount' || el.id === 'socialNetworkAccounts--linkedInAccount',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'LinkedIn*'
    },
    FACEBOOK: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'facebookAccount' || el.id === 'socialNetworkAccounts--facebookAccount',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Facebook'
    },
    TWITTER: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.URL],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'twitterAccount' || el.id === 'socialNetworkAccounts--twitterAccount',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Twitter'
    },
    GENDER: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.GENDER,
        value: db => {
            const atsOptionalLabels = ["Not Specified"];
            const dbAnswer = resolveAnswerValue(db, DB_KEY_MAP.GENDER, undefined);

            const result = [];
            if (dbAnswer != null) result.push(dbAnswer);
            if (dbAnswer == null || dbAnswer === "Decline to state") {
                result.push(...atsOptionalLabels);
            }

            // Remove duplicates
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.getAttribute('name') === 'gender' || el.getAttribute('id') === 'personalInfoUS--gender',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Gender*'
    },
    SEXUAL_ORIENTATION: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.SEXUAL_ORIENTATION,
        value: db => resolveAnswerValue( db, DB_KEY_MAP.SEXUAL_ORIENTATION, undefined ),
        elementValidator: (el) => el.getAttribute('name') === 'sexualOrientation' || el.getAttribute('id') === 'sexualOrientation',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Sexual Orientation*'
    },
    LGBTQ_STATUS: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.LGBTQ_STATUS,
        value: db => resolveAnswerValue( db, DB_KEY_MAP.LGBTQ_STATUS, undefined ),
        elementValidator: (el) => el.getAttribute('name') === 'lgbtq' || el.getAttribute('id') === 'lgbtq',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'LGBTQ Status*'
    },
    ETHNICITY: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.ETHNICITY,
        value: db => {
            const dbEthnicity = resolveAnswerValue( db, DB_KEY_MAP.ETHNICITY, undefined ); // Array
            if (!Array.isArray(dbEthnicity) || !dbEthnicity.length) {
                return [];
            }

            // Push ATS specific options for mapped settings
            if (dbEthnicity.includes("South Asian")) {
                dbEthnicity.push("Asian (United States of America)");
            }
            return dbEthnicity;
        },
        elementValidator: (el) => el.getAttribute('name') === 'ethnicity' || el.getAttribute('id') === 'personalInfoUS--ethnicity' || el.id?.endsWith('ethnicityMulti'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Ethnicity*'
    },
    HISPANIC_OR_LATINO: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.HISPANIC_OR_LATINO,
        value: db => resolveAnswerValue( db, DB_KEY_MAP.HISPANIC_OR_LATINO, undefined ),
        elementValidator: (el) => el.getAttribute('name') === 'hispanicOrLatino' || el.getAttribute('id') === 'personalInfoUS--hispanicOrLatino',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Hispanic or Latino*'
    },
    IDENTIFICATION_LANGUAGE: {
        type: [FIELD_TYPE.DROPDOWN],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('aria-label')?.startsWith('Language'),
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Language*'
    },
    EMPLOYEE_ID: {
        type: [FIELD_TYPE.TEXT],
        dbAnswerKey: undefined,
        value: undefined,
        elementValidator: (el) => el.getAttribute('name') === 'employeeId' || el.getAttribute('id') === 'selfIdentifiedDisabilityData--employeeId',
        action: KNOWN_QUESTION_ACTION.SKIP,
        notes: 'Employee ID'
    },
    TODAY_DAY: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DATE],
        dbAnswerKey: undefined,
        value: db => getLocalDate('dd'),
        elementValidator: (el) => (el.getAttribute('aria-label') === 'Day') && (el.id.includes('dateSignedOn')),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Today day*'
    },
    TODAY_MONTH: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DATE],
        dbAnswerKey: undefined,
        value: db => getLocalDate('mm'),
        elementValidator: (el) => (el.getAttribute('aria-label') === 'Month') && (el.id.includes('dateSignedOn')),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Today month*'
    },
    TODAY_YEAR: {
        type: [FIELD_TYPE.TEXT, FIELD_TYPE.DATE],
        dbAnswerKey: undefined,
        value: db => getLocalDate('yyyy'),
        elementValidator: (el) => (el.getAttribute('aria-label') === 'Year') && (el.id.includes('dateSignedOn')),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Today year*'
    },
    VETERAN_STATUS: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.VETERAN_STATUS,
        value: db => {
            const atsOptionalLabels = ["I do not wish to self identify", "Decline to state"];
            
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
                result.push(...atsOptionalLabels);
            } else {
                result.push(dbAnswer);
            }

            // Ensure uniqueness
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.getAttribute('name') === 'veteranStatus' || el.getAttribute('id') === 'personalInfoUS--veteranStatus',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Veteran Status*'
    },
    DISABILITY_STATUS: {
        type: [FIELD_TYPE.DROPDOWN, FIELD_TYPE.SELECT, FIELD_TYPE.CHECKBOX, FIELD_TYPE.RADIO],
        dbAnswerKey: DB_KEY_MAP.DISABILITY_STATUS,
        value: db => {
            const atsOptionalLabels = ["I do not want to answer"];
            
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
                result.push(...atsOptionalLabels);
            } else {
                result.push(dbAnswer);
            }

            // Ensure uniqueness
            return Array.from(new Set(result));
        },
        elementValidator: (el) => el.id?.endsWith('disabilityStatus'),
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Disability Status*'
    },
    TERMS_AGREEMENT: {
        type: [FIELD_TYPE.CHECKBOX],
        dbAnswerKey: undefined,
        value: db => { return true },
        elementValidator: (el) => el.id?.startsWith('termsAndConditions') || el.getAttribute('name') === 'acceptTermsAndAgreements',
        action: KNOWN_QUESTION_ACTION.RESOLVE,
        notes: 'Terms and Conditions*'
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

    if (!Object.values(WORKDAY_PAGES).includes(page)) throw new Error(`Invalid page: ${page}`);

    function allExcept(...excludedKeys) {
        return KNOWN_QUESTION_SELECTION.ALL.filter(k => !excludedKeys.includes(k));
    }

    switch (page) {

        // For selection: https://onlinegdb.com/QbOcPoenM

        case WORKDAY_PAGES.DESCRIPTION_PAGE:
            return KNOWN_QUESTION_SELECTION.NONE;
        
        case WORKDAY_PAGES.AUTH_PAGE:
            return [KNOWN_QUESTION_KEYS.EMAIL, KNOWN_QUESTION_KEYS.PASSWORD, KNOWN_QUESTION_KEYS.CREATE_ACCOUNT_CONCENT];

        case WORKDAY_PAGES.INFO_PAGE:
            return [
                KNOWN_QUESTION_KEYS.SOURCE, 
                KNOWN_QUESTION_KEYS.IS_PREVIOUS_WORKER, 
                KNOWN_QUESTION_KEYS.COUNTRY, 
                KNOWN_QUESTION_KEYS.LEGAL_NAME_PREFIX,
                KNOWN_QUESTION_KEYS.LEGAL_NAME_SUFFIX,
                KNOWN_QUESTION_KEYS.FIRST_NAME, 
                KNOWN_QUESTION_KEYS.MIDDLE_NAME,
                KNOWN_QUESTION_KEYS.LAST_NAME, 
                KNOWN_QUESTION_KEYS.LOCAL_FIRST_NAME, 
                KNOWN_QUESTION_KEYS.LOCAL_LAST_NAME, 
                KNOWN_QUESTION_KEYS.HAS_PREFERRED_NAME, 
                KNOWN_QUESTION_KEYS.PREFERRED_NAME_PREFIX,
                KNOWN_QUESTION_KEYS.PREFERRED_NAME_SUFFIX,
                KNOWN_QUESTION_KEYS.PREFERRED_FIRST_NAME,
                KNOWN_QUESTION_KEYS.PREFERRED_MIDDLE_NAME, 
                KNOWN_QUESTION_KEYS.PREFERRED_LAST_NAME, 
                KNOWN_QUESTION_KEYS.ADDRESS_LINE_1,
                KNOWN_QUESTION_KEYS.ADDRESS_LINE_2,
                KNOWN_QUESTION_KEYS.CITY,
                KNOWN_QUESTION_KEYS.STATE,
                KNOWN_QUESTION_KEYS.POSTAL_CODE,
                KNOWN_QUESTION_KEYS.COUNTY,
                KNOWN_QUESTION_KEYS.EMAIL_INFO,
                KNOWN_QUESTION_KEYS.PHONE_DEVICE_TYPE,
                KNOWN_QUESTION_KEYS.COUNTRY_PHONE_CODE,
                KNOWN_QUESTION_KEYS.PHONE_NUMBER, 
                KNOWN_QUESTION_KEYS.PHONE_EXTENSION
            ];

        case WORKDAY_PAGES.EXP_PAGE:
            return [
                KNOWN_QUESTION_KEYS.WORK_EXP_JOB_TITLE,
                KNOWN_QUESTION_KEYS.WORK_EXP_COMPANY,
                KNOWN_QUESTION_KEYS.WORK_EXP_LOCATION,
                KNOWN_QUESTION_KEYS.WORK_EXP_CURRENTLY_WORKING,
                KNOWN_QUESTION_KEYS.WORK_EXP_START_DATE_MONTH,
                KNOWN_QUESTION_KEYS.WORK_EXP_START_DATE_YEAR,
                KNOWN_QUESTION_KEYS.WORK_EXP_END_DATE_MONTH,
                KNOWN_QUESTION_KEYS.WORK_EXP_END_DATE_YEAR,
                KNOWN_QUESTION_KEYS.WORK_EXP_ROLE_DESCRIPTION,
                KNOWN_QUESTION_KEYS.EDUCATION_SCHOOL,
                KNOWN_QUESTION_KEYS.EDUCATION_DEGREE,
                KNOWN_QUESTION_KEYS.EDUCATION_MAJOR,
                KNOWN_QUESTION_KEYS.EDUCATION_GPA,
                KNOWN_QUESTION_KEYS.EDUCATION_START_DATE_YEAR,
                KNOWN_QUESTION_KEYS.EDUCATION_END_DATE_YEAR,
                KNOWN_QUESTION_KEYS.LANGUAGE,
                KNOWN_QUESTION_KEYS.IS_FLUENT,
                KNOWN_QUESTION_KEYS.COMPREHENSION,
                KNOWN_QUESTION_KEYS.READING,
                KNOWN_QUESTION_KEYS.SPEAKING,
                KNOWN_QUESTION_KEYS.WRITING,
                KNOWN_QUESTION_KEYS.SKILLS,
                KNOWN_QUESTION_KEYS.RESUME_UPLOAD,
                KNOWN_QUESTION_KEYS.WEBSITE,
                KNOWN_QUESTION_KEYS.LINKEDIN,
                KNOWN_QUESTION_KEYS.FACEBOOK,
                KNOWN_QUESTION_KEYS.TWITTER,
            ]

        case WORKDAY_PAGES.QUESTIONNAIRE_PAGE:
            return KNOWN_QUESTION_SELECTION.NONE;


        case WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE:
            return [
                KNOWN_QUESTION_KEYS.GENDER,
                KNOWN_QUESTION_KEYS.SEXUAL_ORIENTATION,
                KNOWN_QUESTION_KEYS.LGBTQ_STATUS,
                KNOWN_QUESTION_KEYS.ETHNICITY,
                KNOWN_QUESTION_KEYS.HISPANIC_OR_LATINO,
                KNOWN_QUESTION_KEYS.VETERAN_STATUS,
                KNOWN_QUESTION_KEYS.DISABILITY_STATUS,
                KNOWN_QUESTION_KEYS.TERMS_AGREEMENT,
            ]

        case WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE:
            return [
                KNOWN_QUESTION_KEYS.IDENTIFICATION_LANGUAGE,
                KNOWN_QUESTION_KEYS.FULL_NAME,
                KNOWN_QUESTION_KEYS.EMPLOYEE_ID,
                KNOWN_QUESTION_KEYS.TODAY_DAY,
                KNOWN_QUESTION_KEYS.TODAY_MONTH,
                KNOWN_QUESTION_KEYS.TODAY_YEAR,
                KNOWN_QUESTION_KEYS.GENDER,
                KNOWN_QUESTION_KEYS.SEXUAL_ORIENTATION,
                KNOWN_QUESTION_KEYS.LGBTQ_STATUS,
                KNOWN_QUESTION_KEYS.ETHNICITY,
                KNOWN_QUESTION_KEYS.HISPANIC_OR_LATINO,
                KNOWN_QUESTION_KEYS.VETERAN_STATUS,
                KNOWN_QUESTION_KEYS.DISABILITY_STATUS,
                KNOWN_QUESTION_KEYS.TERMS_AGREEMENT,
            ]

        case WORKDAY_PAGES.REVIEW_PAGE:
            return KNOWN_QUESTION_SELECTION.NONE;
        
        default:
            return KNOWN_QUESTION_SELECTION.ALL;
            // return allExcept(
            //     KNOWN_QUESTION_KEYS.PASSWORD,
            //     KNOWN_QUESTION_KEYS.SECONDARY_PASSWORD,
            //     KNOWN_QUESTION_KEYS.CREATE_ACCOUNT_CONCENT,
            // );
    }

}

export function getLabelEmbeddingKeys(page) {

    if (!Object.values(WORKDAY_PAGES).includes(page)) throw new Error(`Invalid page: ${page}`);

    function allExcept(...excludedKeys) {
        return LABEL_EMBEDDING_SELECTION.ALL.filter(k => !excludedKeys.includes(k));
    }

    switch (page) {

        // For selection (may not be up-to-date): https://onlinegdb.com/64TRPnPgf
        
        case WORKDAY_PAGES.DESCRIPTION_PAGE:
            return LABEL_EMBEDDING_SELECTION.NONE;

        case WORKDAY_PAGES.AUTH_PAGE:
            return [ 
                LABEL_EMBEDDING_KEYS.EMAIL,
                LABEL_EMBEDDING_KEYS.PASSWORD,
                LABEL_EMBEDDING_KEYS.CONFIRM_PASSWORD,
            ];

        case WORKDAY_PAGES.INFO_PAGE:
            return [
                LABEL_EMBEDDING_KEYS.FIRST_NAME,
                LABEL_EMBEDDING_KEYS.LAST_NAME,
                LABEL_EMBEDDING_KEYS.FULL_NAME,
                LABEL_EMBEDDING_KEYS.PREFERRED_NAME,
                LABEL_EMBEDDING_KEYS.PHONE_NUMBER,
                LABEL_EMBEDDING_KEYS.ADDRESS_LINE_1,
                LABEL_EMBEDDING_KEYS.ADDRESS_LINE_2,
                LABEL_EMBEDDING_KEYS.CITY,
                LABEL_EMBEDDING_KEYS.STATE,
                LABEL_EMBEDDING_KEYS.COUNTRY,
                LABEL_EMBEDDING_KEYS.POSTAL_CODE,
                LABEL_EMBEDDING_KEYS.GENDER_IDENTITY,
            ];

        case WORKDAY_PAGES.EXP_PAGE:
            return [
                LABEL_EMBEDDING_KEYS.CURRENT_OR_MOST_RECENT_JOB_TITLE,
                LABEL_EMBEDDING_KEYS.PREVIOUS_JOB_TITLE,
                LABEL_EMBEDDING_KEYS.COMPANY_NAME_CURRENT_OR_PREVIOUS,
                LABEL_EMBEDDING_KEYS.YEARS_OF_EXPERIENCE_TOTAL,
                LABEL_EMBEDDING_KEYS.YEARS_OF_RELEVANT_EXPERIENCE,
                LABEL_EMBEDDING_KEYS.CURRENTLY_EMPLOYED,
                LABEL_EMBEDDING_KEYS.REASON_FOR_LEAVING,
                LABEL_EMBEDDING_KEYS.SCHOOL_NAME,
                LABEL_EMBEDDING_KEYS.DEGREE_LEVEL,
                LABEL_EMBEDDING_KEYS.DEGREE_TITLE,
                LABEL_EMBEDDING_KEYS.MAJOR_FIELD_OF_STUDY,
                LABEL_EMBEDDING_KEYS.GRADUATION_DATE,
                LABEL_EMBEDDING_KEYS.GPA_OR_ACADEMIC_PERFORMANCE,
            ]

        case WORKDAY_PAGES.QUESTIONNAIRE_PAGE:
            return allExcept(
                LABEL_EMBEDDING_KEYS.EMAIL,
                LABEL_EMBEDDING_KEYS.CONFIRM_EMAIL_ADDRESS,
                LABEL_EMBEDDING_KEYS.USERNAME,
                LABEL_EMBEDDING_KEYS.PASSWORD,
                LABEL_EMBEDDING_KEYS.CONFIRM_PASSWORD,
                LABEL_EMBEDDING_KEYS.FIRST_NAME,
                LABEL_EMBEDDING_KEYS.LAST_NAME,
                LABEL_EMBEDDING_KEYS.FULL_NAME,
                LABEL_EMBEDDING_KEYS.PREFERRED_NAME,
                LABEL_EMBEDDING_KEYS.PHONE_NUMBER,
                LABEL_EMBEDDING_KEYS.ADDRESS_LINE_1,
                LABEL_EMBEDDING_KEYS.ADDRESS_LINE_2,
                LABEL_EMBEDDING_KEYS.CITY,
                LABEL_EMBEDDING_KEYS.STATE,
                LABEL_EMBEDDING_KEYS.COUNTRY,
                LABEL_EMBEDDING_KEYS.POSTAL_CODE,
            );

        case WORKDAY_PAGES.VOLUNTARY_DISCLOSURE_PAGE:
        case WORKDAY_PAGES.SELF_IDENTIFICATION_PAGE:
            return [
                LABEL_EMBEDDING_KEYS.VISA_SPONSORSHIP_REQUIREMENT,
                LABEL_EMBEDDING_KEYS.VISA_SPONSORSHIP_REQUIREMENT_NEGATIVES,
                LABEL_EMBEDDING_KEYS.VISA_STATUS,
                LABEL_EMBEDDING_KEYS.WORK_AUTHORIZATION,
                LABEL_EMBEDDING_KEYS.RIGHT_TO_WORK,
                LABEL_EMBEDDING_KEYS.RIGHT_TO_WORK_NEGATIVE,
                LABEL_EMBEDDING_KEYS.LEGAL_WORKING_AGE,
                LABEL_EMBEDDING_KEYS.BACKGROUND_CHECK,
                LABEL_EMBEDDING_KEYS.EXPORT_CONTROL_OR_EMPLOYMENT_RESTRICTIONS,
                LABEL_EMBEDDING_KEYS.NON_COMPETE_OR_CONTRACTUAL_OBLIGATIONS,
                LABEL_EMBEDDING_KEYS.SECURITY_CLEARANCE,
                LABEL_EMBEDDING_KEYS.CITIZENSHIP_OR_PERMANENT_RESIDENCY,
                LABEL_EMBEDDING_KEYS.GOVERNMENT_EMPLOYMENT_OR_AFFILIATION,

                LABEL_EMBEDDING_KEYS.GENDER_IDENTITY,
                LABEL_EMBEDDING_KEYS.SEXUAL_ORIENTATION,
                LABEL_EMBEDDING_KEYS.LGBTQ_STATUS,
                LABEL_EMBEDDING_KEYS.ETHNICITY_RACE,
                LABEL_EMBEDDING_KEYS.HISPANIC_OR_LATINO,
                LABEL_EMBEDDING_KEYS.MILITARY_SERVICE,
                LABEL_EMBEDDING_KEYS.VETERAN_STATUS,
                LABEL_EMBEDDING_KEYS.DISABILITY_STATUS,

                LABEL_EMBEDDING_KEYS.REFERRAL_SOURCE,
                LABEL_EMBEDDING_KEYS.PREVIOUS_EMPLOYMENT_WITH_COMPANY,
                LABEL_EMBEDDING_KEYS.CRIMINAL_BACKGROUND_DISCLOSURE,
                LABEL_EMBEDDING_KEYS.CONFLICT_OF_INTEREST,
                LABEL_EMBEDDING_KEYS.RELATIVES_IN_COMPANY,
                LABEL_EMBEDDING_KEYS.PREVIOUS_DISCIPLINARY_ACTION,
                LABEL_EMBEDDING_KEYS.BANKRUPTCY_DISCLOSURE,
                LABEL_EMBEDDING_KEYS.PROFESSIONAL_LICENSE_SUSPENSION,
                LABEL_EMBEDDING_KEYS.EMPLOYMENT_LITIGATION_HISTORY,

                LABEL_EMBEDDING_KEYS.PROFESSIONAL_REFERENCES,
                LABEL_EMBEDDING_KEYS.WILLINGNESS_TO_SIGN_CONFIDENTIALITY_AGREEMENT,
                LABEL_EMBEDDING_KEYS.ABILITY_TO_PERFORM_JOB_FUNCTIONS,
                LABEL_EMBEDDING_KEYS.DRIVER_LICENSE_STATUS,
                LABEL_EMBEDDING_KEYS.DRUG_TEST_CONSENT,
                LABEL_EMBEDDING_KEYS.CONSENT_TO_DATA_PROCESSING,
                LABEL_EMBEDDING_KEYS.CONSENT_TO_PRE_EMPLOYMENT_CHECKS,
                LABEL_EMBEDDING_KEYS.ACCURACY_OF_INFORMATION,
                LABEL_EMBEDDING_KEYS.ACKNOWLEDGMENT_OF_TERMS,
                LABEL_EMBEDDING_KEYS.CONSENT_TO_REFERENCE_CHECK,
                LABEL_EMBEDDING_KEYS.CONSENT_TO_BACKGROUND_VERIFICATION,
                LABEL_EMBEDDING_KEYS.CONSENT_TO_ELECTRONIC_COMMUNICATION,
                LABEL_EMBEDDING_KEYS.ACKNOWLEDGMENT_OF_AT_WILL_EMPLOYMENT,
                LABEL_EMBEDDING_KEYS.ACKNOWLEDGMENT_OF_DATA_RETENTION,
                LABEL_EMBEDDING_KEYS.ACKNOWLEDGMENT_OF_PRE_EMPLOYMENT_REQUIREMENTS,
                LABEL_EMBEDDING_KEYS.ACKNOWLEDGMENT_OF_EQUAL_OPPORTUNITY_POLICY,
            ]

        case WORKDAY_PAGES.REVIEW_PAGE:
            return LABEL_EMBEDDING_SELECTION.NONE;

        default:
            return LABEL_EMBEDDING_SELECTION.ALL;

    }
}
