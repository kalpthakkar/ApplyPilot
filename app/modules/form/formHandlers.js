import { waitUntilSmart } from '@shared/utils/utility.js';
import { sleep, normalizeResolver, resolveResilient, rankStrings, applyThreshold, similarity, forceCommitFieldsFor, forceCommitAllListbox } from '@form/formUtils.js';
import { max } from '@xenova/transformers';

const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)

/* =========================================================
* 🖱️ Click
* ======================================================= */
/* --------------------------------------------------------------------------
 * 🖱️ click(locator, { timeout })
 * --------------------------------------------------------------------------
 *
 * Reliably performs a user-like click on a target element while accounting
 * for dynamic DOM mutations, delayed rendering, and framework-driven reflows.
 *
 * This helper is designed as a **resilient primitive** to be used across
 * modern web apps (React, Vue, Angular, portals, etc.), where elements may
 * appear, disappear, or re-render between frames.
 *
 * --------------------------------------------------------------------------
 * 🧠 HOW IT WORKS
 * --------------------------------------------------------------------------
 * 1️⃣ Normalizes the locator using `normalizeResolver`
 *    → Supports HTMLElement, selector, selector[], locator objects, etc.
 *
 * 2️⃣ Resolves the element using `resolveResilient`
 *    → Waits for DOM mutations until a connected HTMLElement is available
 *
 * 3️⃣ Performs a `.click()` on the resolved element
 *
 * 4️⃣ Observes DOM mutations after the click
 *    → If any mutation occurs within `timeout`, the click is considered
 *      successful (common in navigation, dropdowns, dialogs, state changes)
 *
 * 5️⃣ Falls back gracefully if no mutation occurs
 *
 * --------------------------------------------------------------------------
 * 🔧 FEATURES
 * --------------------------------------------------------------------------
 *  ✅ Locator-agnostic (selector | element | locator object)
 *  ✅ Mutation-aware element resolution
 *  ✅ Safe against re-renders & transient DOM states
 *  ✅ Framework-friendly (React / Vue / Angular)
 *  ✅ Non-throwing, boolean-based result
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {HTMLElement|string|object} locator
 *   → Target element or locator to click.
 *     Can be:
 *       • HTMLElement
 *       • CSS selector
 *       • selector[]
 *       • locator with `.resolve()` or `.selectors`
 *
 * @param {object} [options]
 * @param {number} [options.timeout=1500]
 *   → Maximum time (ms) to wait for DOM mutation after click.
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {Promise<boolean>}
 *   → `true`  → Click caused a DOM mutation within timeout
 *   → `false` → Element not found OR no mutation detected
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • A return value of `false` does NOT always mean the click failed —
 *   some interactions update internal state without mutating the DOM.
 * • Intended as a low-level primitive for higher-level automation flows.
 * • Complements other resilient helpers like `fillInput`, `dropdownSelect`,
 *   `checkboxSelect`, etc.
 * -------------------------------------------------------------------------- */
export async function click(locator, { timeout = 1500 } = {}) {
    const resolveEl = normalizeResolver(locator, { mode: 'single' });

    const el = await resolveResilient(resolveEl, {
        mutationTimeout: timeout,
        validate: e => e instanceof HTMLElement && e.isConnected
    });

    if (!el) {
        console.warn('❌ click(): element not found');
        return false;
    }

    return new Promise(resolve => {
        const observer = new MutationObserver(() => {
            observer.disconnect();
            resolve(true);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });

        el.click();

        setTimeout(() => {
            observer.disconnect();
            resolve(false);
        }, timeout);
    });
}


/* =========================================================
 * 🖱️ clickAll
 * ======================================================= */
/**
 * Repeatedly clicks a locator until it no longer exists
 * or until a max iteration count is reached.
 *
 * Designed for destructive / repeating UI actions:
 * - delete all
 * - remove all
 * - close all
 * - dismiss all
 *
 * @param {HTMLElement|string|object} locator
 *   → Same locator types supported by click()
 *
 * @param {object} options
 * @param {number} [options.timeout=1500]
 *   → Passed through to click()
 *
 * @param {number} [options.delayMs=50]
 *   → Delay between iterations to allow SPA re-render / animations
 *
 * @param {number} [options.max=20]
 *   → Hard safety cap to prevent infinite loops
 *
 * @param {boolean} [options.verifyProgress=true]
 *   → Warn if DOM count never decreases
 *
 * @returns {Promise<{clicked: number, completed: boolean}>}
 */
export async function clickAll(locator, {timeout = 1500, delayMs = 50, max = 20, verifyProgress = true} = {}) {
	let clicked = 0;
	let lastCount = null;

	for (let i = 0; i < max; i++) {
		// Optional progress verification
		if (verifyProgress) {
			const currentCount =
				typeof locator === 'string' ?
				document.querySelectorAll(locator).length :
				null;

			if (currentCount === 0) break;

			if (lastCount !== null && currentCount >= lastCount) {
				console.warn('⚠️ clickAll(): no progress detected, stopping');
				break;
			}

			lastCount = currentCount;
		}

		const didClick = await click(locator, {timeout});
		if (!didClick) break;

		clicked++;
		await new Promise(r => setTimeout(r, delayMs));
	}

	return {clicked, completed: clicked > 0};
}


/* =========================================================
* ✍🏻 fillInput - Robust Input Filler for Automation
* ======================================================= */
/* 
 * Fills native, masked, contenteditable, and rich-text inputs.
 * Designed for real-world automation scenarios in modern SPAs.
 * ---------------------------------------------------------
 * @param {HTMLElement|string} locator - Element or selector
 * @param {string|number|Date} value - Value to fill
 * @param {Object} options
 *   @param {number} [delayMs=50] - Delay between typing/mask steps
 *   @param {number} [timeout=1500] - Timeout for element resolution
 *   @param {boolean} [dispatchKeys=true] - Send Enter key after fill
 * @returns {Promise<{success: boolean}>}
 * --------------------------------------------------------- */
export async function fillInput(
    locator,
    value,
    { delayMs = 50, timeout = 1500, dispatchKeys = true, dispatchFocus = true } = {}
) {

    // -------------------- 0️⃣ Validate input --------------------
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
        console.warn('❌ fillInput(): value must be string, number, or Date');
        return { success: false };
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stringValue = value instanceof Date ? value.toISOString() : String(value);

    // -------------------- 1️⃣ Resolve root element --------------------
    const root = await resolveResilient(normalizeResolver(locator), { mutationTimeout: timeout });
    if (!root) return { success: false };

    const target =
        root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement
            ? root
            : root.querySelector('input,textarea,[contenteditable="true"]');

    if (!target) return { success: false };

    target.focus({ preventScroll: true });

    // -------------------- 2️⃣ Detect rich-text editors --------------------
    const editorAdapters = [
        { name: 'Quill', test: el => el.__quill, setValue: (el, val) => el.__quill.setText(val) },
        { name: 'TinyMCE', test: el => window.tinymce?.get(el.id), setValue: (el, val) => window.tinymce.get(el.id)?.setContent(val) },
        { name: 'CKEditor', test: el => window.CKEDITOR?.instances[el.id], setValue: (el, val) => window.CKEDITOR.instances[el.id]?.setData(val) }
    ];
    const adapter = editorAdapters.find(a => a.test(target));

    // Native value setter (critical for React-controlled inputs)
    const nativeSetter = Object.getOwnPropertyDescriptor(target.__proto__, 'value')?.set;

    // -------------------- 3️⃣ Identify controlled numeric text fields --------------------
    const isNumericTextField =
        target.tagName === 'INPUT' &&
        target.type === 'text' &&
        (
            target.getAttribute('role') === 'spinbutton' ||
            target.inputMode === 'numeric' ||
            /numeric|decimal/i.test(target.getAttribute('aria-label') || '') ||
            /\d/.test(target.placeholder || '')
        );

    // -------------------- 4️⃣ Clear field (skip for numeric controlled fields) --------------------
    if (!isNumericTextField) {
        if (target.isContentEditable) {
            target.textContent = '';
        } else {
            nativeSetter ? nativeSetter.call(target, '') : (target.value = '');
        }
        ['input', 'change'].forEach(evt =>
            target.dispatchEvent(new Event(evt, { bubbles: true }))
        );
        await sleep(delayMs);
    }

    // -------------------- 5️⃣ Mask detection --------------------
    const maskPattern = target.inputmask?.opts?.mask || target.dataset.mask || null;

    // -------------------- 6️⃣ Real keyboard typing (React-trusted) --------------------
    function dispatchChar(el, char) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

        nativeSetter ? nativeSetter.call(el, el.value + char) : (el.value += char);

        el.dispatchEvent(new InputEvent('input', {
            data: char,
            inputType: 'insertText',
            bubbles: true
        }));

        el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    }

    async function typeRealistically(el, val) {
        nativeSetter ? nativeSetter.call(el, '') : (el.value = '');
        for (const ch of val) {
            dispatchChar(el, ch);
            await sleep(delayMs);
        }
    }

    async function typeWithMask(el, val, mask, isContentEditable = false) {
        if (!mask) {
            if (isNumericTextField) {
                await typeRealistically(el, val);
            } else if (isContentEditable) {
                el.textContent = val;
            } else {
                nativeSetter ? nativeSetter.call(el, val) : (el.value = val);
            }

            ['input', 'change'].forEach(evt =>
                el.dispatchEvent(new Event(evt, { bubbles: true }))
            );
            return;
        }

        // Masked typing
        let output = '';
        let valIndex = 0;

        for (let i = 0; i < mask.length; i++) {
            const m = mask[i];

            if (/[^9a\*]/.test(m)) output += m;
            else if (valIndex < val.length) output += val[valIndex++];
            else break;

            if (isContentEditable) el.textContent = output;
            else nativeSetter ? nativeSetter.call(el, output) : (el.value = output);

            ['input', 'change'].forEach(evt =>
                el.dispatchEvent(new Event(evt, { bubbles: true }))
            );

            await sleep(delayMs);
        }
    }

    // -------------------- 7️⃣ Fill field --------------------
    if (adapter) {
        adapter.setValue(target, stringValue);
    } else if (target.isContentEditable) {
        await typeWithMask(target, stringValue, maskPattern, true);
    } else {
        await typeWithMask(target, stringValue, maskPattern, false);
    }

    // -------------------- 8️⃣ Let React settle, then re-assert --------------------
    await sleep(300);

    if (!target.isContentEditable && target.value !== stringValue) {
        nativeSetter ? nativeSetter.call(target, stringValue) : (target.value = stringValue);
        target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // -------------------- 9️⃣ Optional keyboard submit --------------------
    if (dispatchKeys) {
        ['keydown', 'keyup'].forEach(evt =>
            target.dispatchEvent(new KeyboardEvent(evt, { key: 'Enter', bubbles: true }))
        );
    }

    // -------------------- 🔟 Delayed blur (critical for Workday) --------------------
    if (dispatchFocus) {
        await sleep(500);
        target.blur();
    }

    // -------------------- 1️⃣1️⃣ Verify --------------------
    let currentValue;
    if (target.isContentEditable) currentValue = target.textContent;
    else if (target.type === 'number') currentValue = target.valueAsNumber;
    else currentValue = target.value;

    let success;
    if (target.getAttribute('role') === 'spinbutton' || target.type === 'number' || isNumericTextField) {
        const expected = Number(stringValue);
        const actual = Number(currentValue);
        success = !Number.isNaN(expected) && actual === expected;
    } else {
        success =
            String(currentValue).replace(/\s+/g, '') ===
            stringValue.replace(/\s+/g, '');
    }

    if (success) {
        console.log(`✅ Filled ${adapter ? adapter.name + ' editor' : target.type} with "${stringValue}"`);
    } else {
        console.warn('⚠️ fillInput(): value overwritten by framework', {
            expected: stringValue,
            actual: currentValue
        });
    }

    return { success };
}

/**
 * 📝 Function: sendKeysToInputs
 * 
 * Dynamically fills text inputs on a page with provided values.
 * Works with selectors pointing either to the input itself or a container
 * containing an input[type="text"] element.
 * Can fill multiple inputs **in parallel**.
 * 
 * @param {Array<{ selector: string, value: string }>} inputs
 *        Array of objects with:
 *          - selector: CSS selector for the input or container
 *          - value: Text to fill into the input
 * 
 * @param {number} [delayMs=50] - Optional small delay between firing events for each input (ms)
 * 
 * @returns {Promise<void>} - Resolves once all inputs have been filled
 * 
 * @example
 * await sendKeysToInputs([
 *   { selector: "#firstName", value: "John" },
 *   { selector: ".container-lastname", value: "Doe" },
 * ]);
 * 
 * // Inputs are filled in parallel and DOM events are triggered correctly.
 */
export async function sendKeysToInputs(inputs, delayMs = 50) {
    if (!Array.isArray(inputs)) {
        console.warn('❌ inputs must be an array of {selector, value} objects');
        return;
    }

    // Map all input tasks to promises (parallel execution)
    const tasks = inputs.map(({ selector, value }) => fillInput(selector, value, delayMs));

    // Execute all in parallel
    await Promise.all(tasks);
}


/* =========================================================
* 🔘 Radio
* ======================================================= */
/* --------------------------------------------------------------------------
 * 🔘 RADIOSELECT: radioSelect(radioLocator, answers, threshold, useAverage)
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Intelligently selects the most appropriate radio button option by
 *   performing fuzzy string matching between radio labels and a list of
 *   candidate answers. Designed for dynamic, framework-driven forms where
 *   radio inputs and labels may be rendered asynchronously.
 *
 *   Uses mutation-aware resolution to safely detect radios, ranks options
 *   by semantic similarity, and selects the best-matching radio input.
 *
 * --------------------------------------------------------------------------
 * 🧭 EXECUTION FLOW
 * --------------------------------------------------------------------------
 *   1️⃣ Validate     → Ensure candidate answers are provided
 *   2️⃣ Resolve      → Mutation-aware discovery of radio inputs
 *   3️⃣ Label Map    → Extract human-readable label text for each radio
 *   4️⃣ Similarity   → Compute similarity scores per answer × option
 *   5️⃣ Rank         → Aggregate & sort scores (average or max strategy)
 *   6️⃣ Select       → Pick best option using optional threshold gating
 *   7️⃣ Click        → Mutation-safe click on selected radio
 *
 * --------------------------------------------------------------------------
 * 🔧 FEATURES
 * --------------------------------------------------------------------------
 *   ✅ Dynamic radio resolution (SPA-safe)
 *   ✅ Label-aware radio identification
 *   ✅ Fuzzy matching using similarity scoring
 *   ✅ Multiple answer candidates supported
 *   ✅ Strategy toggle: average vs best-match
 *   ✅ Optional confidence threshold gating
 *   ✅ Mutation-aware, safe interaction
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {HTMLElement|string|Array} radioLocator
 *   → Locator for radio inputs or their container(s).
 *     Can be a selector, HTMLElement, or mixed locator array.
 *
 * @param {string[]} answers
 *   → List of candidate answer strings used for fuzzy matching.
 *
 * @param {number|null} [threshold=null]
 *   → Minimum similarity score (%) required to accept a match.
 *     If null, the highest-scoring option is selected regardless.
 *
 * @param {boolean} [useAverage=false]
 *   → Scoring strategy:
 *       • false → Independent best-match (aggressive)
 *       • true  → Average score across all answers (semantic stability)
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {Promise<{
 *   success: boolean,
 *   best: { text: string, score: number } | null,
 *   ranked: Array<{ text: string, score: number }>
 * }>}
 *   → `success` → Whether a radio was successfully selected
 *   → `best`    → Selected option & score (or null)
 *   → `ranked`  → All options ranked by similarity
 *
 * --------------------------------------------------------------------------
 * 🧪 EXAMPLE
 * --------------------------------------------------------------------------
 * await radioSelect(
 *   '[name="employmentType"]',
 *   ['Full Time', 'Permanent'],
 *   70,
 *   true
 * );
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Works with custom-styled radios & ARIA-driven UIs
 * • Requires labels to be present or associated via `for` attribute
 * • Designed for enterprise forms (ATS, HR, onboarding workflows)
 * • Non-destructive: only clicks the selected radio
 * -------------------------------------------------------------------------- */
export async function radioSelect(radioLocator, answers, {threshold = null, useAverage = false, selectAtLeastOne = false, mode = 'select'} = {}) {
    // 1️⃣ Validate answers
    if (mode === 'select' && (!Array.isArray(answers) || !answers.length)) {
        console.warn('❌ radio(): Answers must be a non-empty array.');
        return {success: false, best: null, ranked: [], options: []};
    }

    // 2️⃣ Resolve radio options dynamically
    async function resolveRadioOptions(radioLocator) { // Resolves radio elements dynamically, returns array of { radio, labelText }
        const radioResolver = normalizeResolver(radioLocator, { mode: 'multi' });

        const radios = await resolveResilient(() => {
            const els = radioResolver();
            if (!els) return null;

            // Always return only input[type=radio]
            const filtered = els.filter(e => e instanceof HTMLElement && e.type === 'radio');
            return filtered.length ? filtered : null;
        });

        if (!radios || !radios.length) return null;

        // Map to { radio, labelText }
        const options = radios.map(radio => {
            const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
            return { radio, labelText: label?.textContent.trim() || '' };
        }).filter(o => o.labelText);

        return options;
    }
    const options = await resolveRadioOptions(radioLocator);
    if (!options) {
        console.warn('❌ radio(): No labeled radio options found.');
        return {success: false, best: null, ranked: [], options: []};
    }

    const optionTexts = options.map(o => o.labelText);

    if (mode === 'inspect') {
        return {
            success: true,
            options: optionTexts
        };
    }

    // 3️⃣ Compute similarity scores
    const scoresPerOption = options.map(o => ({ text: o.labelText, scores: [] }));
    for (const answer of answers) {
        for (const o of scoresPerOption) {
            o.scores.push(similarity(answer, o.text));
        }
    }

    // 4️⃣ Compute final score per option
    const finalScores = scoresPerOption.map(o => ({
        text: o.text,
        score: useAverage
            ? o.scores.reduce((sum, s) => sum + s, 0) / o.scores.length
            : Math.max(...o.scores)
    }));

    // 5️⃣ Sort descending by score
    finalScores.sort((a, b) => b.score - a.score);

    // 6️⃣ Pick best option
    function pickBestOption(finalScores, threshold, selectAtLeastOne) { // Picks the best option based on threshold
        if (!finalScores.length) return null;

        // Hard threshold (default)
        if (threshold !== null) {
            const match = finalScores.find(o => o.score >= threshold);
            if (match) return match;
            if (!selectAtLeastOne) return null;
        }

        // Soft fallback: best ranked
        return finalScores[0];
    }

    const best = pickBestOption(finalScores, threshold, selectAtLeastOne);
        
    if (!best) {
        if (threshold !== null) {
            console.warn(`⚠️ radio(): No option matched threshold (${threshold}%).`);
        } else {
            console.warn(`⚠️ radio(): No selectable radio option found.`);
        }
        return { success: false, best: null, ranked: finalScores, options: optionTexts };
    }

    // 7️⃣ Click the best radio (mutation-aware)
    const bestOption = options.find(o => o.labelText.toLowerCase() === best.text.toLowerCase());
    if (bestOption?.radio) {
        await resolveResilient(() => bestOption.radio, { validate: el => el && el.isConnected }).then(el => el?.click());
        console.log(`✅ Selected radio: "${best.text}" (${best.score.toFixed(2)}%)`);
    }

    return {success: true, best: best, ranked: finalScores, options: optionTexts};
}


/* =========================================================
* ✅ Checkbox
* ======================================================= */
/* --------------------------------------------------------------------------
 * ☑️ CHECKBOXSELECT: checkboxSelect(checkboxLocator, values, options)
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Intelligently selects one or more checkboxes by combining mutation-aware
 *   DOM resolution with fuzzy semantic matching against checkbox labels.
 *   Designed for modern, dynamic forms where checkbox groups may be rendered
 *   asynchronously and labels may not map cleanly to inputs.
 *
 *   Supports both:
 *     • BOOLEAN MODE  → Force all checkboxes ON / OFF
 *     • SEMANTIC MODE → Select best-matching checkboxes using similarity scores
 *
 * --------------------------------------------------------------------------
 * 🧭 EXECUTION FLOW
 * --------------------------------------------------------------------------
 *   1️⃣ Resolve      → Mutation-aware discovery of checkbox inputs
 *   2️⃣ Normalize    → Unified checked / toggle behavior (native + ARIA)
 *   3️⃣ Label Map    → Extract human-readable label text
 *   4️⃣ Score        → Compute similarity scores (average or max strategy)
 *   5️⃣ Rank         → Sort checkboxes by relevance
 *   6️⃣ Constrain    → Apply min / max / exact selection rules
 *   7️⃣ Apply        → Enforce authoritative checked state
 *
 * --------------------------------------------------------------------------
 * 🔧 FEATURES
 * --------------------------------------------------------------------------
 *   ✅ Dynamic checkbox resolution (SPA-safe)
 *   ✅ Supports native & ARIA-role checkboxes
 *   ✅ Fuzzy string matching on labels
 *   ✅ Boolean bulk-select mode
 *   ✅ Selection constraints: min / max / exact
 *   ✅ Deterministic final state enforcement
 *   ✅ Detailed explanation of selection decisions
 * 
 * 
 * --------------------------------------------------------------------------
 * 🕋 All return paths are coherent
 * --------------------------------------------------------------------------
 * | Path              | success | options    | ranked   |
 * | ----------------- | ------- | ---------- | -------- |
 * | No checkboxes     | ❌      | `[]`       | `[]`     |
 * | No labels         | ❌      | `[]`       | `[]`     |
 * | Boolean mode      | ✅      | `string[]` | `[]`     |
 * | Invalid values    | ❌      | `string[]` | `[]`     |
 * | Threshold failure | ❌      | `string[]` | `ranked` |
 * | Success           | ✅      | `string[]` | `ranked` |
 * 
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {HTMLElement|string|Array} checkboxLocator
 *   → Locator for checkbox inputs or their container(s).
 *     Can be selector(s), HTMLElement(s), or a mixed locator array.
 *
 * @param {string[]|boolean} values
 *   → Selection intent:
 *       • boolean   → true = check all, false = uncheck all
 *       • string[]  → Candidate semantic values for fuzzy matching
 *
 * @param {Object} [options]
 * @param {number}  [options.threshold=90]
 *   → Minimum similarity score (%) required to select a checkbox.
 *
 * @param {boolean} [options.useAverage=false]
 *   → Scoring strategy:
 *       • false → Independent best-match (aggressive)
 *       • true  → Average score across all values (semantic stability)
 *
 * @param {number|null} [options.minSelections=null]
 *   → Minimum number of checkboxes that must be selected.
 *
 * @param {number|null} [options.maxSelections=null]
 *   → Maximum number of checkboxes allowed to be selected.
 *
 * @param {number|null} [options.exactSelections=null]
 *   → Enforces an exact number of selections (overrides min/max).
 *
 * @param {number} [options.timeout=1500]
 *   → Mutation timeout for resolving checkbox elements.
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {Promise<{
 *   success: boolean,
 *   best: Array<{ text: string, score: number }> | boolean | null,
 *   ranked: Array<{ text: string, score: number }>,
 *   explanation: string[]
 * }>}
 *   → `success`     → Whether a valid selection was applied
 *   → `best`        → Selected checkbox(es) or boolean (boolean mode)
 *   → `ranked`      → All checkboxes ranked by similarity
 *   → `explanation` → Human-readable reasoning for selections
 *
 * --------------------------------------------------------------------------
 * 🧪 EXAMPLE
 * --------------------------------------------------------------------------
 * await checkboxSelect(
 *   '[name="skills"]',
 *   ['JavaScript', 'Frontend', 'UI'],
 *   { minSelections: 2, threshold: 75 }
 * );
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Safe for React / Vue / Workday-style dynamic forms
 * • Works with visually hidden inputs & custom checkbox components
 * • Does not assume initial checkbox state
 * • Enforces final state authoritatively to avoid drift
 * -------------------------------------------------------------------------- */
export async function checkboxSelect(checkboxLocator, values, {threshold = 90, useAverage = false, minSelections = null, maxSelections = null, exactSelections = null, mode = 'select', timeout = 1500} = {}) {

    /* =========================================================
     * Resolve checkbox group
     * ======================================================= */
    const resolver = normalizeResolver(checkboxLocator, { mode: 'multi' });

    const checkboxes = await resolveResilient(
        () => {
            const els = resolver();
            if (!els) return null;

            const filtered = els.filter(el =>
                (el instanceof HTMLInputElement && el.type === 'checkbox') ||
                (el.getAttribute?.('role') === 'checkbox' && el.tabIndex >= 0)
            );
            return filtered.length ? filtered : null;
        },
        {
            validate: els =>
                Array.isArray(els) &&
                els.length > 0 &&
                els.every(el => el?.isConnected),
            mutationTimeout: timeout
        }
    );

    if (!checkboxes) {
        console.warn('❌ checkboxSelect(): no checkboxes found');
        return { success: false, best: null, ranked: [], options: [], explanation: [] };
    }

    /* =========================================================
     * Checkbox API normalization
     * ======================================================= */
    const isChecked = el =>
        el instanceof HTMLInputElement
            ? el.checked
            : el.getAttribute('aria-checked') === 'true';

    const toggle = async (el, value) => {
        if (isChecked(el) === value) return;

        await resolveResilient(
            () => el,
            { validate: e => e?.isConnected }
        );

        el.click();

        // In React-heavy UIs, we may want
        // await sleep(0.1);
    };

    /* =========================================================
     * Extract labels
     * ======================================================= */
    const options = checkboxes
        .map(cb => {
            const label =
                document.querySelector(`label[for="${cb.id}"]`) ||
                cb.closest('label') ||
                cb.closest('[role="checkbox"]') ||
                cb.parentElement;

            const text = label?.textContent?.replace(/\s+/g, ' ').trim() || '';
            return { checkbox: cb, text };
        })
        .filter(o => o.text);

    if (!options.length) {
        console.warn('❌ checkboxSelect(): no labeled checkboxes found');
        return { success: false, best: null, ranked: [], options: [], explanation: [] };
    }

    const optionTexts = options.map(o => o.text);

    if (mode === 'inspect') {
        return {
            success: true,
            options: optionTexts
        };
    }

    /* =========================================================
     * BOOLEAN MODE
     * ======================================================= */
    if (typeof values === 'boolean') {
        for (const o of options) {
            await toggle(o.checkbox, values);
        }

        return {
            success: true,
            best: values,
            ranked: [],
            options: optionTexts, 
            explanation: [`All checkboxes set to ${values}`]
        };
    }

    /* =========================================================
     * Validate semantic values
     * ======================================================= */
    if (!Array.isArray(values) || !values.length) {
        console.warn('❌ checkboxSelect(): invalid values');
        return { success: false, best: null, ranked: [], options: optionTexts, explanation: [] };
    }

    /* =========================================================
     * Similarity scoring
     * ======================================================= */
    const scoresPerOption = options.map(o => ({
        checkbox: o.checkbox,
        text: o.text,
        scores: values.map(v => similarity(v, o.text))
    }));

    const ranked = scoresPerOption
        .map(o => ({
            checkbox: o.checkbox,
            text: o.text,
            score: useAverage
                ? o.scores.reduce((a, b) => a + b, 0) / o.scores.length
                : Math.max(...o.scores)
        }))
        .sort((a, b) => b.score - a.score);

    let selected = ranked.filter(r => r.score >= threshold);

    console.log("Checkbox Options to be selected:::", selected);

    let explanation = selected.map(
        r => `"${r.text}" (${r.score.toFixed(1)}%)`
    );

    /* =========================================================
     * Selection constraints
     * ======================================================= */
    if (typeof exactSelections === 'number') {
        selected = ranked.slice(0, exactSelections);
        explanation.push(`Exact selections enforced: ${exactSelections}`);
    }

    if (typeof minSelections === 'number') {
        for (const r of ranked) {
            if (selected.length >= minSelections) break;
            if (!selected.some(s => s.checkbox === r.checkbox)) {
                selected.push(r);
                explanation.push(`Added "${r.text}" (minSelections)`);
            }
        }
    }

    if (typeof maxSelections === 'number') {
        selected = selected.slice(0, maxSelections);
        explanation.push(`Trimmed to maxSelections = ${maxSelections}`);
    }

    if (!selected.length) {
        console.warn('⚠️ checkboxSelect(): no selection satisfied constraints');
        return { success: false, best: null, ranked, options: optionTexts, explanation };
    }

    /* =========================================================
     * Apply authoritative state
     * ======================================================= */
    for (const o of options) {
        const shouldCheck = selected.some(s => s.checkbox === o.checkbox);
        await toggle(o.checkbox, shouldCheck);
        // await sleep(10);
    }

    console.log(
        `✅ Checkbox selected (${selected.length}): ${selected
            .map(s => `"${s.text}"`)
            .join(', ')}`
    );

    return {
        success: true,
        best: selected.map(s => ({ text: s.text, score: s.score })),
        ranked,
        options: optionTexts,
        explanation
    };
}


/* =========================================================
* 👇 Dropdown
* ======================================================= */
/* --------------------------------------------------------------------------
 * 🎛️ DROPDOWNSELECT: dropdownSelect(dropdownLocator, answers, threshold, useAverage)
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Robustly selects an option from a custom or ARIA-compliant dropdown
 *   (combobox / listbox) using semantic fuzzy matching against visible
 *   option text. Designed for modern, dynamic UIs where dropdown options
 *   may be rendered asynchronously or via portals.
 *
 *   The function is mutation-aware, avoids unnecessary interaction when
 *   a suitable value is already selected, and verifies that the final
 *   selection was actually accepted by the framework.
 *
 * --------------------------------------------------------------------------
 * 🧭 EXECUTION FLOW
 * --------------------------------------------------------------------------
 *   1️⃣ Resolve dropdown trigger (button / combobox)
 *   2️⃣ Early-exit if desired value already selected
 *   3️⃣ Open dropdown (user-like interaction)
 *   4️⃣ Resolve options list (ARIA + portal-safe)
 *   5️⃣ Compute similarity matrix (answers × options)
 *   6️⃣ Rank options using selected strategy
 *   7️⃣ Apply threshold gating
 *   8️⃣ Click best-matching option
 *   9️⃣ Verify selection was persisted
 *
 * --------------------------------------------------------------------------
 * 🔧 FEATURES
 * --------------------------------------------------------------------------
 *   ✅ MutationObserver-powered resolution (SPA-safe)
 *   ✅ Supports ARIA combobox / listbox patterns
 *   ✅ Early-exit optimization if value already selected
 *   ✅ Fuzzy string matching (Levenshtein similarity)
 *   ✅ Two strategies:
 *       • Independent best match (aggressive)
 *       • Averaged semantic match (default, stable)
 *   ✅ Threshold-based confidence control
 *   ✅ Post-click verification to ensure framework acceptance
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {HTMLElement|string|Array} dropdownLocator
 *   → Locator for the dropdown trigger or container.
 *     Can be a button, combobox, selector, or mixed locator array.
 *
 * @param {string[]} answers
 *   → Array of candidate answer strings to match against dropdown options.
 *     Example: ['United States', 'USA', 'America']
 *
 * @param {number|null} [threshold=100]
 *   → Minimum similarity score (%) required to accept a match.
 *     If null, the highest-ranked option is selected regardless of score.
 *
 * @param {boolean} [useAverage=true]
 *   → Matching strategy selector:
 *       • true  → Average score across all answers (semantic stability)
 *       • false → Single best score (aggressive matching)
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {Promise<{
 *   success: boolean,
 *   best: { text: string, score: number } | null,
 *   ranked: Array<{ text: string, score: number }>
 * }>}
 *   → `success` → Whether a valid option was selected
 *   → `best`    → Selected option and similarity score (or null)
 *   → `ranked`  → All options ranked by relevance
 *
 * --------------------------------------------------------------------------
 * 🧪 EXAMPLE
 * --------------------------------------------------------------------------
 * await dropdownSelect(
 *   countryDropdown,
 *   ['United States', 'USA'],
 *   80,
 *   true
 * );
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Safe for React / Workday / portal-based dropdowns
 * • Does not assume static DOM structure
 * • Avoids duplicate selection when value already matches
 * • Designed for resilient form automation pipelines
 * -------------------------------------------------------------------------- */
export async function dropdownSelect(dropdownLocator, answers, { threshold = 100, useAverage = false, blacklist = ["Select One"], selectAtLeastOne = false, mode = 'select' } = {}) {


    /* =========================================================
    * Dropdown Helpers
    * ======================================================= */

    async function resolveDropdownButton(locator) {
        const resolver = normalizeResolver(locator);

        return resolveResilient(
            () => {
                const el = resolver();
                if (!el) return null;
                return el.tagName === 'BUTTON' || el.getAttribute('role') === 'combobox' ? el : el.querySelector('button, [role="combobox"]');
            }
        );
    }

    async function resolveDropdownList(buttonResolver) {
        return resolveResilient(
            () => {
                const button = buttonResolver();
                if (!button) return null;

                // IMPORTANT: read attribute fresh each time
                const listId = button.getAttribute('aria-controls');
                if (listId) return document.getElementById(listId);

                // Fallbacks for portal-based dropdowns
                if (button.getAttribute('aria-expanded') === 'true') {
                    return (
                        document.querySelector('[role="listbox"]') ||
                        document.querySelector('ul')
                    );
                }

                return null;
            },
            {
                validate: el => el && el.isConnected,
                mutationTimeout: 2000
            }
        );
    }

    async function resolveDropdownOptions(listResolver) {
        return resolveResilient(
            () => {
                const list = listResolver();
                if (!list) return null;
                const items = [...list.querySelectorAll('li,[role="option"]')];
                return items.length ? items : null;
            },
            {
                validate: els => Array.isArray(els) && (!((els.length == 1) && (els[0].getAttribute('aria-disabled') == 'true'))) && els.length > 0,
                mutationTimeout: 2000
            }
        );
    }

    /* ---------- Resolve button ---------- */
    const button = await resolveDropdownButton(dropdownLocator);
    if (!button) {
        console.warn('❌ dropdownSelect(): button not found');
        return { success: false, best: null, ranked: [], options: [] };
    }

    /* ---------- Early exit ---------- */
    function isAlreadySelected(button, answers, threshold = 95) {

        // Prevents invalid option to be flaged as match by setting lower bound (e.g. when `threshold=10` avoid false positive) 
        threshold = Math.max(threshold, 95);

        function extractCurrentDropdownValue(button, depthLimit = 3) {
            const texts = new Set();

            function collect(el, depth = 0) {
                if (!el || depth > depthLimit) return;

                // Visible text
                const text = el.innerText?.trim();
                if (text) texts.add(text);

                // Common ARIA & accessibility attributes
                ['aria-label', 'aria-valuetext', 'title', 'value'].forEach(attr => {
                    const val = el.getAttribute?.(attr);
                    if (val) texts.add(val.trim());
                });

                // Role-based hint
                if (el.getAttribute?.('role') === 'combobox') {
                    const active = el.getAttribute('aria-activedescendant');
                    if (active) {
                        const activeEl = document.getElementById(active);
                        if (activeEl?.innerText) texts.add(activeEl.innerText.trim());
                    }
                }

                collect(el.parentElement, depth + 1);
            }

            collect(button);
            return [...texts];
        }

        const existingTexts = extractCurrentDropdownValue(button);

        if (!existingTexts.length) return null;

        let best = null;
        for (const text of existingTexts) {
            const ranked = rankStrings(text, answers);
            const match = applyThreshold(ranked, threshold);
            if (match && (!best || match.score > best.score)) {
                best = match;
            }
        }

        return best; // { text, score } or null
    }

    const alreadySelected = isAlreadySelected(button, answers, threshold);
    if (alreadySelected) {
        return { success: true, best: alreadySelected, ranked: [], options: null };
    }

    /* ---------- Open dropdown ---------- */
    button.click();
    /** Enable if rendering is slow. */
    // await sleep(1);

    /* ---------- Resolve list ---------- */
    const buttonResolver = () =>
        document.body.contains(button)
        ? button
        : normalizeResolver(dropdownLocator)();

    const list = await resolveDropdownList(buttonResolver);
    if (!list) {
        console.warn('❌ dropdownSelect(): options list not found');
        return { success: false, best: null, ranked: [], options: [] };
    }

    /* ---------- Resolve options (defensive) ---------- */
    const options = await resolveDropdownOptions(() => list);
    if (!options) {
        console.warn('❌ dropdownSelect(): no options found');
        return { success: false, best: null, ranked: [], options: [] };
    }

    let optionTexts = options.map(o => o.textContent.trim()).filter(s => !blacklist.includes(s));

    if (mode === 'inspect') {
        button.dispatchEvent(new FocusEvent("focusout", {
            bubbles: true,
            composed: true,
            relatedTarget: document.body
        }));
        return {
            success: true,
            options: optionTexts
        };
    }

    if (!optionTexts.length) {
        return { success: false, best: null, ranked: [], options: [] };
    }

    const matrix = answers.flatMap(answer =>
		optionTexts.map(option => ({
			answer,
			text: option,
			score: similarity(answer, option)
		}))
	);

    /* ---------- Match logic ---------- */
    let ranked = [];
    let best = null;

    /* =========================================================
	 * STRATEGY A: Independent best match
	 * ======================================================= */
    if (!useAverage) {
        ranked = [...matrix].sort((a, b) => b.score - a.score);
        best = ranked[0];
        if (!best) {
            return { success: false, best: null, ranked, options: optionTexts };
        }
        if (threshold != null && best.score < threshold && !selectAtLeastOne) {
            console.warn(`⚠️ No option met threshold (${threshold}%)`);
            return { success: false, best: null, ranked, options: optionTexts };
        }
    }

	/* =========================================================
	 * STRATEGY B: Averaged match (default)
	 * ======================================================= */
	else {
		const averagedRanks = optionTexts.map(text => {
			const scores = matrix.filter(m => m.text === text).map(m => m.score);
			const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
			return { text, score: avg };
		}).sort((a, b) => b.score - a.score);
        ranked = averagedRanks;
		best = averagedRanks[0];
        if (!best) {
            return { success: false, best: null, ranked, options: optionTexts };
        }
        if (threshold != null && best.score < threshold && !selectAtLeastOne) {
            console.warn(`⚠️ No option met threshold (${threshold}%)`);
            return { success: false, best: null, ranked, options: optionTexts };
        }
	}

    /* ---------- Re-resolve & click ---------- */
    async function clickDropdownOption(listResolver, expectedText) {
        return resolveResilient(
            () => {
                const list = listResolver();
                if (!list || !list.isConnected) return null;

                const options = [...list.querySelectorAll('li,[role="option"]')];

                const match = options.find(li =>
                    li.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === expectedText.toLowerCase()
                );

                if (!match || !match.isConnected) return null;

                // SPA-safe click immediately
                match.click();

                return match; // return for logging/verification
            },
            {
                validate: el => el && el.isConnected
            }
        );
    }

    const target = await clickDropdownOption(() => list, best.text);

    // ----- VERIFY (OPTIONAL) -----
    // const success = target && (
    //     target.getAttribute('aria-selected') === 'true' ||
    //     target.classList.contains('selected')
    // );
    // console.log('Dropdown selected?', success);

    await resolveResilient(
        () => isAlreadySelected(button, [best.text], 100) ? true : null,
        { retries: 1, mutationTimeout: 800 }
    );

    if(!isAlreadySelected(button, [best.text], 100)) {
        console.log("❌ DROPDOWN TARGET NOT SELECTED", best.text);
        return { success: false, best, ranked, options: optionTexts };
    }

    console.log(`✅ Dropdown selected: "${best.text}" (${best.score.toFixed(2)}%)`);
    return { success: true, best, ranked, options: optionTexts };
}


/* =========================================================
* 👇 Select
* ======================================================= */
export async function selectField(selectLocator, answers, {threshold = 100, useAverage = false, blacklist = ["Select...", "Please select", "Select One", "--"], selectAtLeastOne = false, mode = 'select', mutationTimeout = 150} = {}) {

    /* =========================================================
     * Resolve <select> element
     * ======================================================= */
    const resolver = normalizeResolver(selectLocator);

    const selectEl = await resolveResilient(
        () => {
            const el = resolver();
            if (!el) return null;

            if (el instanceof HTMLSelectElement) return el;

            // Defensive: nested select
            return el.querySelector?.('select') || null;
        },
        {
            validate: el => el instanceof HTMLSelectElement && el.isConnected,
            mutationTimeout
        }
    );

    if (!selectEl) {
        console.warn('❌ selectField(): <select> not found');
        return { success: false, best: null, ranked: [], options: [] };
    }

    /* =========================================================
     * Extract options
     * ======================================================= */
    const extractOptions = () => {
        return [...selectEl.options]
            .map(opt => ({
                option: opt,
                text: opt.textContent.replace(/\s+/g, ' ').trim(),
                value: opt.value
            }))
            .filter(o => o.text && !blacklist.includes(o.text));
    };

    const options = extractOptions();

    if (!options.length) {
        console.warn('❌ selectField(): no selectable options found');
        return { success: false, best: null, ranked: [], options: [] };
    }

    const optionTexts = options.map(o => o.text);

    /* =========================================================
     * INSPECT MODE
     * ======================================================= */
    if (mode === 'inspect') {
        return {
            success: true,
            options: optionTexts
        };
    }

    /* =========================================================
     * Validate answers
     * ======================================================= */
    if (!Array.isArray(answers) || !answers.length) {
        console.warn('❌ selectField(): answers must be a non-empty array');
        return { success: false, best: null, ranked: [], options: optionTexts };
    }

    /* =========================================================
     * Similarity matrix
     * ======================================================= */
    const matrix = answers.flatMap(answer =>
        options.map(o => ({
            answer,
            text: o.text,
            option: o.option,
            score: similarity(answer, o.text)
        }))
    );

    /* =========================================================
     * Rank logic
     * ======================================================= */
    let ranked = [];
    let best = null;

    /* ---------- Strategy A: Max score ---------- */
    if (!useAverage) {
        ranked = [...matrix].sort((a, b) => b.score - a.score);
        best = ranked[0];
    }

    /* ---------- Strategy B: Average ---------- */
    else {
        const averaged = options.map(o => {
            const scores = matrix
                .filter(m => m.text === o.text)
                .map(m => m.score);

            return {
                text: o.text,
                option: o.option,
                score: scores.reduce((a, b) => a + b, 0) / scores.length
            };
        }).sort((a, b) => b.score - a.score);

        ranked = averaged;
        best = averaged[0];
    }

    /* =========================================================
     * Threshold enforcement
     * ======================================================= */
    if (!best || (threshold != null && best.score < threshold)) {
        if (!selectAtLeastOne) {
            console.warn(`⚠️ selectField(): no option met threshold (${threshold}%)`);
            return { success: false, best: null, ranked, options: optionTexts };
        }

        // Override: select best anyway
        best = ranked[0];
    }

    if (!best?.option) {
        return { success: false, best: null, ranked, options: optionTexts };
    }

    /* =========================================================
     * Apply selection (mutation-safe)
     * ======================================================= */
    await resolveResilient(
        () => {
            if (!selectEl.isConnected) return null;

            selectEl.value = best.option.value;

            // Ensure browser registers the change
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));

            return selectEl.value === best.option.value ? selectEl : null;
        },
        {
            validate: el => el && el.value === best.option.value,
            mutationTimeout
        }
    );

    console.log(
        `✅ Select set: "${best.text}" (${best.score.toFixed(2)}%)`
    );

    return {
        success: true,
        best: {
            text: best.text,
            value: best.option.value,
            score: best.score
        },
        ranked,
        options: optionTexts
    };
}



/* =========================================================
* 🎛️ Multiselect
* ======================================================= */
/* --------------------------------------------------------------------------
 * 🎛️ MULTISELECT: multiselect(inputLocator, values, chipContainerLocator, options)
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Automates selection of one or more values in a custom or ARIA-compliant
 *   multiselect input by simulating user-like typing and submission while
 *   verifying success via chip/tag creation.
 *
 *   The function supports fast direct value injection (no dropdown opening),
 *   mutation-based verification, and selection constraints to ensure the
 *   resulting chip state matches expected requirements.
 *
 * --------------------------------------------------------------------------
 * 🧭 EXECUTION FLOW
 * --------------------------------------------------------------------------
 *   1️⃣ Resolve multiselect input and chip container
 *   2️⃣ Capture existing chips (baseline state)
 *   3️⃣ Inject candidate value into input
 *   4️⃣ Submit via Enter / blur / tokenization fallbacks
 *   5️⃣ Observe chip container mutations to confirm acceptance
 *   6️⃣ Repeat for remaining values until constraints are met
 *   7️⃣ Enforce min / max / exact chip constraints
 *
 * --------------------------------------------------------------------------
 * 🔧 FEATURES
 * --------------------------------------------------------------------------
 *   ✅ Direct value injection (fast, dropdown-free)
 *   ✅ User-like submission fallbacks (Enter, blur, comma)
 *   ✅ MutationObserver-based verification
 *   ✅ Supports multiple candidate values in order
 *   ✅ Constraint enforcement:
 *       • minChips
 *       • maxChips
 *       • exactChips
 *   ✅ Graceful handling of rejected values
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {HTMLElement|string|Array} inputLocator
 *   → Locator for the multiselect input field.
 *
 * @param {string[]} values
 *   → Array of candidate values to attempt selection for, in order.
 *
 * @param {HTMLElement|string|Array} chipContainerLocator
 *   → Locator for the container where selected chips/tags are rendered.
 *
 * @param {Object} [options]
 * @param {string} [options.chipSelector='li']
 *   → Selector used to identify individual chips inside the container.
 *
 * @param {number|null} [options.maxChips=null]
 *   → Maximum number of chips allowed.
 *
 * @param {number|null} [options.minChips=null]
 *   → Minimum number of chips required.
 *
 * @param {number|null} [options.exactChips=null]
 *   → Enforces an exact number of chips.
 *
 * @param {number} [options.timeout=1500]
 *   → Timeout (ms) for waiting on chip mutation confirmation.
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {{
 *   success: boolean,
 *   added: string[],
 *   chips: string[]
 * }}
 *   → `success` → Whether the operation completed
 *   → `added`   → Values that successfully produced new chips
 *   → `chips`   → Final chip text values after execution
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Designed for React / Workday / tokenized multiselect components
 * • Does not require opening dropdown menus
 * • Verifies actual framework state via DOM mutations
 * • Safe to re-run without duplicating chips when constraints are enforced
 * -------------------------------------------------------------------------- */
// export async function multiselect( inputLocator, values, chipContainerLocator, { chipSelector = 'li', selectAllRelated = false, radioThreshold = 85, maxChips = 'auto', minChips = null, exactChips = null, timeout = 1500 } = {}) {

//     if (!Array.isArray(values) || !values.length) {
//         return { success: false, added: [], chips: [] };
//     }

//     const resolveInput = normalizeResolver(inputLocator);
//     const resolveChipContainer = normalizeResolver(chipContainerLocator);
//     const sleep = ms => new Promise(r => setTimeout(r, ms));

//     // Resolve and get multiselect ID
//     const input = resolveInput();
//     function getMultiselectId(input) {
//         const id = input.getAttribute('data-uxi-multiselect-id');
//         if (!id) return null;
//         return id
//     }
//     const multiselectId = getMultiselectId(input);

//     /* -------------------------------------------------------
//      * Chip helpers (truth signal)
//      * ----------------------------------------------------- */
//     const getChips = () => {
//         const c = resolveChipContainer();
//         if (!c) return [];
//         return [...c.querySelectorAll(chipSelector)];
//     };
//     const chipTexts = () => getChips().map(c => c.textContent.replace(/\s+/g, ' ').trim());

//     async function safeClick(checkboxOrRadio) {
//         try {
//             if (!checkboxOrRadio) return false;

//             // For checkbox: Skip if already selected
//             if (checkboxOrRadio.type === 'checkbox' && (checkboxOrRadio.checked || checkboxOrRadio.getAttribute('aria-checked') === 'true')) {
//                 return true;
//             }

//             // For radio: Skip if already selected
//             if (checkboxOrRadio.type === 'radio' && checkboxOrRadio.checked) {
//                 return true;
//             }

//             checkboxOrRadio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
//             checkboxOrRadio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
//             checkboxOrRadio.click();

//             return true;
//         } catch (e) {
//             console.warn('Click failed:', checkboxOrRadio, e);
//             return false;
//         }
//     }


//     /* -------------------------------------------------------
//      * MAIN LOOP
//      * ----------------------------------------------------- */

//     const added = [];

//     let maxChipsSynced = false;
//     const argMaxChips = maxChips;
//     maxChips = null;

//     let bestRadioMatch = { score: 0, option: null }; // Track the best similarity score
    
//     for (const value of values) {

//         const input = resolveInput();
//         if (!input) {
//             console.warn("❌ Multiselect input not found");
//             return { success: false, added: added, chips: chipTexts() };
//         }

//         const prevChipCount = getChips().length;
//         const prevChipOptionsText = chipTexts();
//         // Respect maxChips
//         if (maxChips && prevChipCount >= maxChips) {
//             console.log("✅ Max chips reached");
//             break;
//         }

//         // ---------- Fast Direct Injection ----------
//         input.focus();
//         input.value = '';
//         input.dispatchEvent(new Event('input', { bubbles: true }));

//         await sleep(50); // sleep 50 ms

//         input.value = value;
//         input.dispatchEvent(new Event('input', { bubbles: true }));


//         const submit = () => {
//             // 1️⃣ Enter
//             input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
//             input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

//             setTimeout(() => {
//                 // 2️⃣ Blur fallback
//                 input.blur();

//                 // 3️⃣ Comma tokenization fallback
//                 input.value = value + ',';
//                 input.dispatchEvent(new Event('input', { bubbles: true }));
//             }, 10);
//         };

//         submit();

//         /* ---------- CHECKBOX PATH ---------- */
//         await sleep(800);
//         if(!!el(`[data-associated-widget="${multiselectId}"]`)) {
//             await waitUntilSmart(
//                 () => el(`[data-associated-widget="${multiselectId}"]`).innerText !== '',
//                 { timeout: 10 }
//             )
//         }
//         await sleep(80);

//         const totalOptions = els(`[data-associated-widget="${multiselectId}"] div[role="option"]`).length;
//         const optionsText = [...els(`[data-associated-widget="${multiselectId}"] div[role="option"] div[data-automation-id="promptOption"]`)].map(el => el.textContent.trim());

//         const checkboxOptionEls = [...els(`[data-associated-widget="${multiselectId}"] div[role="option"] input[type="checkbox"]`)];
//         const radioOptionEls = [...els(`[data-associated-widget="${multiselectId}"] div[role="option"] input[type="radio"]`)];
        

//         if (!maxChipsSynced) {
//             if (checkboxOptionEls.length > 0) { // Contains checkbox(s)
//                 if (argMaxChips === 'auto') {
//                     maxChips = null; // Allow search for all values without max-cap.
//                 }
//             } else {    // Single chip allowed
//                 if (argMaxChips === 'auto') {
//                     maxChips = 1; // Single input multiselect type field.
//                 } else if (typeof argMaxChips === Number) {
//                     if (argMaxChips <= 0) {
//                         break;
//                     } else {
//                         maxChips = argMaxChips;
//                     }
//                 } else {
//                     maxChips = null;
//                 }
//             }

//             maxChipsSynced = true;
//         }

        
//         if (checkboxOptionEls.length > 0) {
//             // Decide what to click
//             const targets = selectAllRelated
//                 ? checkboxOptionEls
//                 : checkboxOptionEls.slice(0, 1);

//             // Parallel, failure-proof execution
//             await Promise.allSettled(targets.map(cb => safeClick(cb)));
//             await sleep(120)
//         } else if (radioOptionEls.length > 0) {

//             for (const [index, radio] of radioOptionEls.entries()) {
//                 const optionText = optionsText[index];
//                 const similarityScore = similarity(value, optionText); // Calculate similarity score
//                 if (similarityScore >= radioThreshold) {
//                     // Update best match if this option has a higher similarity score
//                     if (similarityScore > bestRadioMatch.score) {
//                         bestRadioMatch = { score: similarityScore, option: radio };
//                     }
//                 }
//             }

//             // If no selection was made and minSelections > 0, select the best option
//             if (prevChipCount===0 && minChips > 0) {
//                 if (bestRadioMatch.option) {
//                     await safeClick(bestRadioMatch.option);
//                 } else {
//                     await safeClick(radioOptionEls[0]);
//                 }
//                 await sleep(120);
//             }
//         }


//         /* ---------- CONFIRM ---------- */
//         const postChipCount = getChips().length;
//         const success = (postChipCount - prevChipCount > 0) ? true : false;

//         if (success) {
//             added.push(value);
//             console.log(`➰✅ "${value}" added`);
//         } else {
//             console.info(`➰ "${value}" not accepted`);
//         }
//     }


//     // Snapshot final chip state
//     const currentChips = chipTexts();

//     // ---------- Enforce maxChips (structural constraint) ----------
//     if (typeof maxChips === 'number' && currentChips.length > maxChips) {
//         console.log(`⚠️ Trimming to maxChips = ${maxChips}`);
//         while (currentChips.length > maxChips) {
//             const lastChip = getChips().pop();
//             if (lastChip) lastChip.remove();
//             currentChips.pop();
//         }
//     }

//     // ---------- Determine success ----------
//     let success = true;

//     // exactChips (strongest constraint)
//     if (typeof exactChips === 'number') {
//         success &&= currentChips.length === exactChips;
//         if (currentChips.length !== exactChips) {
//             console.warn(`⚠️ exactChips constraint not met: ${currentChips.length}/${exactChips}`);
//         }
//     }

//     // minChips
//     if (typeof minChips === 'number') {
//         success &&= currentChips.length >= minChips;
//         if (currentChips.length < minChips) {
//             console.warn(`⚠️ minChips constraint not met: ${currentChips.length}/${minChips}`);
//         }
//     }

//     // maxChips (post-trim validation)
//     if (typeof maxChips === 'number') {
//         success &&= currentChips.length <= maxChips;
//     }

//     // No constraints → require at least one successful add
//     if ( exactChips == null && minChips == null && maxChips == null ) {
//         success = added.length > 0;
//     }

//     return { success, added: added, chips: currentChips };
// }

/**
 * 
 */

export async function multiselect( inputLocator, values, chipContainerLocator, { chipSelector = 'li', selectAllRelated = false, radioThreshold = 85, maxChips = 'auto', minChips = null, exactChips = null, avoidDuplicates = true, timeout = 1500 } = {}) {

    if (!Array.isArray(values) || !values.length) {
        return { success: false, added: [], chips: [] };
    }

    const resolveInput = normalizeResolver(inputLocator);
    const resolveChipContainer = normalizeResolver(chipContainerLocator);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Resolve and get multiselect ID
    const input = resolveInput();
    function getMultiselectId(input) {
        const id = input.getAttribute('data-uxi-multiselect-id');
        if (!id) return null;
        return id
    }
    const multiselectId = getMultiselectId(input);

    /* -------------------------------------------------------
     * Chip helpers (truth signal)
     * ----------------------------------------------------- */
    const getChips = () => {
        const c = resolveChipContainer();
        if (!c) return [];
        return [...c.querySelectorAll(chipSelector)];
    };
    const chipTexts = () => getChips().map(c => c.textContent.replace(/\s+/g, ' ').trim());

    function normalizeChip(text) {
        return text
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }
    const getNormalizedChips = () =>
    chipTexts().map(normalizeChip);
    const normalizedChipSet = new Set(getNormalizedChips());

    async function safeClick(checkboxOrRadio) {
        try {
            if (!checkboxOrRadio) return false;

            // For checkbox: Skip if already selected
            if (checkboxOrRadio.type === 'checkbox' && (checkboxOrRadio.checked || checkboxOrRadio.getAttribute('aria-checked') === 'true')) {
                return true;
            }

            // For radio: Skip if already selected
            if (checkboxOrRadio.type === 'radio' && checkboxOrRadio.checked) {
                return true;
            }

            checkboxOrRadio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            checkboxOrRadio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            checkboxOrRadio.click();

            return true;
        } catch (e) {
            console.warn('Click failed:', checkboxOrRadio, e);
            return false;
        }
    }


    /* -------------------------------------------------------
     * MAIN LOOP
     * ----------------------------------------------------- */

    const added = [];

    let maxChipsSynced = false;
    const argMaxChips = maxChips;
    maxChips = null;

    let bestRadioMatch = { score: 0, option: null }; // Track the best similarity score
    
    for (const value of values) {

        const input = resolveInput();
        if (!input) {
            console.warn("❌ Multiselect input not found");
            return { success: false, added: added, chips: chipTexts() };
        }

        const prevChipCount = getChips().length;
        const prevChipOptionsText = chipTexts();
        // Respect maxChips
        if (maxChips && prevChipCount >= maxChips) {
            console.log("✅ Max chips reached");
            break;
        }

        // ---------- Fast Direct Injection ----------
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await sleep(50); // sleep 50 ms

        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));


        const normalizedValue = normalizeChip(value);
        if (avoidDuplicates && normalizedChipSet.has(normalizedValue)) {
            console.log(`⏭️ Skipping duplicate value (normalized): "${value}"`);
            continue;
        }

        const submit = () => {
            // 1️⃣ Enter
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

            setTimeout(() => {
                // 2️⃣ Blur fallback
                input.blur();

                // 3️⃣ Comma tokenization fallback
                input.value = value + ',';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }, 10);
        };

        submit();

        /* ---------- CHECKBOX PATH ---------- */
        await sleep(800);
        if(!!el(`[data-associated-widget="${multiselectId}"]`)) {
            await waitUntilSmart(
                () => el(`[data-associated-widget="${multiselectId}"]`).innerText !== '',
                { timeout: 10 }
            )
        }
        await sleep(80);

        const totalOptions = els(`[data-associated-widget="${multiselectId}"] div[role="option"]`).length;
        const optionsText = [...els(`[data-associated-widget="${multiselectId}"] div[role="option"] div[data-automation-id="promptOption"]`)].map(el => el.textContent.trim());

        const checkboxOptionEls = [...els(`[data-associated-widget="${multiselectId}"] div[role="option"] input[type="checkbox"]`)];
        const radioOptionEls = [...els(`[data-associated-widget="${multiselectId}"] div[role="option"] input[type="radio"]`)];
        

        if (!maxChipsSynced) {
            if (checkboxOptionEls.length > 0) { // Contains checkbox(s)
                if (argMaxChips === 'auto') {
                    maxChips = null; // Allow search for all values without max-cap.
                }
            } else {    // Single chip allowed
                if (argMaxChips === 'auto') {
                    maxChips = 1; // Single input multiselect type field.
                } else if (typeof argMaxChips === Number) {
                    if (argMaxChips <= 0) {
                        break;
                    } else {
                        maxChips = argMaxChips;
                    }
                } else {
                    maxChips = null;
                }
            }

            maxChipsSynced = true;
        }

        
        if (checkboxOptionEls.length > 0) {
            const targets = selectAllRelated
                ? checkboxOptionEls
                : checkboxOptionEls.slice(0, 1);

            for (const [index, cb] of targets.entries()) {
                const optionText = optionsText[index];
                const normalizedOption = normalizeChip(optionText);
                if (avoidDuplicates && normalizedChipSet.has(normalizedOption)) {
                    console.log(`⏭️ Skipping duplicate checkbox option: "${optionText}"`);
                    continue;
                }
                await safeClick(cb);
                normalizedChipSet.add(normalizedOption);
            }
            await sleep(120);
        } else if (radioOptionEls.length > 0) {

            for (const [index, radio] of radioOptionEls.entries()) {
                const optionText = optionsText[index];
                const similarityScore = similarity(value, optionText); // Calculate similarity score
                if (similarityScore >= radioThreshold) {
                    // Update best match if this option has a higher similarity score
                    if (similarityScore > bestRadioMatch.score) {
                        bestRadioMatch = { score: similarityScore, option: radio };
                    }
                }
            }

            // If no selection was made and minSelections > 0, select the best option
            if (prevChipCount===0 && minChips > 0) {
                if (bestRadioMatch.option) {
                    const optionIndex = radioOptionEls.indexOf(bestRadioMatch.option);
                    const optionText = optionsText[optionIndex];
                    const normalizedOption = normalizeChip(optionText);

                    if (!(avoidDuplicates && normalizedChipSet.has(normalizedOption))) {
                        await safeClick(bestRadioMatch.option);
                        normalizedChipSet.add(normalizedOption);
                    } else {
                        console.log(`⏭️ Skipping duplicate radio option: "${optionText}"`);
                    }
                } else {
                    await safeClick(radioOptionEls[0]);
                }
                await sleep(120);
            }
        }


        /* ---------- CONFIRM ---------- */
        const postChipCount = getChips().length;
        const success = (postChipCount - prevChipCount > 0) ? true : false;

        if (success) {
            added.push(value);
            normalizedChipSet.add(normalizeChip(value));
            console.log(`➰✅ "${value}" added`);
        } else {
            console.info(`➰ "${value}" not accepted`);
        }
    }

    // Snapshot final chip state
    const currentChips = chipTexts();

    // ---------- Enforce maxChips (structural constraint) ----------
    if (typeof maxChips === 'number' && currentChips.length > maxChips) {
        console.log(`⚠️ Trimming to maxChips = ${maxChips}`);
        while (currentChips.length > maxChips) {
            const lastChip = getChips().pop();
            if (lastChip) lastChip.remove();
            currentChips.pop();
        }
    }

    // ---------- Determine success ----------
    let success = true;

    // exactChips (strongest constraint)
    if (typeof exactChips === 'number') {
        success &&= currentChips.length === exactChips;
        if (currentChips.length !== exactChips) {
            console.warn(`⚠️ exactChips constraint not met: ${currentChips.length}/${exactChips}`);
        }
    }

    // minChips
    if (typeof minChips === 'number') {
        success &&= currentChips.length >= minChips;
        if (currentChips.length < minChips) {
            console.warn(`⚠️ minChips constraint not met: ${currentChips.length}/${minChips}`);
        }
    }

    // maxChips (post-trim validation)
    if (typeof maxChips === 'number') {
        success &&= currentChips.length <= maxChips;
    }

    // No constraints → require at least one successful add
    if ( exactChips == null && minChips == null && maxChips == null ) {
        success = added.length > 0;
    }

    return { success, added: added, chips: currentChips };
}


/* =========================================================
 * 🗂️📎 FILE UPLOAD — Resilient, Multi-file, Progress-aware
 * ======================================================= */
/* --------------------------------------------------------------------------
 * 📤 uploadFiles(fileInputLocator, filePaths, options)
 * --------------------------------------------------------------------------
 *
 * Robustly uploads one or multiple files to a file input while:
 *  - Handling hidden inputs
 *  - Supporting custom upload widgets
 *  - Detecting progress via DOM mutations
 *  - Verifying acceptance via filename rendering
 *  - Being SPA-safe (React / Workday / portals / async UIs)
 *
 * --------------------------------------------------------------------------
 * 🧭 EXECUTION FLOW
 * --------------------------------------------------------------------------
 * 1️⃣ Resolve file input (mutation-aware)
 * 2️⃣ Normalize paths → File objects
 * 3️⃣ Inject files via DataTransfer (browser-safe)
 * 4️⃣ Trigger input + change events
 * 5️⃣ Observe upload progress (mutation-based + attribute-based)
 * 6️⃣ Verify acceptance via filename appearance
 * 7️⃣ Return structured result
 *
 * --------------------------------------------------------------------------
 * @param {HTMLElement|string|Array} fileInputLocator
 *   → Locator for the <input type="file"> or upload widget container
 *
 * @param {string|string[]} filePaths
 *   → Single path or array of file paths (web_accessible_resources)
 *
 * @param {Object} [options]
 * @param {string} [options.filenameSelector]
 *   → CSS selector for uploaded filename elements (if UI renders them)
 *
 * @param {string} [options.progressSelector]
 *   → CSS selector for progress bar / spinner (optional)
 *
 * @param {number} [options.timeout=5000]
 *   → Max time to wait for upload confirmation (ms)
 *
 * @param {boolean} [options.allowMultiple=true]
 *   → Whether multiple file selection is allowed
 *
 * @returns {Promise<{
 *   success: boolean,
 *   uploaded: string[],
 *   failed: string[],
 *   progressEvents: number
 * }>}
 * -------------------------------------------------------------------------- */
export async function uploadFiles(fileInputLocator, filePaths, {filenameSelector = null, progressSelector = null, timeout = 9000, allowMultiple = true} = {}) {
	
    /* ===================== 1️⃣ Normalize Inputs ===================== */

	const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

	if (!paths.length) {
		console.warn("❌ uploadFiles(): No file paths provided");
		return {
			success: false,
			uploaded: [],
			failed: [],
			progressEvents: 0
		};
	}

	/* ===================== 2️⃣ Resolve File Input ===================== */

	const resolveInput = normalizeResolver(fileInputLocator);

	const input = await resolveResilient(
		() => {
			const el = resolveInput();
			if (!el) return null;

			// Accept either <input type="file"> or a container that contains one
			if (el instanceof HTMLInputElement && el.type === "file") return el;
			return el.querySelector('input[type="file"]');
		}, {
			validate: el => el instanceof HTMLInputElement && el.isConnected,
			mutationTimeout: 2000
		}
	);

	if (!input) {
		console.warn("❌ uploadFiles(): File input not found");
		return {
			success: false,
			uploaded: [],
			failed: paths,
			progressEvents: 0
		};
	}

	if (!allowMultiple && paths.length > 1) {
		console.warn("⚠️ uploadFiles(): Multiple files provided but input does not allow multiple");
	}

	/* ===================== 3️⃣ Convert Paths → File Objects ===================== */

	async function pathToFile(path) {
		try {
			const res = await fetch(chrome.runtime.getURL(path));
			const blob = await res.blob();

			const filename = path.split("/").pop();

			return new File([blob], filename, {
				type: blob.type || "application/pdf"
			});
		} catch (err) {
			console.error("❌ Failed to load file:", path, err);
			return null;
		}
	}

	const files = (await Promise.all(paths.map(pathToFile))).filter(Boolean);

	if (!files.length) {
		console.warn("❌ uploadFiles(): No valid files could be loaded");
		return {
			success: false,
			uploaded: [],
			failed: paths,
			progressEvents: 0
		};
	}

	/* ===================== 4️⃣ Inject Files via DataTransfer ===================== */

	const dataTransfer = new DataTransfer();
	files.forEach(file => dataTransfer.items.add(file));

	input.files = dataTransfer.files;

	// Trigger framework-aware events
	["input", "change"].forEach(evt =>
		input.dispatchEvent(new Event(evt, {
			bubbles: true
		}))
	);

	/* ===================== 5️⃣ Observe Upload Progress ===================== */
    function normalizeFilename(name) {
        if (!name) return "";

        // Remove extension (last dot only)
        const base = name.replace(/\.[^/.]+$/, "");

        return base
            .toLowerCase()               // ignore case
            .normalize("NFKD")           // normalize unicode
            .replace(/[^\w\s-]/g, "")    // remove weird characters
            .replace(/\s+/g, " ")        // collapse whitespace
            .trim();
    }


    let progressEvents = 0;

    const waitForProgressOrCompletion = () =>
        new Promise(resolve => {
            let completedCount = 0; // count uploads, not filenames
            const totalFiles = files.length;
            const startTime = performance.now();
            let progressVisible = false;

            const observer = new MutationObserver(() => {
                progressEvents++;

                // 1️⃣ If filenameSelector is provided, check filenames
                if (filenameSelector) {
                    const renderedNames = [...document.querySelectorAll(filenameSelector)]
                        .map(el => el.textContent.trim());

                    const normalizedRendered = renderedNames.map(normalizeFilename);

                    files.forEach(f => {
                        const normalizedFile = normalizeFilename(f.name);

                        if (normalizedRendered.some(name => 
                                name.includes(normalizedFile) 
                                || normalizedFile.includes(name)
                            )
                        ) {
                            if (!f._counted) {
                                completedCount++;
                                f._counted = true;
                            }
                        }
                    });

                    if (completedCount === totalFiles) {
                        observer.disconnect();
                        resolve({
                            done: true,
                            completedCount
                        });
                        return;
                    }
                }

                // 2️⃣ If progressSelector is provided, track appearance → disappearance
                if (progressSelector) {
                    const progressEl = document.querySelector(progressSelector);
                    if (progressEl) {
                        progressVisible = true; // upload started
                    } else if (progressVisible) {
                        // progress appeared then disappeared → consider all done
                        observer.disconnect();
                        resolve({
                            done: true,
                            completedCount: totalFiles
                        });
                        return;
                    }
                }

                // 3️⃣ Timeout guard
                if (performance.now() - startTime > timeout) {
                    observer.disconnect();
                    resolve({
                        done: false,
                        completedCount
                    });
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });

            // hard timeout fallback
            setTimeout(() => {
                observer.disconnect();
                resolve({
                    done: false,
                    completedCount
                });
            }, timeout);
        });

    const result = await waitForProgressOrCompletion();

    /* ===================== 6️⃣ Verify Acceptance ===================== */

    // Build uploaded / failed arrays
    const uploaded = files.slice(0, result.completedCount).map(f => f.name);
    const failed = files.slice(result.completedCount).map(f => f.name);

    const success = uploaded.length > 0;

    console.log(
        success ?
        `✅ Uploaded: ${uploaded.join(", ")}` :
        `⚠️ Upload incomplete. Failed: ${failed.join(", ")}`
    );

    return {
        success,
        uploaded,
        failed,
        progressEvents
    };
}