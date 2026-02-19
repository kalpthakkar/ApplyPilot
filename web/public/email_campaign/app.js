// ./public/app.js


// 🔹 Convert Form to JSON
function formToJSON(formElement) {
    const formData = new FormData(formElement);
    const json = {};
    const processedKeys = new Set();

    /* ---------------------------------- */
    /* Helpers                            */
    /* ---------------------------------- */

    const getChips = (container, name) => {
        if (!container) return [];
        return Array.from(
            container
                .querySelector(`[name='${name}']`)
                ?.closest(".multiselect-wrapper")
                ?.querySelectorAll(".chips-container .chip") || []
        ).map(chip => chip.dataset.value);
    };

    const getRadioValue = (form, name) => {
        const checked = form.querySelector(`input[type="radio"][name="${name}"]:checked`);
        return checked ? checked.value : null;
    };

    const getCheckboxValue = (form, name) => {
        const boxes = form.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
        if (!boxes.length) return null;

        // Single checkbox → boolean
        if (boxes.length === 1) {
            return boxes[0].checked;
        }

        // Multiple checkboxes → array
        return Array.from(boxes)
            .filter(b => b.checked)
            .map(b => b.value);
    };

    const cleanLinkedInUrl = (url) => {
        if (!url || !url.trim()) return null;

        const activityMatch = url.match(/activity-(\d+)/);
        if (activityMatch) {
            return `https://www.linkedin.com/feed/update/urn:li:activity:${activityMatch[1]}`;
        }

        const urnMatch = url.match(/urn:li:activity:(\d+)/);
        if (urnMatch) {
            return `https://www.linkedin.com/feed/update/urn:li:activity:${urnMatch[1]}`;
        }

        return url.trim();
    };

    /* ---------------------------------- */
    /* Standard Fields                    */
    /* ---------------------------------- */

    for (const [key] of formData.entries()) {

        const cleanKey = key.endsWith('[]') ? key.slice(0, -2) : key;
        if (processedKeys.has(cleanKey)) continue;
        processedKeys.add(cleanKey);

        const input =
            formElement.querySelector(`[name="${key}"]`) ??
            formElement.querySelector(`[name="${cleanKey}"]`);

        if (!input) continue;

        let value;

        if (input.type === 'radio') {
            value = getRadioValue(formElement, cleanKey);
        }
        else if (input.type === 'checkbox') {
            value = getCheckboxValue(formElement, cleanKey);
        }
        else if (key.endsWith('[]')) {
            value = formData.getAll(key);
        }
        else {
            value = formData.get(key);
        }

        json[cleanKey] = value;
    }

    /* ---------------------------------- */
    /* Normalize Missing Checkboxes       */
    /* ---------------------------------- */

    const allCheckboxes = formElement.querySelectorAll('input[type="checkbox"]');
    const checkboxGroups = {};

    allCheckboxes.forEach(cb => {
        const name = cb.name?.replace(/\[\]$/, '');
        if (!name) return;

        if (!checkboxGroups[name]) {
            checkboxGroups[name] = [];
        }
        checkboxGroups[name].push(cb);
    });

    for (const [name, boxes] of Object.entries(checkboxGroups)) {
        if (processedKeys.has(name)) continue;

        json[name] = boxes.length === 1 ? false : [];
    }

    /* ---------------------------------- */
    /* Custom Fields                      */
    /* ---------------------------------- */

    json.zone = getChips(document.querySelector("#zone"), "zone[]")[0] || null;
    json.additionalLeadIdentifiers = getChips(
        document.querySelector("#additionalLeadIdentifiersContainer"),
        "additionalLeadIdentifiers[]"
    );
    json.representativeTitles = getChips(
        document.querySelector("#representativeTitlesContainer"),
        "representativeTitles[]"
    );

    json.followupsPaddingDays =
        json.followupsPaddingMode === "custom"
            ? document.querySelector("#followupsPaddingDays .thumb")?.dataset?.tooltip ?? null
            : "auto";

    json.startTime = document.getElementById("startTime")?.value ?? null;
    json.endTime = document.getElementById("endTime")?.value ?? null;

    /* ---------------------------------- */
    /* LinkedIn URL (Always Normalized)   */
    /* ---------------------------------- */

    const linkedinInput = formElement.querySelector('[name="linkedinPostURL"]');
    json.linkedinPostURL = cleanLinkedInUrl(linkedinInput?.value);

    return json;
}


// 🔹 Fetch User Data
async function preInitializeFormFields() {
    try {
        // ✅ Only delegate population to script.js
        if (window.populateData) {
            window.populateData();
        } else {
            console.warn("populateData not available yet");
        }
    } catch (err) {
        console.error("⚠️ Error loading data:", err);
    }
}

// 🔹 Save User Data To Database
/**
 * 🔹 Save User Data To Database
 * This function is primarily responsible for handling form data submission, ensuring that only valid data is sent to the server, and managing any associated files.
 * 
 * @param {Event} e - The submit event triggered when the user submits the form.
 */
async function saveUserData(e) {
	
    e.preventDefault();

    // ----- Save User Data To Database 🔹 Get Form Data (in JSON) -> Perform filtering while maintaining counter -> Wrap updated JSON into FormData (Object) -> attach all relevant files with index impled attribute (for tracking) to the formData -> Pass 'JSON' and 'counter for synchronicity' to the server -----

    // ----- Convert Form to JSON
    const json = formToJSON(e.target); // Get the full form data as JSON

    console.log(json);

    // ----- Convert to FormData -----
    const formData = new FormData();
    formData.append("data", JSON.stringify(json)); // Add refined JSON data to FormData

	// ----- Save User Data To Database 🔹 Send Data To Server -----
	let result;
    try {
		// Update UI After Submitting the Form
		window.updateUIAfterSubmit({success: true});
    } catch (err) {
        console.error("⚠️ Error saving data:", err);
        alert("Failed to save data.");
    }
}

// 🔹 Initialize
document.addEventListener("DOMContentLoaded", () => {
    preInitializeFormFields();
    const form = document.querySelector("form");
    if (form) form.addEventListener("submit", saveUserData);
});