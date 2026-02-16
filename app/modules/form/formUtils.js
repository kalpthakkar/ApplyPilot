// utils/formUtils.js
import { getBestResume } from '@shared/utils/utility.js';


/**
 * @typedef {string} FieldType
 */
export const FIELD_TYPE = Object.freeze({
    // ===== Native HTML form controls =====
    TEXT: 'text',
    EMAIL: 'email',
    NUMBER: 'number',
    TEL: 'tel',
    URL: 'url',
    SEARCH: 'search',
    PASSWORD: 'password',
    TEXTAREA: 'textarea',
    RADIO: 'radio',
    CHECKBOX: 'checkbox',
    SELECT: 'select',
    MULTISELECT: 'multiselect',
    DROPDOWN: 'dropdown',
    BUTTON: 'button',
    FILE: 'file',
    DATE: 'date',
    TIME: 'time',
    RANGE: 'range',
    HIDDEN: 'hidden',
});

export const FIELD_TYPE_SELECTION = Object.freeze({ 
    ALL: Object.keys(FIELD_TYPE), 
    NONE: [] 
});


export const FIELD_VALIDATOR = {
    // Text-like fields

    // TODO: Blocked Alpha (Input only) filed pattern for Workday.
    /* Example:
    <fieldset class="css-1s9yhc">
    <legend>
        <div id="rich-label605" class="css-f6y8ld">
        <div data-automation-id="richText" class="css-ej424k">
            <p><b>What are your compensation expectations for the role?</b></p>
        </div>
        </div>
    </legend>
    <div class="css-15rz5ap">
        <div>
            <input type="text" id="primaryQuestionnaire--4bd8457aa3c910010c065123214c0006" aria-required="false" class="css-1vn3ov0" value="">
        </div>
        <div class="css-0"></div>
    </div>
    </fieldset>
    */

    'text':      (el) => el.tagName === 'INPUT' && el.type === 'text',
    'email':     (el) => el.tagName === 'INPUT' && el.type === 'email',
    'number':    (el) => el.tagName === 'INPUT' && el.type === 'number',
    'tel':       (el) => el.tagName === 'INPUT' && el.type === 'tel',
    'url':       (el) => el.tagName === 'INPUT' && el.type === 'url',
    'search':    (el) => el.tagName === 'INPUT' && el.type === 'search',
    'password':  (el) => el.tagName === 'INPUT' && el.type === 'password',

    // Textarea
    'textarea':  (el) => el.tagName === 'TEXTAREA',

    // Radio / Checkbox groups
    'radio':     (el) => el.tagName === 'INPUT' && el.type === 'radio',
    'checkbox':  (el) => el.tagName === 'INPUT' && el.type === 'checkbox',

    // Select / Multiselect dropdowns
    'select':      (el) => el.tagName === 'SELECT' && !el.multiple,
    'multiselect': (el) => el.hasAttribute('data-uxi-multiselect-id'),
    'dropdown':    (el) => el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox',

    // Button
    'button':    (el) => el.tagName === 'BUTTON',

    // File
    'file':     (el) => el instanceof HTMLInputElement && el.type === "file",

    // Hidden
    'hidden':   (el) => el instanceof HTMLInputElement && el.type === "hidden",

    // Unknown / fallback
    'unknown':   (el) => true // matches anything not caught by above
};

export const FIELD_TIMEOUT_MAP = { // type -> seconds
    'text': 2,
    'email': 2, 
    'number': 3, 
    'tel': 2, 
    'url': 2, 
    'search': 2,
    'password': 2, 
    'textare': 0.8,
    'radio': 5,
    'checkbox': 5,
    'select': 5,
    'multiselect': 10,
    'dropdown': 5,
    'button': 3,
    // add more types as needed   
}



export function sleep(sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}

/* =========================================================================================
* Basic Helpers Utilities
* ========================================================================================= */
export function filterValidStringSelectors(locators) {
    return locators
		.filter(el => typeof el === 'string')       // keep only strings
		.filter(sel => document.querySelector(sel)); // keep only if element exists
}

export function filterValidHtmlElements(locators) {
    return locators
		.filter(el => el instanceof HTMLElement)    // keep only HTMLElements
		.filter(el => document.contains(el));      // keep only if attached to DOM
}

export function filterCheckboxLocators(locators) {
    const resolved = [];

    for (const loc of locators) {
        const els =
            typeof loc === 'string'
                ? [...document.querySelectorAll(loc)]
                : loc instanceof HTMLElement
                ? [loc]
                : Array.isArray(loc)
                ? loc.filter(el => el instanceof HTMLElement)
                : [];

        for (const el of els) {
            const isNative =
                el instanceof HTMLInputElement &&
                el.type === 'checkbox';

            const isAria =
                el.getAttribute?.('role') === 'checkbox' &&
                el.tabIndex >= 0;

            if (isNative || isAria) {
                resolved.push(el);
            }
        }
    }

    return resolved;
}


/* =========================================================================================
*  🧬 Mutation Resolver
* ========================================================================================= */

/* --------------------------------------------------------------------------
 * 📍 Get normalized element locator(s) for sending to resolver
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * 🔎 RESOLVER NORMALIZATION: normalizeResolver(locator, options)
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Normalizes a wide variety of locator inputs into a single, consistent
 *   resolver function that can be safely used with mutation-aware utilities
 *   (e.g., resolveResilient).
 *
 *   This abstraction allows all DOM-resolution logic to work uniformly,
 *   regardless of whether the caller provides:
 *     • a single HTMLElement
 *     • a selector string
 *     • an array of selectors
 *     • a NodeList / HTMLCollection
 *     • an array of HTMLElements
 *     • a custom locator object with resolve() or selectors[]
 *
 * --------------------------------------------------------------------------
 * 🧠 CORE IDEA:
 *   normalizeResolver() always returns a FUNCTION.
 *   That function, when invoked:
 *     • returns a resolved element (or elements), OR
 *     • returns null to signal "not ready yet" (triggering retries/mutations)
 *
 * --------------------------------------------------------------------------
 * 📜 CONTRACT
 * --------------------------------------------------------------------------
 *   Resolution mode determines the return shape:
 *
 *   • mode: "single" (default)
 *       → HTMLElement | null
 *
 *   • mode: "multi"
 *       → HTMLElement[] | null
 *         (guaranteed to be a non-empty array when resolved)
 *
 *   IMPORTANT:
 *   Returning `null` explicitly means:
 *     → element(s) not resolved yet
 *     → caller may retry / wait for DOM mutations
 *
 * --------------------------------------------------------------------------
 * 🔧 SUPPORTED LOCATOR TYPES
 * --------------------------------------------------------------------------
 *   ✅ HTMLElement
 *   ✅ HTMLElement[]
 *   ✅ NodeList / HTMLCollection
 *   ✅ CSS selector string
 *   ✅ Array of selector strings (fallback order)
 *   ✅ Locator object with:
 *        • resolve(): HTMLElement | HTMLElement[]
 *        • selectors: string[]
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {HTMLElement | HTMLElement[] | NodeList | HTMLCollection |
 *         string | string[] | Object} locator
 *   → Flexible locator describing how to find the target element(s).
 *
 * @param {Object} [options]
 * @param {'single' | 'multi'} [options.mode='single']
 *   → Resolution mode controlling return shape.
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {() => HTMLElement | HTMLElement[] | null}
 *   → A resolver function that can be called repeatedly.
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Central building block for all resilient DOM interactions
 * • Designed to work seamlessly with MutationObserver-based retries
 * • Enforces strict HTMLElement filtering for safety
 * • Throws early on invalid locator inputs (fail-fast)
 * -------------------------------------------------------------------------- */
export function normalizeResolver(locator, { mode = 'single' } = {}) {
    const isMulti = mode === 'multi';

    const normalizeResult = (els) => {
        if (!els || !els.length) return null;
        return isMulti ? els : els[0];
    };

    // -------------------------------------------------------
    // NodeList
    // -------------------------------------------------------
    if (locator instanceof NodeList || locator instanceof HTMLCollection) {
        const els = Array.from(locator).filter(el => el instanceof HTMLElement);
        return () => normalizeResult(els);
    }

    // -------------------------------------------------------
    // HTMLElement
    // -------------------------------------------------------
    if (locator instanceof HTMLElement) {
        return () => (isMulti ? [locator] : locator);
    }

    // -------------------------------------------------------
    // Selector string
    // -------------------------------------------------------
    if (typeof locator === 'string') {
        return () => {
            const els = Array.from(document.querySelectorAll(locator));
            return normalizeResult(els);
        };
    }

    // -------------------------------------------------------
    // Array: mixed locators (mode-aware)
    // -------------------------------------------------------
    if (Array.isArray(locator)) {
        const resolvers = locator.map(item =>
            normalizeResolver(item, { mode })
        );

        // SINGLE MODE → first successful resolution wins
        if (!isMulti) {
            return () => {
                for (const resolve of resolvers) {
                    const result = resolve();
                    if (result) return result;
                }
                return null;
            };
        }

        // MULTI MODE → union of all resolved elements
        return () => {
            const collected = [];

            for (const resolve of resolvers) {
                const result = resolve();
                if (!result) continue;

                const els = Array.isArray(result) ? result : [result];
                for (const el of els) {
                    if (
                        el instanceof HTMLElement &&
                        !collected.includes(el)
                    ) {
                        collected.push(el);
                    }
                }
            }

            // /* If Order matters */
            // collected.sort((a, b) =>
            //     a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
            // );

            return collected.length ? collected : null;
        };
    }

    // -------------------------------------------------------
    // Locator object with resolve()
    // -------------------------------------------------------
    if (typeof locator?.resolve === 'function') {
        return () => {
            const result = locator.resolve();
            if (!result) return null;

            if (result instanceof HTMLElement) {
                return isMulti ? [result] : result;
            }

            if (Array.isArray(result)) {
                return normalizeResult(result.filter(el => el instanceof HTMLElement));
            }

            return null;
        };
    }

    // -------------------------------------------------------
    // Locator object with selectors[]
    // -------------------------------------------------------
    if (Array.isArray(locator?.selectors)) {
        return () => {
            for (const sel of locator.selectors) {
                const els = Array.from(document.querySelectorAll(sel));
                if (els.length) return normalizeResult(els);
            }
            return null;
        };
    }

    throw new Error('Invalid locator passed to normalizeResolver()');
}

/* --------------------------------------------------------------------------
 * ➰ Hybrid retry + mutation-aware resolver
 * ------------------------------------------------------------------------ */
const defaultValidate = el => Array.isArray(el) ? el.length > 0 && el.every(e => e?.isConnected) : el && el.isConnected;
/* --------------------------------------------------------------------------
 * 🧬 RESILIENT DOM RESOLUTION: resolveResilient(resolver, options)
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Reliably resolves dynamic DOM elements by repeatedly invoking a resolver
 *   function and waiting for DOM mutations when necessary.
 *
 *   Designed for modern, highly dynamic UIs (React, Vue, Angular, portals,
 *   async renders) where elements may appear, disappear, or re-mount after
 *   user interactions.
 *
 *   The function combines:
 *     • immediate resolution attempts
 *     • MutationObserver-based waiting
 *     • configurable retry cycles
 *
 * --------------------------------------------------------------------------
 * 🧠 CORE IDEA:
 *   A resolver may temporarily return `null` while the DOM is unstable.
 *   resolveResilient() treats this as a signal to wait, observe mutations,
 *   and retry until the element becomes valid or time limits are exceeded.
 *
 * --------------------------------------------------------------------------
 * 🔧 HOW IT WORKS
 * --------------------------------------------------------------------------
 *   For each retry cycle:
 *     1️⃣ Call resolver() immediately
 *     2️⃣ If validation passes → return result
 *     3️⃣ Otherwise:
 *         • Observe DOM mutations
 *         • Re-run resolver() on each mutation
 *         • Resolve as soon as validation passes
 *     4️⃣ Optional delay before next retry cycle
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {Function} resolver
 *   → A function (typically from normalizeResolver) that attempts to
 *     resolve an element or element collection.
 *
 * @param {Object} [options]
 * @param {number} [options.retries=2]
 *   → Number of retry cycles after mutation-based waiting.
 *
 * @param {number} [options.delay=120]
 *   → Delay (ms) between retry cycles.
 *
 * @param {number} [options.mutationTimeout=1500]
 *   → Max time (ms) to wait for DOM mutations per retry.
 *
 * @param {Function} [options.validate=defaultValidate]
 *   → Validation function that determines whether a resolved value
 *     is acceptable (e.g., non-null, connected, non-empty array).
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * @returns {Promise<HTMLElement | HTMLElement[] | null>}
 *   → Resolves with:
 *       • Valid resolved element(s), or
 *       • null if resolution failed within constraints
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Safe to use with single or multi resolvers
 * • Validation decouples resolution from correctness checks
 * • MutationObserver is automatically disconnected on success/timeout
 * • Designed as the backbone of all robust form automation utilities
 * -------------------------------------------------------------------------- */
export async function resolveResilient(resolver, {retries = 2, delay = 120, mutationTimeout = 1500, validate = defaultValidate} = {}) {

    /**
     * Waits for DOM mutations until resolver returns a valid value
    */
    function waitForMutationResolve(resolver, {timeout = 2000, root = document.body, validate = defaultValidate} = {}) {
        return new Promise(resolve => {
            const start = performance.now();

            // Immediate attempt
            const immediate = resolver();
            if (validate(immediate)) {
                resolve(immediate);
                return;
            }

            const observer = new MutationObserver(() => {
                const el = resolver();
                if (validate(el)) {
                    observer.disconnect();
                    resolve(el);
                } else if (performance.now() - start > timeout) {
                    observer.disconnect();
                    resolve(null);
                }
            });

            observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    for (let i = 0; i <= retries; i++) {
        const el = resolver();
        if (validate(el)) return el;
        const mutated = await waitForMutationResolve(resolver, {timeout: mutationTimeout, validate});
        if (validate(mutated)) return mutated;
        if (i < retries) await new Promise(r => setTimeout(r, delay));
    }
    return null;
}


/* =========================================================================================
*  🧼 Clear Containers
* ========================================================================================= */
export async function clearFields(locators) {

    /* -------------------------------------------------
     * 🔹 Helpers
     * ------------------------------------------------- */

    function normalizeContainers(input) {
        if (!input) return [];

        // HTMLElement
        if (input instanceof HTMLElement) {
            return [input];
        }

        // Selector string
        if (typeof input === 'string') {
            return [...document.querySelectorAll(input)];
        }

        // NodeList / HTMLCollection
        if (input instanceof NodeList || input instanceof HTMLCollection) {
            return [...input].filter(el => el instanceof HTMLElement);
        }

        // Array (may be nested / mixed)
        if (Array.isArray(input)) {
            return input.flatMap(item => normalizeContainers(item));
        }

        return [];
    }

    function clearInputProperly(input) {
        if (!input) return;

        const proto = Object.getPrototypeOf(input);
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        nativeSetter?.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function commitInput(input) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    }

    /* -------------------------------------------------
     * 🔹 Resolve containers
     * ------------------------------------------------- */

    const containers = normalizeContainers(locators);

    if (!containers.length) {
        console.warn('⚠️ clearFields: No valid containers resolved', locators);
        return;
    }

    /* -------------------------------------------------
     * 🔹 Clear inputs inside containers
     * ------------------------------------------------- */

    const INPUT_SELECTOR = 'input, textarea, [contenteditable="true"]';

    const seen = new Set();

    function clearOne(input) {
        if (seen.has(input)) return;
        seen.add(input);

        input.focus();

        // 🔹 Checkbox handling
        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
            if (input.checked) {
                input.checked = false;

                // Commit change (Workday listens to this)
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            input.dispatchEvent(
                new FocusEvent('focusout', { bubbles: true, composed: true })
            );
            try { input.blur(); } catch {}
            return;
        }

        // 🔹 Radio handling (best-effort; radios often require selecting another)
        if (input instanceof HTMLInputElement && input.type === 'radio') {
            if (input.checked) {
                input.checked = false;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            input.dispatchEvent(
                new FocusEvent('focusout', { bubbles: true, composed: true })
            );
            try { input.blur(); } catch {}
            return;
        }

        // 🔹 All other inputs
        clearInputProperly(input);
        commitInput(input);
    }

    for (const el of containers) {

        // Case 1: el itself is an input
        if (el.matches?.(INPUT_SELECTOR)) {
            clearOne(el);
            continue;
        }

        // Case 2: el is a container
        const inputs = el.querySelectorAll(INPUT_SELECTOR);

        for (const input of inputs) {
            clearOne(input);
        }
    }


    /* -------------------------------------------------
     * 🔹 Allow framework sync
     * ------------------------------------------------- */

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 50));
}

/* =========================================================================================
*  🔄 Sync (Add/Remove) Containers
* ========================================================================================= */
/* --------------------------------------------------------------------------
 * 🌀 Sync Containers (Mutation-Safe Version)
 * ------------------------------------------------------------------------ */
/* 
 * 🔧 DESCRIPTION:
 *   Dynamically adds or removes containers (e.g., Work Experience, Education)
 *   to match a target count from the database. Fully mutation-safe, leveraging:
 *     • 🧬 normalizeResolver → abstracts element resolution
 *     • 🧩 resolveResilient → waits for dynamic DOM updates
 *
 * ⚡ KEY FEATURES:
 *   • Safe for React/Vue/Workday async-rendered UIs
 *   • Observes DOM mutations and retries until containers/buttons are ready
 *   • Always deletes the last container to avoid index shifting
 *
 * 🧰 PARAMETERS:
 *   @param {string|HTMLElement|NodeList|Array|Object} containerSelector
 *       → Selector or element(s) representing the container blocks
 *
 *   @param {number} targetCount
 *       → Desired number of containers to sync to
 *
 *   @param {string|HTMLElement|Array|Object} addButtonLocator
 *       → Locator for the "Add" button
 *
 *   @param {string|HTMLElement|Array|Object} deleteButtonsLocator
 *       → Locator for the "Delete" buttons
 *
 * 💡 LOGIC:
 *   1️⃣ Resolve container count
 *   2️⃣ Add containers until count == targetCount
 *   3️⃣ Remove containers from the end until count == targetCount
 *
 * =========================================================================================
 */
export async function syncContainersResilient({containerSelector, targetCount, addButtonLocator, deleteButtonsLocator}) {
    // 🧩 Normalize locators to resolver functions
    const containerResolver = normalizeResolver(containerSelector, { mode: 'multi' });
    const addButtonResolver = normalizeResolver(addButtonLocator);
    const deleteButtonsResolver = normalizeResolver(deleteButtonsLocator, { mode: 'multi' });

    // 🔢 Helper: get current number of containers via mutation-aware resolver
    const getCount = async () => {
        const containers = await resolveResilient(containerResolver);
        return containers ? containers.length : 0;
    };

    let currentCount = await getCount();

    /* -------------------- ➕ ADD -------------------- */
    while (currentCount < targetCount) {
        // 🖱 Resolve the Add button safely
        const addBtn = await resolveResilient(addButtonResolver);
        if (!addBtn) break;

        addBtn.click(); // click to add new container

        // 🕵️ Wait for the container count to increase
        await resolveResilient(containerResolver, {validate: els => els?.length > currentCount});

        currentCount++;
    }

    /* -------------------- ➖ REMOVE -------------------- */
    while (currentCount > targetCount) {
        // 🖱 Resolve all delete buttons
        const deleteBtns = await resolveResilient(deleteButtonsResolver);
        if (!deleteBtns?.length) break;

        // ⚠ Delete last container to avoid index shifting
        deleteBtns[deleteBtns.length - 1].click();

        // 🕵️ Wait for the container count to decrease
        await resolveResilient(containerResolver, {validate: els => els?.length < currentCount});

        currentCount--;
    }
}

/* --------------------------------------------------------------------------
 * 🌀 Sync Containers (Simple Delay Version - Faster)
 * ------------------------------------------------------------------------ */
/* 
 * 🔧 DESCRIPTION:
 *   Adds or removes containers to match a target count using direct DOM queries
 *   with simple delays. Faster startup but less robust for async DOM updates.
 *
 * 🧰 PARAMETERS:
 *   @param {number} currentCount
 *       → Current number of containers in the DOM
 *
 *   @param {number} targetCount
 *       → Desired number of containers to sync to
 *
 *   @param {string} addButtonSelector
 *       → CSS selector for the Add button
 *
 *   @param {string} deleteButtonsSelector
 *       → CSS selector for the Delete buttons
 *
 *   @param {number} [delay=300]
 *       → Delay in ms between clicks
 *
 * 💡 LOGIC:
 *   1️⃣ Add containers if currentCount < targetCount
 *   2️⃣ Remove containers from the end if currentCount > targetCount
 *
 * =========================================================================================
 */
export async function syncContainersSimple({currentCount, targetCount, addButtonSelector, deleteButtonsSelector, delay = 300}) {
    
    const wait = ms => new Promise(r => setTimeout(r, ms));

    /* -------------------- ➕ ADD -------------------- */
    while (currentCount < targetCount) {
        const addBtn = document.querySelector(addButtonSelector);
        if (!addBtn) break;

        addBtn.click(); // click to add container
        currentCount++;

        await wait(delay); // wait for UI to render new container
    }

    /* -------------------- ➖ REMOVE -------------------- */
    while (currentCount > targetCount) {
        const deleteBtns = document.querySelectorAll(deleteButtonsSelector);
        if (!deleteBtns.length) break;

        // delete last container to avoid reindexing issues
        deleteBtns[deleteBtns.length - 1].click();
        currentCount--;

        await wait(delay);
    }
}

/* --------------------------------------------------------------------------
 * 🌀 Sync Containers (Container-Aware Version)
 * ------------------------------------------------------------------------ */
/* 
 * 🔧 DESCRIPTION:
 *   Adds or removes containers to match a target count using direct DOM queries
 *   with simple delays. Delete buttons are accessed **within each container**.
 *
 * 🧰 PARAMETERS:
 *   @param {number} currentCount
 *       → Current number of containers in the DOM
 *
 *   @param {number} targetCount
 *       → Desired number of containers to sync to
 *
 *   @param {string} containerSelector
 *       → CSS selector for all containers
 *
 *   @param {string} addButtonSelector
 *       → CSS selector for the Add button (single, outside containers)
 *
 *   @param {string} deleteButtonSelector
 *       → CSS selector for delete button **inside a container**
 *
 *   @param {number} [delay=300]
 *       → Delay in ms between clicks
 *
 * 💡 LOGIC:
 *   1️⃣ Add containers if currentCount < targetCount
 *   2️⃣ Remove containers from the end if currentCount > targetCount
 *      → delete buttons accessed per container
 *
 * =========================================================================================
 */
export async function syncContainersSmart({currentCount, targetCount, containerSelector, addButtonSelector, deleteButtonSelector, delay = 300}) {
    const wait = ms => new Promise(r => setTimeout(r, ms));

    /* -------------------- ➕ ADD -------------------- */
    while (currentCount < targetCount) {
        const addBtn = document.querySelector(addButtonSelector);
        if (!addBtn) break;

        addBtn.click(); // click to add container
        currentCount++;

        await wait(delay); // wait for UI to render new container
    }

    /* -------------------- ➖ REMOVE -------------------- */
    while (currentCount > targetCount) {
        const containers = document.querySelectorAll(containerSelector);
        if (!containers.length) break;

        // ⚠ Delete button is inside the last container
        const lastContainer = containers[containers.length - 1];
        const deleteBtn = lastContainer.querySelector(deleteButtonSelector);
        if (!deleteBtn) break;

        deleteBtn.click(); // click delete
        currentCount--;

        await wait(delay); // wait for UI to update
    }
}

/* --------------------------------------------------------------------------
 * 🧮 Search Container Index in which element exists
 * ------------------------------------------------------------------------ */
export function getContainerIndex({locator, containerSelector}) {
    if (!locator || !containerSelector) return null;
    const searchEl = locator instanceof HTMLElement ? locator : document.querySelector(locator);
    if (!searchEl) return null;
    const index = [...document.querySelectorAll(containerSelector)].findIndex(c => c.contains(searchEl));
    return index >= 0 ? index : null;
}

/* --------------------------------------------------------------------------
 * 🧮 Get Valid Database Index for given container.
 * ------------------------------------------------------------------------ */
export function getDatabaseIndex(containerIdx, failedDatabaseIndices) {
    const failedSet =
        failedDatabaseIndices instanceof Set
            ? failedDatabaseIndices
            : new Set(failedDatabaseIndices);

    let dbIdx = -1;

    while (containerIdx >= 0) {
        dbIdx++;
        if (!failedSet.has(dbIdx)) {
            containerIdx--;
        }
    }

    return dbIdx;
}


/* --------------------------------------------------------------------------
 * 🗑️ Remove Container (Simple Version)
 * ------------------------------------------------------------------------ */
/*
 * 🔧 DESCRIPTION:
 *   Removes a container by clicking a delete button selected directly
 *   from a flat NodeList. Suitable when delete buttons are globally accessible
 *   and indexed consistently.
 *
 * 🧰 PARAMETERS:
 *   @param {string} removeButtonSelector
 *       → CSS selector returning ALL delete buttons
 *
 *   @param {number} index
 *       → Index of the container/button to remove (0-based)
 *
 *   @param {number} [delay=300]
 *       → Delay in ms after clicking delete
 *
 * 💡 NOTES:
 *   • Assumes selector returns buttons in container order
 *   • Fast but brittle if DOM structure changes
 *
 * =========================================================================================
 */
export async function removeContainerSimple({removeButtonSelector, index, delay = 300}) {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const deleteBtns = document.querySelectorAll(removeButtonSelector);
    if (!deleteBtns.length || !deleteBtns[index]) return;
    deleteBtns[index].click(); // 🗑️ click delete button at index
    await wait(delay);
}

/* --------------------------------------------------------------------------
 * 🗑️ Remove Container (Smart / Container-Aware Version)
 * ------------------------------------------------------------------------ */
/*
 * 🔧 DESCRIPTION:
 *   Removes a container by index by first resolving the container itself,
 *   then locating the delete button *within* that container.
 *
 * 🧰 PARAMETERS:
 *   @param {string} containerSelector
 *       → CSS selector returning all containers
 *
 *   @param {string} removeButtonSelector
 *       → CSS selector for delete button INSIDE a container
 *
 *   @param {number} index
 *       → Index of the container to remove (0-based)
 *
 *   @param {number} [delay=300]
 *       → Delay in ms after clicking delete
 *
 * 💡 NOTES:
 *   • Correct even when containers have multiple buttons
 *   • Safe against flattened NodeList indexing bugs
 *   • Preferred for Workday / dynamic UIs
 *
 * =========================================================================================
 */
export async function removeContainerSmart({containerSelector, removeButtonSelector, index, delay = 300}) {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const containers = document.querySelectorAll(containerSelector);
    if (!containers.length || !containers[index]) return;
    const container = containers[index];
    const deleteBtn = container.querySelector(removeButtonSelector);
    if (!deleteBtn) return;
    deleteBtn.click(); // 🗑️ click delete inside container
    await wait(delay);
}


/* =========================================================================================
*  ⚖️ Question's answer/options/value normalizer (before execution)
* ========================================================================================= */

/* --------------------------------------------------------------------------
 * ✍🏻 normalizeInputValue(value, questionType)
 * ------------------------------------------------------------------------ */
export function normalizeInputValue(value, questionType = "input-field") {
    if (value === null || value === undefined) return null;

    // Strings → trim only
    if (typeof value === 'string') {
        const v = value.trim();
        return v.length ? v : null;
    }

    // Numbers → string
    if (typeof value === 'number') {
        if (Number.isNaN(value)) {
            throw new Error(`Invalid NaN value for ${questionType}`);
        }
        return String(value);
    }

    // Date → ISO (safe default for forms)
    if (value instanceof Date) {
        if (isNaN(value.getTime())) {
            throw new Error(`Invalid Date value for ${questionType}`);
        }
        return value.toISOString().split('T')[0];
    }

    // Array → flatten if meaningful
    if (Array.isArray(value)) {
        if (!value.length) return null;

        // Array<string | number>
        if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
            return value.map(v => String(v).trim()).filter(Boolean).join(' ');
        }

        throw new Error(
            `Array value for ${questionType} contains unsupported elements`
        );
    }

    // Everything else is invalid
    throw new Error(
        `Unsupported value type "${typeof value}" for ${questionType}`
    );
}

/* --------------------------------------------------------------------------
 * 🔘 normalizeRadioAnswers(value)
 * ------------------------------------------------------------------------ */
/* 
 * Converts arbitrary input into a meaningful Array<string> suitable for
 * fuzzy radio matching.
 *
 * Philosophy:
 * - Be permissive with intent
 * - Be strict with nonsense
 * - Never silently guess
 * ------------------------------------------------------------------------ */
export function normalizeRadioAnswers(value) {

    if (value === null || value === undefined) return null;

    const answers = [];

    /* --------------------------------------------------
     * 1️⃣ Primitive handling
     * -------------------------------------------------- */
    if (typeof value === 'string') {
        const v = value.trim();
        if (v) answers.push(v);
    }

    else if (typeof value === 'number') {
        if (Number.isNaN(value)) {
            throw new Error(`NaN is not a valid radio answer`);
        }
        answers.push(String(value));
    }

    else if (typeof value === 'boolean') {
        // Radios often encode yes/no semantics
        answers.push(value ? 'yes' : 'no');
    }

    else if (value instanceof Date) {
        if (isNaN(value.getTime())) {
            throw new Error(`Invalid Date for radio answer`);
        }
        answers.push(value.toISOString());
    }

    /* --------------------------------------------------
     * 2️⃣ Array handling
     * -------------------------------------------------- */
    else if (Array.isArray(value)) {
        for (const item of value) {
            if (item === null || item === undefined) continue;

            if (typeof item === 'string' || typeof item === 'number') {
                const v = String(item).trim();
                if (v) answers.push(v);
            }

            else if (typeof item === 'boolean') {
                answers.push(item ? 'yes' : 'no');
            }

            else {
                // Nested arrays or objects inside array → reject
                throw new Error(`Unsupported array element type "${typeof item}" for radio`);
            }
        }
    }

    /* --------------------------------------------------
     * 3️⃣ Object (dictionary / LLM output) handling
     * -------------------------------------------------- */
    else if (typeof value === 'object') {

        // Common LLM shapes
        const likelyKeys = ['label', 'value', 'name', 'text'];

        for (const key of likelyKeys) {
            if (typeof value[key] === 'string') {
                const v = value[key].trim();
                if (v) answers.push(v);
            }
        }

        // If nothing extracted, try object keys (enum-like)
        if (!answers.length) {
            const keys = Object.keys(value);
            if (keys.length) {
                answers.push(...keys.map(k => k.trim()).filter(Boolean));
            }
        }

        // Still nothing meaningful → reject
        if (!answers.length) {
            throw new Error(
                `Object does not contain meaningful radio candidates`
            );
        }
    }

    else {
        throw new Error(`Unsupported value type "${typeof value}" for radio question`);
    }

    /* --------------------------------------------------
     * 4️⃣ Final sanitation
     * -------------------------------------------------- */
    const unique = [...new Set(answers.map(a => a.trim()).filter(Boolean))];

    if (!unique.length) {
        throw new Error(`Radio answers resolved to empty set`);
    }

    return unique;
}

/* --------------------------------------------------------------------------
 * ✅ normalizeCheckboxAnswers(value)
 * ------------------------------------------------------------------------ */
export function normalizeCheckboxAnswers(value) {
    let normalizedValues;

    if (typeof value === 'boolean') {
        // Boolean mode: check/uncheck all
        normalizedValues = value;

    } else if (Array.isArray(value)) {
        // Array of candidate labels → trim & filter falsy
        normalizedValues = value
            .map(v => (v === null || v === undefined ? null : String(v).trim()))
            .filter(Boolean);

    } else if (typeof value === 'string' || typeof value === 'number') {
        // Single string or number → wrap in array
        const v = String(value).trim();
        normalizedValues = v.length ? [v] : [];

    } else if (typeof value === 'object' && value !== null) {
        // Dictionary / object → use keys as candidate labels
        normalizedValues = Object.keys(value)
            .map(k => String(k).trim())
            .filter(Boolean);

    } else {
        throw new Error(`Unsupported checkbox value type "${typeof value}" for checkbox question`);
    }

    // Fail fast if array ends up empty (only for semantic mode)
    if (Array.isArray(normalizedValues) && !normalizedValues.length) {
        throw new Error(`Normalized checkbox values are empty for checkbox question`);
    }

    return normalizedValues;
}

/* --------------------------------------------------------------------------
 * 👇 normalizeDropdownAnswers(value)
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * 🎛️ normalizeDropdownAnswers(value)
 * --------------------------------------------------------------------------
 * Converts arbitrary input into a meaningful Array<string> suitable for
 * fuzzy dropdown option matching.
 *
 * Principles:
 * - Preserve intent
 * - Expand synonyms when possible
 * - Never guess silently
 * - Fail fast on nonsense
 * ------------------------------------------------------------------------ */
export function normalizeDropdownAnswers(value) {

    if (value === null || value === undefined) return null;

    const answers = [];

    /* --------------------------------------------------
     * 1️⃣ Primitive handling
     * -------------------------------------------------- */
    if (typeof value === 'string') {
        const v = value.trim();
        if (v) answers.push(v);
    }

    else if (typeof value === 'number') {
        if (Number.isNaN(value)) {
            throw new Error('NaN is not a valid dropdown value');
        }
        answers.push(String(value));
    }

    else if (typeof value === 'boolean') {
        answers.push(value ? 'yes' : 'no');
    }

    else if (value instanceof Date) {
        if (isNaN(value.getTime())) {
            throw new Error('Invalid Date for dropdown');
        }
        answers.push(value.toISOString());
        answers.push(value.toLocaleDateString());
    }

    /* --------------------------------------------------
     * 2️⃣ Array handling
     * -------------------------------------------------- */
    else if (Array.isArray(value)) {
        for (const item of value) {
            if (item === null || item === undefined) continue;

            if (
                typeof item === 'string' ||
                typeof item === 'number' ||
                typeof item === 'boolean'
            ) {
                const v = String(item).trim();
                if (v) answers.push(v);
            } else {
                throw new Error(
                    `Unsupported array element type "${typeof item}" for dropdown`
                );
            }
        }
    }

    /* --------------------------------------------------
     * 3️⃣ Object handling (LLM / enum / structured output)
     * -------------------------------------------------- */
    else if (typeof value === 'object') {

        // Common LLM & structured answer fields
        const likelyFields = [
            'label',
            'value',
            'text',
            'name',
            'display',
            'title'
        ];

        for (const key of likelyFields) {
            if (typeof value[key] === 'string') {
                const v = value[key].trim();
                if (v) answers.push(v);
            }
            if (typeof value[key] === 'number') {
                answers.push(String(value[key]));
            }
        }

        // Enum-like objects → use both keys & values
        for (const [k, v] of Object.entries(value)) {
            if (typeof k === 'string') answers.push(k.trim());
            if (typeof v === 'string' || typeof v === 'number') {
                answers.push(String(v).trim());
            }
        }

        if (!answers.length) {
            throw new Error(
                'Object does not contain meaningful dropdown candidates'
            );
        }
    }

    else {
        throw new Error(
            `Unsupported value type "${typeof value}" for dropdown`
        );
    }

    /* --------------------------------------------------
     * 4️⃣ Final sanitation & deduplication
     * -------------------------------------------------- */
    const unique = [...new Set(
        answers
            .map(a => a.trim())
            .filter(Boolean)
    )];

    if (!unique.length) {
        throw new Error('Dropdown answers resolved to empty set');
    }

    return unique;
}

/* --------------------------------------------------------------------------
 * 🎛️ normalizeMultiselectValues(value)
 * ------------------------------------------------------------------------ */
/* 
 * Converts arbitrary input into a meaningful Array<string> suitable for
 * multiselect chip creation.
 *
 * ✅ Features:
 *   - Supports primitives, arrays (nested), objects (deep), Dates, booleans
 *   - Preserves order, deduplicates, trims whitespace
 *   - Allows partial success when some elements are invalid
 *   - Rejects entirely unprocessable inputs early
 *   - Future-proof for LLM / structured JSON payloads
 * ------------------------------------------------------------------------ */
export function normalizeMultiselectValues(value) {
    if (value === null || value === undefined) return null;

    const results = [];
    const seen = new Set();

    /* ----------------------------------------------------------------------
     * Helper: push a string value to results after trimming & dedupe
     * ---------------------------------------------------------------------- */
    function pushValue(v) {
        if (v === null || v === undefined) return;
        const str = String(v).replace(/\s+/g, ' ').trim();
        if (str && !seen.has(str)) {
            results.push(str);
            seen.add(str);
        }
    }

    /* ----------------------------------------------------------------------
     * Recursive handler for arrays and objects
     * ---------------------------------------------------------------------- */
    function process(value) {
        if (value === null || value === undefined) return;

        /* --------------------------- Primitives --------------------------- */
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            // Boolean convention: 'yes' / 'no'
            if (typeof value === 'boolean') pushValue(value ? 'yes' : 'no');
            else if (!Number.isNaN(value)) pushValue(value);
            else throw new Error('NaN is not a valid multiselect value');
            return;
        }

        /* ----------------------------- Date ------------------------------ */
        if (value instanceof Date) {
            if (isNaN(value.getTime())) throw new Error('Invalid Date for multiselect');
            pushValue(value.toISOString());
            pushValue(value.toLocaleDateString());
            return;
        }

        /* ----------------------------- Array ----------------------------- */
        if (Array.isArray(value)) {
            for (const item of value) process(item);
            return;
        }

        /* ----------------------------- Object ---------------------------- */
        if (typeof value === 'object') {
            // First, handle LLM-style array fields
            const arrayFields = ['labels', 'values', 'items', 'options', 'skills', 'tags'];
            for (const key of arrayFields) {
                if (Array.isArray(value[key])) {
                    process(value[key]);
                }
            }

            // Scalar fields fallback
            const scalarFields = ['label', 'value', 'text', 'name', 'title'];
            for (const key of scalarFields) {
                if (typeof value[key] === 'string') pushValue(value[key]);
            }

            // Enum-like objects: keys and primitive values
            for (const [k, v] of Object.entries(value)) {
                pushValue(k);
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) {
                    process(v);
                }
            }

            return;
        }

        throw new Error(`Unsupported value type "${typeof value}" for multiselect`);
    }

    process(value);

    if (!results.length) throw new Error('Multiselect values resolved to empty set');

    return results;
}


/* --------------------------------------------------------------------------
 * 🎛️ normalizeMultiselectValues(value)
 * ------------------------------------------------------------------------ */
export async function resolveResume(primaryResume, jobDetails, {ignoreLLM = false, timeoutSeconds = null} = {}) {
    let resumePath;
    // Request server via background.js
    if (!ignoreLLM) {
        const jobLocations = jobDetails?.locations;
        const jobDescription = jobDetails?.title 
            ? `Job Role: ${jobDetails?.title}\n\n${jobDetails?.description}` 
            : jobDetails?.description;
        // Request server via background.js
        resumePath = await getBestResume(jobLocations, jobDescription, timeoutSeconds);
    }
    // Fallback to primary address
    if (resumePath == null){ 
        if ('resumeStoredPath' in primaryResume) resumePath = primaryResume['resumeStoredPath'];
    }
    // Return if valid
    if (resumePath != null) {
        const uploadsRootPath = 'web/uploads/';
        return uploadsRootPath + resumePath;
    }
    return null;
}


/* =========================================================================================
* 🟰 Similarity Helpers Logic
* ========================================================================================= */

/* --------------------------------------------------------------------------
 * 👣 levenshtein(a, b)
 * ------------------------------------------------------------------------ */
const levenshtein = (a, b) => {
	const dp = Array.from({ length: a.length + 1 }, (_, i) =>
		Array(b.length + 1).fill(i)
	);
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1,
				dp[i][j - 1] + 1,
				dp[i - 1][j - 1] + cost
			);
		}
	}
	return dp[a.length][b.length];
};

/* --------------------------------------------------------------------------
 * 🏆 rankStrings(answer, options)
 * ------------------------------------------------------------------------ */
/* 
 * 🧾 DESCRIPTION:
 *   Computes similarity ranking between a provided answer 
 *   string and a list of text options using normalized 
 *   Levenshtein distance. The higher the similarity %, 
 *   the closer the match.
 *
 * 🧩 PARAMETERS:
 *   @param {string} answer  
 *       → The user-provided input or expected text.
 *
 *   @param {string[]} options  
 *       → Array of text options to compare against.
 *         Example: ["Yes", "No", "Maybe"]
 *
 * 💎 RETURNS:
 *   @return {Array<{text: string, score: number}>}
 *       → Ranked array of options sorted by descending score.
 *         Example:
 *         [
 *           { text: "Yes", score: 92.3 },
 *           { text: "Maybe", score: 55.2 },
 *           { text: "No", score: 23.7 }
 *         ]
 * --------------------------------------------------------- */
export function rankStrings(answer, options) {

	// // 🧮 Internal Levenshtein distance calculator
	// function levenshtein(a, b) {
	// 	const matrix = Array.from({
	// 			length: a.length + 1
	// 		}, (_, i) =>
	// 		Array(b.length + 1).fill(i)
	// 	);
	// 	for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

	// 	for (let i = 1; i <= a.length; i++) {
	// 		for (let j = 1; j <= b.length; j++) {
	// 			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
	// 			matrix[i][j] = Math.min(
	// 				matrix[i - 1][j] + 1, // deletion
	// 				matrix[i][j - 1] + 1, // insertion
	// 				matrix[i - 1][j - 1] + cost // substitution
	// 			);
	// 		}
	// 	}
	// 	return matrix[a.length][b.length];
	// }

	// 🚧 Validate input type
	if (typeof answer !== 'string') {
		console.warn('⚠️ rankStrings(): Expected string input for "answer".');
		return [];
	}

	// 🧩 Calculate and rank all similarities
	const ranked = options.map(opt => {
		const dist = levenshtein(answer.trim().toLowerCase(), opt.trim().toLowerCase());
		const maxLen = Math.max(answer.length, opt.length);
		const similarity = ((maxLen - dist) / maxLen) * 100; // % similarity
		return {
			text: opt,
			score: similarity
		};
	});

	// 🔝 Sort descending by similarity score
	return ranked.sort((a, b) => b.score - a.score);
}

/* --------------------------------------------------------------------------
 * 🎯 applyThreshold(ranked, threshold)
 * ------------------------------------------------------------------------ */
/* 
 * 🧾 DESCRIPTION:
 *   Filters ranked string similarity results and returns 
 *   only the best match if it exceeds a given similarity 
 *   threshold percentage.
 *
 * 🧩 PARAMETERS:
 *   @param {Array<{text: string, score: number}>} ranked  
 *       → Ranked array returned by `rankStrings()`.
 *         Must contain text-score pairs sorted by score.
 *
 *   @param {number} [threshold=80]  
 *       → Minimum score percentage required to accept a match.
 *         Default: 80%
 *
 * 💎 RETURNS:
 *   @return {{text: string, score: number} | null}
 *       → Returns the best match object if above threshold,
 *         otherwise `null` when no adequate match found.
 * --------------------------------------------------------- */
export function applyThreshold(ranked, threshold = 80) {
	if (!ranked.length) return null;
	const best = ranked[0];
	return best.score >= threshold ? best : null;
}

/* --------------------------------------------------------------------------
 * 🧠 canonicalize(str)
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * 🧠 SMART STRING SIMILARITY ENGINE
 * --------------------------------------------------------------------------
 * 🧾 DESCRIPTION:
 *   Provides a deterministic, automation-safe string similarity engine
 *   designed for robust matching between user-provided answers and
 *   visible UI labels in dynamic web forms.
 *
 *   The engine combines multiple low-risk similarity signals:
 *     • Canonical string normalization
 *     • Edit-distance (Levenshtein) similarity
 *     • Token-set overlap scoring
 *     • Length-ratio penalty to prevent false positives
 *
 *   This approach prioritizes label equivalence and UI correctness
 *   over semantic interpretation, making it safe for automated
 *   selection and clicking workflows.
 *
 *   These helpers power text-to-label resolution logic in:
 *     • dropdownSelect
 *     • radioSelect
 *     • checkboxSelect
 *     • other UI automation utilities
 *
 * --------------------------------------------------------------------------
 * 🔍 levenshtein(a, b)
 * --------------------------------------------------------------------------
 *   Computes the Levenshtein edit distance between two normalized strings
 *   using dynamic programming.
 *
 *   Edit distance represents the minimum number of:
 *     • insertions
 *     • deletions
 *     • substitutions
 *   required to transform string `a` into string `b`.
 *
 * --------------------------------------------------------------------------
 * 🔍 similarity(a, b)
 * --------------------------------------------------------------------------
 *   Computes a weighted similarity score (0–100) using a hybrid strategy:
 *
 *     • Edit-distance similarity (character-level precision)
 *     • Token-set similarity (order-independent matching)
 *     • Length-ratio penalty (guards against deceptive matches)
 *
 *   The resulting score is deterministic, explainable, and stable
 *   across UI variations such as casing, punctuation, spacing,
 *   accents, and minor label formatting differences.
 *
 * --------------------------------------------------------------------------
 * 🔧 FEATURES
 * --------------------------------------------------------------------------
 *   ✅ Canonical normalization (case, accents, punctuation, whitespace)
 *   ✅ Order-independent token matching
 *   ✅ Resistant to UI noise and formatting variance
 *   ✅ Prevents unsafe semantic over-matching
 *   ✅ Deterministic, side-effect free, and debuggable
 *   ✅ Safe for automated UI interaction and form submission
 *   ✅ No external dependencies
 *
 * --------------------------------------------------------------------------
 * 🧩 PARAMETERS
 * --------------------------------------------------------------------------
 * @param {string} a
 *   → First string to compare (e.g., user input or expected label).
 *
 * @param {string} b
 *   → Second string to compare (e.g., visible UI option text).
 *
 * --------------------------------------------------------------------------
 * 💎 RETURNS
 * --------------------------------------------------------------------------
 * levenshtein(a, b)
 *   @returns {number}
 *     → Edit distance between the two strings.
 *
 * similarity(a, b)
 *   @returns {number}
 *     → Similarity score in the range 0–100, where:
 *        • 100 → canonical label equivalence
 *        • 0   → no meaningful overlap
 *
 * --------------------------------------------------------------------------
 * 📝 NOTES
 * --------------------------------------------------------------------------
 * • Designed for UI automation, not semantic inference
 * • Avoids embeddings and probabilistic models by design
 * • Short strings are intentionally penalized when ambiguous
 * • Optimized for small-to-medium option sets common in forms
 * -------------------------------------------------------------------------- */
function canonicalize(str) {
	if (typeof str !== 'string') return '';

	return str
		.toLowerCase()

		// Normalize unicode (résumé → resume)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')

		// Normalize separators
		.replace(/[_\-\/]/g, ' ')

		// Normalize possessives
		.replace(/'s\b/g, 's')

		// Remove non-alphanumerics
		.replace(/[^a-z0-9\s]/g, '')

		// Normalize whitespace
		.replace(/\s+/g, ' ')
		.trim();
}

/* ---------------------------------------------------------
 * 🧑‍🤝‍🧑 similarity(a, b)
 * --------------------------------------------------------- */
export const similarity = (a, b) => {
	if (typeof a !== 'string' || typeof b !== 'string') return 0;

	const ca = canonicalize(a);
	const cb = canonicalize(b);
	if (!ca || !cb) return 0;

	// 1️⃣ Edit-distance similarity (your existing strength)
	const dist = levenshtein(ca, cb);
	const maxLen = Math.max(ca.length, cb.length);
	const levScore = maxLen ? ((maxLen - dist) / maxLen) * 100 : 0;

	// 2️⃣ Token overlap (order-insensitive)
	function tokenSimilarity(a, b) {

		const tokenSet = s => new Set(canonicalize(s).split(/\s+/).filter(Boolean));

		const A = tokenSet(a);
		const B = tokenSet(b);

		if (!A.size || !B.size) return 0;

		let intersection = 0;
		for (const t of A)
			if (B.has(t)) intersection++;

		const union = new Set([...A, ...B]).size;
		return (intersection / union) * 100;
	}

	const tokenScore = tokenSimilarity(a, b);

	// 3️⃣ Length penalty (prevents C ↔ C++ Developer)
	const lengthRatio = Math.min(ca.length, cb.length) / Math.max(ca.length, cb.length);

	// 🎯 Final weighted score (deterministic)
	return (
		levScore * 0.5 +
		tokenScore * 0.4 +
		lengthRatio * 100 * 0.1
	);
};



/* =========================================================================================
* 🎨 Commit Dispatch 
* ========================================================================================= */
export function commitElement(el) {
    if (!(el instanceof HTMLElement)) return;
    if (!el.isConnected) return;

    el.dispatchEvent(new FocusEvent("focusout", {
        bubbles: true,
        composed: true,
        relatedTarget: document.body
    }));

    try { el.blur(); } catch {}
}

/**
 * Auto-commit filled fields when Workday mutates the DOM
 *
 * @param {Object} options
 * @param {string|string[]} options.selectors
 * @param {number} [options.debounceMs=150]
 * @param {(el: HTMLElement) => boolean} [options.filter]
 */
export function setupAutoCommitOnMutation({ selectors, debounceMs = 150, filter }) {
    const selectorList = Array.isArray(selectors)
        ? selectors
        : [selectors];

    let debounceTimer = null;
    let observer = null;

    const getCandidates = () =>
        selectorList.flatMap(sel =>
            Array.from(document.querySelectorAll(sel))
        );

    const shouldCommit = el => {
        if (!(el instanceof HTMLElement)) return false;

        if (filter && !filter(el)) return false;

        if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement
        ) {
            return el.value && el.value.trim() !== "";
        }

        return false;
    };

    const commitAll = () => {
        const els = getCandidates();
        for (const el of els) {
            if (shouldCommit(el)) {
                commitElement(el);
            }
        }
    };

    observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(commitAll, debounceMs);
    });

    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true
    });

    return {
        disconnect() {
            observer?.disconnect();
            observer = null;
        },
        flush() {
            commitAll();
        }
    };
}

const __commitLock = {
    busy: false,
    queue: []
};

async function withCommitLock(fn) {
    if (__commitLock.busy) {
        await new Promise(r => __commitLock.queue.push(r));
    }
    __commitLock.busy = true;
    try {
        return await fn();
    } finally {
        __commitLock.busy = false;
        __commitLock.queue.shift()?.();
    }
}

export async function forceCommitAllListbox({ maxCycles = 12, delayMs = 30 } = {}) {

    function getOpenListboxes() {
        return [...document.querySelectorAll('[role="listbox"]')];
    }

    function getActiveOption(listbox) {
        const activeId = listbox.getAttribute('aria-activedescendant');
        if (activeId) return document.getElementById(activeId);

        return listbox.querySelector('[aria-selected="true"]')
            || listbox.querySelector('[role="option"]');
    }

    function sendTab(el) {
        el.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Tab',
            code: 'Tab',
            bubbles: true
        }));
    }


    const sleep = ms => new Promise(r => setTimeout(r, ms));

    return withCommitLock(async () => {

        for (let cycle = 0; cycle < maxCycles; cycle++) {

            let progressed = false;

            /* -------------------------------------------
             * 1️⃣ HARD CLOSE ALL OPEN DROPDOWNS
             * ----------------------------------------- */
            const listboxes = getOpenListboxes();

            for (const listbox of listboxes) {

                const option = getActiveOption(listbox);
                if (!option) continue;

                // This is CRITICAL
                option.focus({ preventScroll: true });

                sendTab(option);
                progressed = true;

                await sleep(delayMs);
            }

            /* -------------------------------------------
             * 2️⃣ COMMIT TEXT INPUTS VIA FOCUS CHAIN
             * ----------------------------------------- */
            const inputs = document.querySelectorAll(
                'input, textarea, [contenteditable="true"]'
            );

            for (const el of inputs) {
                if (!(el instanceof HTMLElement)) continue;
                if (el.disabled) continue;

                const val =
                    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
                        ? el.value
                        : el.textContent;

                if (!val || !val.trim()) continue;

                el.focus({ preventScroll: true });
                sendTab(el);
                progressed = true;

                await sleep(delayMs);
            }

            /* -------------------------------------------
             * 3️⃣ STOP WHEN UI IS STABLE
             * ----------------------------------------- */
            if (!progressed && getOpenListboxes().length === 0) {
                break;
            }

            await sleep(delayMs);
        }
    });
}

function normalizeTargets(targets) {
    if (!targets) return [];
    if (targets instanceof HTMLElement) return [targets];
    if (typeof targets === 'string')
        return [...document.querySelectorAll(targets)];
    if (Array.isArray(targets))
        return targets.flatMap(t => normalizeTargets(t));
    return [];
}

function listboxBelongsToTarget(listbox, targets) {

    const active = document.activeElement;

    // Active element inside target
    if (active && targets.some(t => t.contains(active))) return true;

    // aria-controls linkage
    for (const t of targets) {
        const ctrl = t.getAttribute?.('aria-controls');
        if (ctrl && ctrl === listbox.id) return true;
    }

    return false;
}

/**
 * 🔹 Robust, flicker-safe commit for specific elements
 * 
 * @param {HTMLElement|string|Array} targets
 *   Single element, CSS selector, or array of elements/selectors
 * @param {Object} options
 * @param {number} options.maxCycles = 3
 *   Maximum commit passes
 * @param {number} options.delayMs = 15
 *   Delay between commits to allow UI updates
 */
export async function forceCommitFieldsFor(targets, { maxCycles = 3, delayMs = 15 } = {}) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Normalize targets to HTMLElements
    function normalizeTargets(targets) {
        if (!targets) return [];
        if (targets instanceof HTMLElement) return [targets];
        if (typeof targets === 'string') return [...document.querySelectorAll(targets)];
        if (Array.isArray(targets)) return targets.flatMap(t => normalizeTargets(t));
        return [];
    }

    const scope = normalizeTargets(targets);
    if (!scope.length) return;

    // Commit lock to avoid parallel focus clashes
    const __commitLock = globalThis.__forceCommitLock ||= { busy: false, queue: [] };
    async function withCommitLock(fn) {
        if (__commitLock.busy) {
            await new Promise(r => __commitLock.queue.push(r));
        }
        __commitLock.busy = true;
        try { return await fn(); } 
        finally { 
            __commitLock.busy = false;
            const next = __commitLock.queue.shift();
            if (next) next();
        }
    }

    // Get open listboxes in document
    function getOpenListboxes() {
        return [...document.querySelectorAll('[role="listbox"]')];
    }

    // Check if a listbox belongs to the scoped targets
    function listboxBelongsToTarget(listbox, targets) {
        const active = document.activeElement;
        if (active && targets.some(t => t.contains(active))) return true;
        for (const t of targets) {
            const ctrl = t.getAttribute?.('aria-controls');
            if (ctrl && ctrl === listbox.id) return true;
        }
        return false;
    }

    // Get active option inside a listbox
    function getActiveOption(listbox) {
        const id = listbox.getAttribute('aria-activedescendant');
        if (id) return document.getElementById(id);
        return listbox.querySelector('[aria-selected="true"]') || listbox.querySelector('[role="option"]');
    }

    // Send a Tab key to an element
    function sendTab(el) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    }

    // Escape focus once at the end
    function escapeFocus() {
        document.body.focus?.();
        document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    }

    return withCommitLock(async () => {
        const committed = new WeakSet();

        for (let cycle = 0; cycle < maxCycles; cycle++) {
            let progressed = false;

            // 1️⃣ Commit DROPDOWNS
            const listboxes = getOpenListboxes().filter(lb => listboxBelongsToTarget(lb, scope));
            for (const lb of listboxes) {
                const opt = getActiveOption(lb);
                if (!opt || committed.has(opt)) continue;

                // Only act if dropdown owns active focus
                if (!lb.contains(document.activeElement)) continue;

                opt.focus({ preventScroll: true });
                sendTab(opt);
                committed.add(opt);
                progressed = true;
                await sleep(delayMs);
            }

            // 2️⃣ Commit TEXT INPUTS / TEXTAREAS / CONTENTEDITABLE
            for (const root of scope) {
                const inputs = root.querySelectorAll('input, textarea, [contenteditable="true"]');
                for (const el of inputs) {
                    if (el.disabled || committed.has(el)) continue;
                    const val = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent;
                    if (!val || !val.trim()) continue;

                    el.focus({ preventScroll: true });
                    sendTab(el);
                    committed.add(el);
                    progressed = true;
                    await sleep(delayMs);
                }
            }

            // 3️⃣ Commit CHECKBOXES / RADIOS
            for (const root of scope) {
                const toggles = root.querySelectorAll('input[type="checkbox"], input[type="radio"]');
                for (const el of toggles) {
                    if (el.disabled || committed.has(el)) continue;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    committed.add(el);
                    progressed = true;
                    await sleep(delayMs);
                }
            }

            // Stop early if nothing changed
            if (!progressed && getOpenListboxes().length === 0) break;
        }

        // Final escape focus to stabilize UI
        escapeFocus();
        await sleep(delayMs);
    });
}

/**
 * 🧠 Selector-driven, non-invasive commit for controlled ATS forms
 *
 * - Commits ONLY elements matched by selectors
 * - Type-aware exit behavior
 * - No global clicks
 * - No input/change spam
 * - Checkbox-safe (exclude them unless you REALLY mean it)
 *
 * @param {Object} options
 * @param {string|string[]} options.selectors
 * @param {(el: HTMLElement) => boolean} [options.filter]
 * @param {boolean} [options.onlyIfHasValue=true]
 * @param {number} [options.delayMs=50]
 */
export async function forceCommitFields({
    selectors,
    filter,
    onlyIfHasValue = true,
    delayMs = 50
} = {}) {
    if (!selectors) return;

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    const elements = selectorList.flatMap(sel =>
        Array.from(document.querySelectorAll(sel))
    );

    const committed = new WeakSet();

    const isVisible = el =>
        el.offsetParent !== null &&
        getComputedStyle(el).visibility !== "hidden";

    const hasValue = el => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
            return el.value && el.value.trim() !== "";
        if (el.isContentEditable)
            return el.textContent && el.textContent.trim() !== "";
        return false;
    };

    const isListboxTrigger = el =>
        el.getAttribute("aria-haspopup") === "listbox";

    const getOpenListboxes = () =>
        [...document.querySelectorAll('[role="listbox"]')];

    const getActiveOption = listbox => {
        const id = listbox.getAttribute("aria-activedescendant");
        if (id) return document.getElementById(id);
        return (
            listbox.querySelector('[aria-selected="true"]') ||
            listbox.querySelector('[role="option"]')
        );
    };

    for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        if (committed.has(el)) continue;
        if (filter && !filter(el)) continue;
        if (el.disabled || !isVisible(el)) continue;

        /* --------------------------------------------
         * VALUE GUARD (textual only)
         * ------------------------------------------ */
        if (onlyIfHasValue) {
            if (
                (el instanceof HTMLInputElement ||
                    el instanceof HTMLTextAreaElement ||
                    el.isContentEditable) &&
                !hasValue(el)
            ) continue;
        }

        /* --------------------------------------------
         * 1️⃣ LISTBOX TRIGGERS (buttons, comboboxes)
         * ------------------------------------------ */
        if (isListboxTrigger(el)) {
            const openListbox = getOpenListboxes().find(lb =>
                lb.contains(document.activeElement)
            );

            if (openListbox) {
                const opt = getActiveOption(openListbox);
                if (opt) {
                    opt.focus({ preventScroll: true });
                    opt.dispatchEvent(
                        new KeyboardEvent("keydown", {
                            key: "Tab",
                            code: "Tab",
                            bubbles: true
                        })
                    );
                    committed.add(el);
                    await sleep(delayMs);
                }
            }
            continue;
        }

        /* --------------------------------------------
         * 2️⃣ TEXT / NUMBER / MASKED / CONTENTEDITABLE
         * ------------------------------------------ */
        if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el.isContentEditable
        ) {
            // IMPORTANT: do NOT focus if not already focused
            el.dispatchEvent(
                new FocusEvent("focusout", {
                    bubbles: true,
                    composed: true,
                    relatedTarget: document.body
                })
            );

            try { el.blur(); } catch {}
            committed.add(el);
            await sleep(delayMs);
            continue;
        }

        /* --------------------------------------------
         * 3️⃣ CHECKBOX / RADIO — DO NOTHING BY DEFAULT
         * ------------------------------------------ */
        // Explicitly ignored to avoid visibility recomputation
    }

    /* --------------------------------------------
     * FINAL: gently release any remaining focus
     * ------------------------------------------ */
    try { document.activeElement?.blur(); } catch {}
    if (delayMs > 0) await sleep(delayMs);
}

