import { sleep, throwIfAborted, getQuestionId, resolveValidElements, sendQuestionsToLLM, resolveAnswerValue } from '@shared/utils/utility.js';
import { FIELD_TYPE, FIELD_VALIDATOR, FIELD_TIMEOUT_MAP, forceCommitFields, forceCommitAllListbox, clearFields } from '@form/formUtils.js';
import { radioSelect, checkboxSelect, dropdownSelect } from '@form/formHandlers.js';
import { LABEL_DEFINITIONS } from '@shared/config/labelConfig.js';
import { DB_KEY_MAP } from '@shared/config/config.js';

const USER_DB = await (await fetch(chrome.runtime.getURL('web/userData.json'))).json();


/* --------------------------------------------------------------------------
 * 💎 QUESTIONS DECISION AND GUIDED FLOW (BEFORE RESOLUTION)
 * ------------------------------------------------------------------------ */
export const KNOWN_QUESTION_ACTION = Object.freeze({
    RESOLVE: 'RESOLVE', 
    SKIP: 'SKIP', // Skip get overrided if question is (**required** + **unset**)
    SKIP_IF_DATA_UNAVAILABLE: 'SKIP_IF_DATA_UNAVAILABLE', // Skip get overrided (calls LLM) if question is (**required** + **unset**)
    FORCE_SKIP: 'FORCE_SKIP',
    // ... add more as needed
});


/* --------------------------------------------------------------------------
 * 💎 QUESTIONS RESOLUTION OUTCOME (BEFORE EXECUTION)
 * ------------------------------------------------------------------------ */
export const RESOLUTION_STATUS = {
    ANSWERED: "ANSWERED",
    SKIPPED: "SKIPPED",
    NEEDS_LLM: "NEEDS_LLM",
    STRUCTURAL_FAILURE: "STRUCTURAL_FAILURE",
    ERROR: "ERROR",
};


/* --------------------------------------------------------------------------
 * 💎 QUESTIONS EXECUTION RESPONSE (BEFORE CORRECTION)
 * ------------------------------------------------------------------------ */
export const EXECUTION_STATUS = {
    OK: "OK",
    ERROR: "ERROR",
};


/* --------------------------------------------------------------------------
 * 💎 QUESTIONS CORRECTION REQUIREMENT (POST RESOLUTION/EXECUTION)
 * ------------------------------------------------------------------------ */
export const CORRECTION_TYPE = {
    REMOVE_WORK_CONTAINER: "REMOVE_WORK_CONTAINER",
    REMOVE_EDU_CONTAINER: "REMOVE_EDU_CONTAINER",
    REMOVE_WEBSITE_CONTAINER: "REMOVE_WEBSITE_CONTAINER",
    MARK_QUESTION_FAILED: "MARK_QUESTION_FAILED",
};


/* --------------------------------------------------------------------------
 * 🧩 buildForceSkipValidatorBank(knownQuestions, knownQuestionKeys)
 * ------------------------------------------------------------------------ */
export function buildForceSkipValidatorBank({ knownQuestions, knownQuestionKeys }) {
	return knownQuestionKeys
		.map(key => knownQuestions[key])
		.filter(Boolean)
		.filter(q => q.action === KNOWN_QUESTION_ACTION.FORCE_SKIP)
		.map(q => q.elementValidator)
		.filter(fn => typeof fn === 'function');
}


/* --------------------------------------------------------------------------
 * 🧩 matchQuestionWithKnownElements(question, knownQuestionKeys)
 * ------------------------------------------------------------------------ */
/**
 * Matches a dynamically detected form question against a predefined 
 * known question candidates using element validator.
 *
 * This is useful for automation scripts that need to determine which
 * known field configuration (type, validator, value, etc.) applies to
 * a detected question on the page.
 *
 * @function matchQuestionWithKnownElements
 * @param {object} question - A detected question object, typically containing:
 *   • `type` {string}       	→ The question's field type (e.g., 'multiselect', 'radio')
 *   • `fields` {HTMLElement[]} → Array of associated HTML elements for the question
 * 	 • `label`: {HTMLElement}  	→ Lable HTML element of that question
 *   • `required`: {bool}		→ Boolean if question is mandatory or not.
 * @param {Object.keys(KNOWN_QUESTIONS)|KNOWN_QUESTION_SELECTION} knownQuestionKeys - Array of known question keys or selection type.
 * 
 * @returns {object|null} The matching candidate object from `QUESTIONS.INFO_PAGE` if a match is found:
 *   • `type` {string}       	        → Expected field type
 *   • `dbAnswerKey` {string|function}  → Database key or compatible function (to fetch formated value) for answer.
 *   • `value` {any}         	        → Predefined answer(s) to be filled
 *   • `elementValidator` {function} 	→ Function to validate which element corresponds to this candidate
 *   • `timeout` {number}    	        → Optional timeout in seconds for interacting with this field
 *   • `notes` {string}      	        → Optional description or notes
 *   Returns `null` if no matching candidate is found.
 */
function matchQuestionWithKnownElements(question, allQuestionMap, knownQuestionKeys, { debug = false } = {}) {

    if (!Array.isArray(knownQuestionKeys) || !knownQuestionKeys.length) {
        return null;
    }

    const targetKeys = Array.isArray(knownQuestionKeys)
        ? knownQuestionKeys
        : Object.keys(allQuestionMap);


	// Returns true/false
	function matchesQuestionType(questionType, knownType) {
		if (!knownType) return false;

		// Known type can be a single string or an array
		if (Array.isArray(knownType)) {
			return knownType.includes(questionType);
		}

		return knownType === questionType;
	}

    /* -------------------------------------------------
     * ELEMENT MATCH (STRONGEST SIGNAL)
     * -------------------------------------------------
     * Strategy:
     * - Match question type (supports single or multiple known types)
     * - Validate presence of elementValidator
     * - If ANY field satisfies the validator → authoritative match
     * ------------------------------------------------- */
    for (const key of targetKeys) {
        const knownQuestion = allQuestionMap[key];

        // 1️⃣ Type compatibility check (string OR array)
        if (!matchesQuestionType(question.type, knownQuestion.type)) {
            continue;
        }

        // 2️⃣ Validator presence
        if (typeof knownQuestion.elementValidator !== 'function') {
            continue;
        }

        // 3️⃣ Element-level validation (strongest signal)
        const matched = question.fields?.some(el =>
            knownQuestion.elementValidator(el)
        );

        if (matched) {
            // if (debug) {
            //     console.info(
            //         '[MATCH:ELEMENT]',
            //         knownQuestion.notes || key,
            //         // { questionType: question.type }
            //     );
            // }
            return knownQuestion;
        }
    }

    if (debug) {
        console.info('[UNMATCH:ELEMENT]', question.labelText);
    }

    return null;
}


/* --------------------------------------------------------------------------
 * 🧠 resolveATSQuestions()
 * ------------------------------------------------------------------------ */
export async function resolveATSQuestions(
    getQuestions, // function
    knownQuestions, // Dict[`type`, `dbAnswerKey`, `value`, `elementValidator`, `action`, `locators`, `timeout`, `notes`]
    knownQuestionKeys, // array[]
    labelEmbeddingKeys, // array[]
	isQuestionSet, // function
	getOptions, // function
    resolveAnswer, // function
    formManager, // function
    applyCorrection, // function
    getJobDetails, // function
    {
        errorOnly = false, // bool
        maxIterations = 6, // int
        maxAttemptsPerQuestion = 3, // int
        batchDelayMs = 200, // float|int
        initNewIteration, // function
    } = {}
) {

	const timeout = (ms, payload) => new Promise(resolve => setTimeout(() => resolve({ success: false, reason: 'timeout', ...payload}), ms));


	const forceSkipValidatorBank = buildForceSkipValidatorBank({ knownQuestions, knownQuestionKeys });

	// ----------------------------------------------------------------------
    // Persistent Storage Variables across Iteration.
    // ----------------------------------------------------------------------
    let unresolvedQuestions = [];
    const corrections = [];
    const resolvedQuestionIds = new Set();
	const vanishedQuestionIds = new Set();
	const questionAttemptCount = new Map(); /** Map<questionId, number> */
	const exhaustedQuestionIds = new Set();

	// ----------------------------------------------------------------------
    // LLM Bucket (persists across iterations)
    // ----------------------------------------------------------------------
    /**
	 * @typedef {{
	 *   questionId: string,
	 *   labelText: string,
	 *   type: string,
	 *   options?: string[],
	 *   hints?: string[],
	 *   relevantDBKeys?: string[],
	 *   reason: "needs_llm" | "execution_failed"
	 * }} LLMMetadata
	 */
	/** 
	 * Map<questionId, LLMMetadata>
	 */
    const llmRequestsQueue = new Map();

	/** @type {Map<string, {value: any, locators?: HTMLElement[], meta?: object}>} */
	/** 
	 * Map<questionId, {value: any, locators?: HTMLElement[], meta?: object}>}>
	 */
	const llmAnswersCache = new Map();


	// ------------------------------------------------------------------
	// 🔹 Register Question for LLM Resolution
	// ------------------------------------------------------------------
	async function setLLMBucket(question, matchedQuestionCandidate, matchedLabelCandidates, { options = [], hint = null, reason = "unknown" } = {}) {
					
		const qId = getQuestionId(question);

		if (!options.length) {
			const locators = resolveValidElements(question.fields, FIELD_VALIDATOR[question.type] ? [FIELD_VALIDATOR[question.type]] : [], 'AND', { includeDescendants: true });
			options = await getOptions(locators, question.type) ?? []
		}
		
		const relevantDBKeys = [];
		const hints = [];

		if (hint) {
			hints.push(hint);
		}

		if (matchedQuestionCandidate?.dbAnswerKey) {
			if (!(
				matchedQuestionCandidate.dbAnswerKey?.startsWith(DB_KEY_MAP.ADDRESSES)
				|| matchedQuestionCandidate.dbAnswerKey?.startsWith(DB_KEY_MAP.RESUME)
				|| matchedQuestionCandidate.dbAnswerKey?.startsWith(DB_KEY_MAP.WORK_EXPERIENCES)
				|| matchedQuestionCandidate.dbAnswerKey?.startsWith(DB_KEY_MAP.EDUCATION)
				|| matchedQuestionCandidate.dbAnswerKey?.startsWith(DB_KEY_MAP.SKILLS)
				|| matchedQuestionCandidate.dbAnswerKey?.startsWith('website.')
			)) {
				relevantDBKeys.push(matchedQuestionCandidate.dbAnswerKey);
			}
		}
		if (matchedQuestionCandidate?.value) {
			const hint = typeof matchedQuestionCandidate.value === "function" ?
				resolveAnswerValue(USER_DB, matchedQuestionCandidate.value, undefined) : 	// Using DB Function
				matchedQuestionCandidate?.value;														// Using static assigned value
			if (hint) hints.push(hint);
		}

		for (const candidate of matchedLabelCandidates) {
			const labelDef = LABEL_DEFINITIONS[candidate.key];
			if (labelDef?.dbAnswerKey) {
				relevantDBKeys.push(labelDef.dbAnswerKey);
			}
			if (typeof labelDef?.hint === "function") {
				const hint = labelDef.hint(question, USER_DB);
				if (hint) hints.push(hint);
			}
		}

		// Set for supported question types. 
		if (
			["text", "email", "number", "tel", "url", 
			"search", "password", "textarea", "radio", "select", 
			"dropdown", "checkbox", "multiselect", "date"].includes(question.type)
		) {
			llmRequestsQueue.set(qId, {
				questionId: qId,
				labelText: question.labelText || "",
				type: question.type,
				required: question.required,
				options: options,
				hints: hints,
				relevantDBKeys: relevantDBKeys,
				reason: reason
			});
		}
		
	}

	const inFlightQuestionIds = new Set();


    let iteration = 0;
    while (iteration < maxIterations) {
        iteration++;
		throwIfAborted();

        // ✅ reset shared iteration state if callback exists
        if (typeof initNewIteration === 'function') await initNewIteration();

		console.log(`---------- Iteration ${iteration} ------------`);

        // 1️⃣ Always re-scrape current DOM
		const currentQuestions = (await getQuestions({ errorOnly, forceSkipValidatorBank })).map(q => ({
			...q,
			labelText: (q?.label?.textContent ?? q?.labelText ?? '').trim(),
			subLabelText: q?.subLabelText ?? null,
		}));
		console.log("❔Current Questions:::", currentQuestions);

		// ------------------------------------------------------------
		// Remove vanished questions from llmRequestsQueue
		// ------------------------------------------------------------
		for (const qId of llmRequestsQueue.keys()) {
			const stillExistsInDOM = currentQuestions.some(
				q => getQuestionId(q) === qId
			);
			if (!stillExistsInDOM) {
				vanishedQuestionIds.add(qId);
				console.log("🧹 Removing vanished question from LLM request queue:", qId);
				llmRequestsQueue.delete(qId);
			}
		}

        // 2️⃣ Filter unresolved questions
        unresolvedQuestions = currentQuestions.filter(q => {
			const qId = getQuestionId(q);
			return (
				!resolvedQuestionIds.has(qId) 
				&& !exhaustedQuestionIds.has(qId)
			);
		});
		console.log("♾️ Unresolved Questions:::", unresolvedQuestions);
        if (!unresolvedQuestions.length) break; // No new work → we're done

		// ------------------------------------------------------------------
        // 🔹 Independent progress signals per iteration
        // ------------------------------------------------------------------
        let anyResolvedThisRound = false;   // did we fill something?
        let anyCorrectionThisRound = false; // did we modify DOM?
        let anyNewLLMRegistered = false;   // did we queue anything for LLM?

        // 3️⃣ Create PARALLEL execution promises (IMPORTANT: return them)
        const fillPromises = unresolvedQuestions.map(async (question) => {

			throwIfAborted();

			const qId = getQuestionId(question);
			let matchedQuestion;

			if (inFlightQuestionIds.has(qId)) {
				return { success: false, question, reason: "already_executing" };
			}

			// Check if an LLM request with the given qId is already in the queue. 
			// If it is, return early to prevent redundant processing and avoid 
			// incorrectly incrementing the `questionAttemptCount`.
			// Note: (LLM request queue) <-- cleared after (receiving LLM response & storing in `llmAnswersCache`)
			if (llmRequestsQueue.has(qId)) { // optionally add: (!llmAnswersCache.has(qId))
				return { success: false, question, reason: "llm_request_already_in_queue" }
			}
			
			// At this crucial stage, to avoid wasting attempts with local resolution, 
			// if we're near the last attempt or last iteration for a question, 
			// we escalate directly to LLM resolution before proceeding further.
			if (
				maxAttemptsPerQuestion > 2 // atleast 2 default attempts should exists before forcing LLM fallback
				&& (questionAttemptCount.get(qId) ?? 0) === maxAttemptsPerQuestion - 1 // if this is the last question attempt.
				&& !(iteration === maxIterations) // ensure next iteration exists, otherwise continue attempt in default mode.
				&& !(llmAnswersCache.has(qId)) // continue to resolution step if answer is derived from LLM.
			) {
				matchedQuestion = matchQuestionWithKnownElements(question, knownQuestions, knownQuestionKeys);
				await setLLMBucket(question, matchedQuestion ?? {}, [], {reason: 'last_attempt_escalates_llm'});
				anyNewLLMRegistered = true;
				return { success: false, question, reason: "needs_llm" };
			}

			// Initialize or Increment attempt counter
			questionAttemptCount.set(qId, (questionAttemptCount.get(qId) ?? 0) + 1);
			// Bail early if this question exceeded max attempts
			if (questionAttemptCount.get(qId) > maxAttemptsPerQuestion) {
				console.warn(`⛔ Max attempts exceeded for question:`, question?.labelText);
				exhaustedQuestionIds.add(qId);
				questionAttemptCount.delete(qId);
				return { success: false, question, reason: 'max_attempts_exceeded', exhausted: true };
			}

			// Clear fields.
			if (errorOnly || question.type === 'checkbox') {
				await clearFields(question.fields);
			}
            
            /* -------------------------------------------------
            * LOCATORS RESOLUTION FILTER
            * ------------------------------------------------- */
			/** -------------------------------------------------
             * question.fields -> Array[HTMLElement]
             * Apply filter over fields based on type (true(valid)/false(invalid) for each field derived from FIELD_VALIDATOR).
             * Result: locators <- Push Array[valid HTMLElement]
            ------------------------------------------------- */
			const locators = resolveValidElements(question.fields, FIELD_VALIDATOR[question.type] ? [FIELD_VALIDATOR[question.type]] : [], 'AND', { includeDescendants: true });

			// ----------- STEP 1: DECIDE (NO EXECUTION YET) -----------
			let answerResolution;
			if (llmAnswersCache.has(qId)) {
				answerResolution = { status: RESOLUTION_STATUS.ANSWERED, locators: locators, value: llmAnswersCache.get(qId), meta: {}, source: 'LLM' }
			}
			else {
				/**
				 * @typedef {Object} QuestionEntry
				 * @property {string|Array[FIELD_TYPE]} type - The type of the field (e.g., 'text', ['checkbox', 'radio'], 'multiselect')
				 * @property {string} dbAnswerKey - The key to answer in our DB (using DB_KEY_MAP)
				 * @property {function} value - The value to fill (string or array)
				 * @property {function} elementValidator - Function to validate the field
				 * @property {KNOWN_QUESTION_ACTION} action - Defines resolution approach. 
				 * @property {number} [timeout] - Optional timeout in seconds
				 * @property {string} NOTES - Any descriptive notes 
				*/
				/** @type {QuestionEntry|null} */
				if (!matchedQuestion) {
					matchedQuestion = matchQuestionWithKnownElements(question, knownQuestions, knownQuestionKeys);
				}

				if (
					matchedQuestion?.action === KNOWN_QUESTION_ACTION.FORCE_SKIP 
					|| (
						matchedQuestion?.action === KNOWN_QUESTION_ACTION.SKIP 
						&& (
							(!question.required) 
							|| (question.required && isQuestionSet(question))
						)
					)
				) {
					resolvedQuestionIds.add(qId);
					return { success: true, question, reason: 'explict-skip-config', skipped: true } 
				}
				answerResolution = await resolveAnswer(question, locators, matchedQuestion, labelEmbeddingKeys);
			}

			switch (answerResolution.status) {

				// ----------- SUCCESS → FORM HANDLER -----------
				case RESOLUTION_STATUS.ANSWERED: {
					break;
				}

				// ----------- NEEDS LLM -----------
				case RESOLUTION_STATUS.NEEDS_LLM: {
					if (questionAttemptCount.get(qId) === maxAttemptsPerQuestion) {
					    exhaustedQuestionIds.add(qId);
					    questionAttemptCount.delete(qId);
						return { success: false, question, reason: 'question_exhausted_after_answer_resolution', exhausted: true };
					}
					// 🔹 Register Question for LLM Resolution (Case 1: NEEDS_LLM)
					await setLLMBucket(question, matchedQuestion ?? {}, answerResolution?.meta?.matchedLabelCandidates ?? [], {hint: answerResolution?.meta?.hint, reason: 'needs_llm'});
					anyNewLLMRegistered = true;
					return { success: false, question, reason: "needs_llm", promptHint: answerResolution.promptHint };
				}

				// ----------- SKIPPED QUESTION -----------
				case RESOLUTION_STATUS.SKIPPED: {
					resolvedQuestionIds.add(qId);
					return { success: true, question, skipped: true };
				}

				// ----------- STRUCTURAL FAILURE → QUEUE CORRECTION -----------
				case RESOLUTION_STATUS.STRUCTURAL_FAILURE: {
					corrections.push(answerResolution.correction);
					anyCorrectionThisRound = true;
					return { success: false, question, reason: "structural_failure" };
				}

				// ----------- ANSWER EXTRACTION ERROR → QUEUE CORRECTION (OPTIONAL) -----------
				case RESOLUTION_STATUS.ERROR: {
					if ('correction' in answerResolution) {
						corrections.push(answerResolution.correction);
						anyCorrectionThisRound = true;
					}
					return { success: false, question, reason: "answer_resolution_error" };
				}
			}


			// ----------- STEP 2: EXECUTE ONLY IF ANSWERED -----------
            return Promise.race([
                (async () => {

					const formManagerPayload = {}
					formManagerPayload.resolutionRequests = answerResolution?.formRequest || {}
					const remainingAttempts = Math.min((maxAttemptsPerQuestion-questionAttemptCount.get(qId)), (maxIterations-iteration));
					formManagerPayload.remainingAttempts = remainingAttempts;
					const handler = await formManager(question, answerResolution.locators, answerResolution.value, formManagerPayload);

					try {

						inFlightQuestionIds.add(qId);
						const execResult = await handler();

						if (execResult?.status === EXECUTION_STATUS.OK) {
							resolvedQuestionIds.add(qId);
							return {success: true, question};
						} 
						
						if (execResult?.status === EXECUTION_STATUS.ERROR) {
							console.warn("FAILED Execution:::", {question, answerResolution, execResult})
							/** ==============================================================
							 * Apply live correction post question
							 ============================================================== */
							if (
								('containerIdx' in (answerResolution?.meta ?? {})) 
								&& ('dbAnswerKey' in (answerResolution?.meta ?? {}))
							) { 

								const containerIdx = answerResolution.meta.containerIdx;
								const dbAnswerKeyIdx = answerResolution.meta.dbAnswerKeyIdx;

								if (answerResolution.meta.dbAnswerKey?.startsWith(DB_KEY_MAP.WORK_EXPERIENCES + '.')) {

									console.warn("LOOKUP DEL:::", {answerResolution, remainingAttempts}, 'Should Del::', (question.required && remainingAttempts <= 1) )
									
									if (question.required && remainingAttempts <= 1) {
										await applyCorrection({ type: CORRECTION_TYPE.REMOVE_WORK_CONTAINER, containerIdx, dbAnswerKeyIdx });
										anyCorrectionThisRound = true;
									}
								} else if (answerResolution.meta.dbAnswerKey?.startsWith(DB_KEY_MAP.EDUCATION + '.')) {
									if (question.required && remainingAttempts <= 1) {
										await applyCorrection({ type: CORRECTION_TYPE.REMOVE_EDU_CONTAINER, containerIdx, dbAnswerKeyIdx });
										anyCorrectionThisRound = true;
									}
								} else if (answerResolution.meta.dbAnswerKey?.startsWith('website.')) {
									if (question.required && remainingAttempts <= 1) {
										await applyCorrection({ type: CORRECTION_TYPE.REMOVE_WEBSITE_CONTAINER, containerIdx, dbAnswerKeyIdx });
										anyCorrectionThisRound = true;
									}
								}
							}
							if (questionAttemptCount.get(qId) === maxAttemptsPerQuestion) return { success: false, question, reason: 'execution_failed_and_exhausted', exhausted: true };
							// 🔹 Register Question for LLM Resolution (Case 2: EXECUTION ERROR)
							await setLLMBucket(question, matchedQuestion ?? {}, answerResolution?.meta?.matchedLabelCandidates ?? [], {options: execResult?.meta?.options, hint: answerResolution?.meta?.hint, reason: 'execution_failed'});
							anyNewLLMRegistered = true;
							return {success: false, question, reason: 'execution_failed', execMeta: execResult};
						}

						return {success: false, question, reason: 'unknown_execution_state', execMeta: execResult};

					} catch (err) {

						return {success: false, question, type: question.type, reason: 'execution_crash', error: err};

					} finally {
						inFlightQuestionIds.delete(qId);
					}

				})(), timeout(
                    (matchedQuestion?.timeout ?? FIELD_TIMEOUT_MAP[question.type] ?? 5) * 1000, 
                    {success: false, question, type: question.type, reason: 'timeout'}
                )
            ]);


        }).filter(Boolean); // remove nulls


        // 4️⃣ Wait for ALL parallel executions
        const results = await Promise.allSettled(fillPromises);

        // 5️⃣ Process results
		results.forEach(r => {
			if (r.status === 'fulfilled') {
				const res = r.value;
				const isExhausted = res.reason === 'max_attempts_exceeded';

				if (res.success) {
					// Register resolved question
                    const qId = getQuestionId(res.question);
                    resolvedQuestionIds.add(qId);
					questionAttemptCount.delete(qId);
                    anyResolvedThisRound = true;
				} else {
					// console.warn("FAILED:", res.question?.labelText, res);
				}
			} else {
				console.error("Fatal rejection:", r?.reason); // truly fatal / programming error
			}
		});

		// ----------- APPLY CORRECTIONS BEFORE NEXT ITERATION -----------
		for (const correction of corrections) {
			await applyCorrection(correction);
		}
		corrections.length = 0;

		// ------------------------------------------------------------
		// 🔹 Remove locally resolved questions from llmRequestsQueue
		// ------------------------------------------------------------
		for (const qId of llmRequestsQueue.keys()) {
			if (resolvedQuestionIds.has(qId)) {
				console.log("🧹 Removing locally resolved question from LLM request queue:", qId);
				llmRequestsQueue.delete(qId);
			}
		}

		const noLocalProgress = !anyResolvedThisRound && !anyCorrectionThisRound;
		const hasPendingLLMWork = llmRequestsQueue.size > 0;
		const shouldCallLLM = noLocalProgress && hasPendingLLMWork;

		if (shouldCallLLM) {

			throwIfAborted(); // 🔹 Abort before sending to LLM

			console.log("🚀 Local resolution exhausted. Sending to LLM...");

			// Final safety cleanup: ensure all request's questions still exist
			for (const qId of llmRequestsQueue.keys()) {
				const stillExists = currentQuestions.some(q => getQuestionId(q) === qId);
				if (!stillExists) {
					llmRequestsQueue.delete(qId);
				}
			}

			console.log("🤖 SENDING TO LLM SERVER:::", [...llmRequestsQueue.values()]);

			// SINGLE FINAL LLM CALL
			const response = await sendQuestionsToLLM([...llmRequestsQueue.values()], await getJobDetails());
			throwIfAborted();

			if (!response.success) break;
			// Array[ dict<object>(questionId: string, response: Array[]|string) ]
			if (response.success) {
				for (const ans of response.payload) {
					// ans: {questionId, response: string | Array[string]}
					llmAnswersCache.set(ans.questionId, ans.response);
				}
				// 🧹 Clear llm request queue
				llmRequestsQueue.clear();
			}
			console.log("💡 LLM ANSWER:::", response.payload);
			continue; // Continue to new iteration.

		}

        // ------------------------------------------------------------------
        // 6️⃣ Smarter loop-break condition
        // ------------------------------------------------------------------
        if (noLocalProgress && !anyNewLLMRegistered) {
            break;
        }

        // 7️⃣ Allow DOM to settle for dynamic fields
        await new Promise(r => setTimeout(r, batchDelayMs));
    }

	// await forceCommitAllListbox();
	await forceCommitFields({
		selectors: [
			'input[role="spinbutton"]',
			'input[type="number"]',
			'input[type="text"]',
			'textarea',
			'[contenteditable="true"]',
			'button[aria-haspopup="listbox"]'
		],
		filter: el => !el.disabled,
		delayMs: 40
	});

	// 8️⃣ Final unresolved questions snapshot
    const finalQuestions = await getQuestions();
	const finalUnresolved = [];
	for (const q of finalQuestions) {
		if (!isQuestionSet(q)) finalUnresolved.push(q);
	}

    return {questions: finalQuestions, unresolvedQuestions: finalUnresolved };
}