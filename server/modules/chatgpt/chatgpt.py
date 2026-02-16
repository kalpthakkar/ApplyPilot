from modules.browser.browser_utils import BrowserUtils
from typing import List, Union, Optional, TypedDict, Literal, Any, Tuple
from pydantic import BaseModel, Field, field_validator
import json
import re
import pyperclip
import os
from urllib.parse import urlparse
import time
from config.env_config import SERVER_ROOT
from modules.utils.helpers import dynamic_polling, safe_load_json, generate_random_string, parse_literal

CHATGPT_URL = "https://chatgpt.com"
TEXTAREA_SELECTOR = "#prompt-textarea > p"
SUBMIT_BTN_SELECTOR = '[data-testid="send-button"]'
COPY_BTN_SELECTOR = '[data-testid="copy-turn-action-button"]'
ASSISTANT_RESPONSE_EL_SELECTOR = '[data-message-author-role="assistant"]'

CHAR_NORMALIZATION_TABLE  = str.maketrans({
    '—': '-',
    '–': '-',
    '’': "'",
    '“': '"',
    '”': '"'
})


# ------------------------
# Pydantic model for dict entries
# ------------------------
class PromptEntry(BaseModel):
    prompt: str
    timeout: Optional[int|float] = None
    copy_: bool = Field(default=False, alias="copy")
    response_type: Literal['text', 'html'] = 'text'
    fit_font_size: bool = False
    remove_unicode_punctuation: bool = False

    model_config = {"populate_by_name": True}

    def to_js(self):
        return {
            "text": self.prompt,
            "timeout": self.timeout,
            "copy": self.copy_,
            "response_type": self.response_type,
            "fit_font_size": self.fit_font_size,
            "remove_unicode_punctuation": self.remove_unicode_punctuation
        }
    
    def normalize_unicode_punctuation(self):
        if self.remove_unicode_punctuation:
            self.prompt = self.prompt.translate(CHAR_NORMALIZATION_TABLE)


# ------------------------
# Pydantic parser model
# ------------------------
class PromptList(BaseModel):
    prompts: List[Union[str, PromptEntry]]

    @field_validator("prompts", mode="before")
    def normalize(cls, v):
        if not isinstance(v, list):
            raise ValueError("prompts must be a list")

        normalized = []
        for item in v:
            if isinstance(item, str):
                normalized.append(item)

            elif isinstance(item, dict):
                normalized.append(PromptEntry(**item))

            else:
                raise TypeError(f"Invalid prompt type: {type(item)}")
            
        # Normalize the punctuation if requested
        for entry in normalized:
            entry.normalize_unicode_punctuation()

        return normalized


# ------------------------
# TypedDict for type hints (user inputs)
# ------------------------
class PromptDict(TypedDict, total=False):
    prompt: str
    timeout: Optional[float]
    copy: bool
    response_type: Literal['text', 'html']
    fit_font_size: bool
    remove_unicode_punctuation: bool
# User may pass: "Hello" OR {"prompt": "Hello", ...}
PromptInput = Union[str, PromptDict]

# ------------------------
# Response
# ------------------------
class PromptChainResponse(BaseModel):
    success: bool = Field(..., description="Indicates if the prompt processing was successful")
    payload: List[Any] = Field(default_factory=list, description="List of processed prompt responses")
    errors: List[str] = Field(default_factory=list, description="List of error messages encountered during processing")

    # --- Dictionary-like access ---
    def __getitem__(self, key: str) -> Any:
        if key in self.__class__.model_fields:
            return getattr(self, key)
        raise KeyError(f"{key} is not a valid PromptChainResponse field")

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def __contains__(self, key: str) -> bool:
        return key in self.__class__.model_fields

    def keys(self):
        return self.__class__.model_fields.keys()

    def values(self):
        return [getattr(self, k) for k in self.keys()]

    def items(self) -> List[Tuple[str, Any]]:
        return [(k, getattr(self, k)) for k in self.keys()]

    def __iter__(self):
        return iter(self.keys())

    def __len__(self):
        return len(self.keys())

    def __repr__(self):
        return f"PromptChainResponse({dict(self.items())})"

class ChatGPT:
    def __init__(self, browser: BrowserUtils | str = "C:/Program Files/Google/Chrome/Application/chrome.exe"):
        if isinstance(browser, str):
            self.browser = BrowserUtils(browser)
        elif isinstance(browser, BrowserUtils):
            self.browser = browser
        else:
            self.browser = BrowserUtils()
        self.enforce_console_pasting = False
        self.is_session_already_open = False
        self.reset_occured = False
        self.initialize_promptChain_script()

    def initialize_promptChain_script(self):
        self.promptChain_script = """

            async function waitForStableDOM({timeout = 15, checkInterval = 0.5, requiredStableChecks = 3, padding = 0.5,} = {}) {
                const deadline = Date.now() + timeout * 1000;

                // 🧱 Wait until <body> exists (important for early execution)
                if (!document.body) {
                    await new Promise((resolve) => {
                        const observer = new MutationObserver(() => {
                            if (document.body) {
                                observer.disconnect();
                                resolve();
                            }
                        });
                        observer.observe(document.documentElement, { childList: true, subtree: true });
                    });
                }

                let stableChecks = 0;
                let mutationDetected = true;

                return new Promise((resolve) => {
                    const observer = new MutationObserver(() => {
                        mutationDetected = true;
                    });

                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true,
                    });

                    const intervalId = setInterval(() => {
                        if (Date.now() > deadline) {
                            clearInterval(intervalId);
                            observer.disconnect();
                            console.warn(`⚠️ DOM did not stabilize within ${timeout}s.`);
                            return resolve(false);
                        }

                        // 🧘 Check for stability
                        if (!mutationDetected) {
                            stableChecks++;
                            if (stableChecks >= requiredStableChecks) {
                                clearInterval(intervalId);
                                observer.disconnect();
                                return setTimeout(() => resolve(true), padding * 1000);
                            }
                        } else {
                            // 🔁 Reset counter on any new change
                            stableChecks = 0;
                            mutationDetected = false;
                        }
                    }, checkInterval * 1000);
                });
            }

            async function waitUntil(condition, { timeout = 10, pollInterval = 100, observeMutations = true, root = document.body } = {}) {
                const deadline = Date.now() + timeout * 1000;

                if (!root && observeMutations) {
                    await waitForStableDOM({ timeout: 2 });
                }

                return new Promise((resolve) => {
                    let done = false;

                    const check = async () => {
                        if (done) return;

                        try {
                            if (await condition()) {
                                done = true;
                                cleanup();
                                resolve(true);
                            } else if (Date.now() > deadline) {
                                done = true;
                                cleanup();
                                resolve(false);
                            }
                        } catch {
                            // ignore transient DOM errors
                        }
                    };

                    const interval = setInterval(check, pollInterval);

                    const observer = observeMutations
                        ? new MutationObserver(check)
                        : null;

                    if (observer && root) {
                        observer.observe(root, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            characterData: true,
                        });
                    }

                    const cleanup = () => {
                        clearInterval(interval);
                        observer?.disconnect();
                    };

                    check(); // immediate check
                });
            }

            async function sendPromptsWithAutoCopy(promptsList) {

                /* ======================= Utilities ======================= */

                function sleep(ms) {
                    return new Promise(res => setTimeout(res, ms));
                }

                const AND = (...conditions) => async () =>
                    (await Promise.all(conditions.map(c => c()))).every(Boolean);
                const OR = (...conditions) => async () =>
                    (await Promise.all(conditions.map(c => c()))).some(Boolean);
                const NOT = (condition) => async () =>
                    !(await condition());

                function getAssistantResponses() {
                    return [...document.querySelectorAll('__ASSISTANT_RESPONSE_EL_SELECTOR__')];
                }

                function getCopyButtons() {
                    return [...document.querySelectorAll('__COPY_BTN_SELECTOR__')];
                }

                const generationPulseDoesNotExists = () => 
	                !document.querySelector(`[data-message-author-role="assistant"] div.pulse`);

                const loadingShimmerDoesNotExists = () => 
                    !document.querySelector(`.text-base .loading-shimmer`);

                const stopStreamingBtnDoesNotExists = () =>
                    !document.querySelector(`[id="thread-bottom"] [data-testid="stop-button"]`)

                function hasContinueGenerating() {
                    return [...document.querySelectorAll('#thread-bottom button')]
                        .some(b => b.innerText.trim().toLowerCase() === 'continue generating');
                }

                function hasAssistantVisibleError() {
                    const lastAssistant = [...document.querySelectorAll(
                        '[data-message-author-role="assistant"]'
                    )].pop();

                    if (!lastAssistant) return null;

                    const text = lastAssistant.textContent || "";

                    // Known fatal response-level errors
                    if (
                        text.includes("Something went wrong") ||
                        text.includes("An error occurred") ||
                        text.includes("Please try again later")
                    ) {
                        return text.trim();
                    }

                    return null;
                }


                function hasHardError() {
                    // Token / quota errors
                    const tokenErrorElem = document.querySelector('aside.text-token-text-primary');
                    if (tokenErrorElem) {
                        const text = tokenErrorElem.innerText.trim();
                        if (
                            text.includes("You've reached") &&
                            (text.includes("message limit") || text.includes("limit of messages"))
                        ) {
                            return text;
                        }
                    }

                    // Explicit assistant error styling
                    const lastAssistant = getAssistantResponses().at(-1);
                    const err = lastAssistant?.querySelector('.text-token-text-error');
                    if (err) return err.innerText.trim();

                    // 🔴 NEW: Assistant-visible failure message
                    const visibleErr = hasAssistantVisibleError();
                    if (visibleErr) return visibleErr;

                    return null;
                }

                const hasFatalAssistantError = async () => {
                    return Boolean(hasHardError());
                };

                function adjustPreFontSizesWithin(element) {
                    const preContainers = element.querySelectorAll('pre .overflow-y-auto');
                    const codeElements = element.querySelectorAll(
                        '.prose :where(pre code):not(:where([class~=not-prose],[class~=not-prose] *))'
                    );

                    preContainers.forEach((container, index) => {
                        const codeEl = codeElements[index];
                        if (!codeEl) return;

                        let fontSize = codeEl.style.fontSize || getComputedStyle(codeEl).fontSize;
                        let fontSizePx = parseFloat(fontSize);

                        while (container.scrollWidth > container.clientWidth && fontSizePx > 4) {
                            fontSizePx -= 1;
                            codeEl.style.fontSize = fontSizePx + 'px';
                        }
                    });
                }

                /* =================== State Conditions ==================== */

                const isAssistantTurnFinished = async () => {

                    // Streaming still ongoing
                    if (hasContinueGenerating()) return false;

                    // Wait until DOM stops mutating
                    const stable = await waitForStableDOM({ timeout: 5 });
                    return stable;
                };

                /* ======================= Main Flow ======================= */

                let success = true;
                const copiedResults = [];
                const errors = [];

                try {
                    for (let i = 0; i < promptsList.length; i++) {
                        const { text, timeout, copy, response_type, fit_font_size } = promptsList[i];

                        const assistantCountBefore = getAssistantResponses().length;
                        const copyBtnCountBefore = getCopyButtons().length;

                        /* ---- Send Prompt ---- */
                        const textarea = document.querySelector('__TEXTAREA_SELECTOR__');
                        textarea.focus();
                        textarea.click();
                        document.execCommand('insertText', false, text);

                        await sleep(400);
                        document.querySelector('__SUBMIT_BTN_SELECTOR__').click();
                        await sleep(2000); // Wait for website's generation function to activate.

                        /* ---- Wait for assistant turn to complete ---- */
                        const completed = await waitUntil(
                            OR(
                                hasFatalAssistantError, // terminate immediately on execution error
                                AND(
                                    generationPulseDoesNotExists, // handles -> generation active but generation not started (DOM stable)
                                    loadingShimmerDoesNotExists, // handles -> generation active but generation not started (DOM stable)
                                    stopStreamingBtnDoesNotExists,
                                    isAssistantTurnFinished // handles -> generation active (DOM keeps changing)
                                )
                            ),
                            { timeout: timeout || 20 }
                        );

                        // Check if waitUntil termination was due to execution error.
                        const fatalErr = hasHardError();
                        if (fatalErr) {
                            throw new Error(fatalErr);
                        }

                        if (!completed) {
                            console.warn(`⚠️ Prompt ${i + 1}: assistant turn timed out but continuing.`);
                        }

                        /* ---- Resolve response existence ---- */
                        const assistantResponses = getAssistantResponses();
                        const newAssistant =
                            assistantResponses.length > assistantCountBefore
                                ? assistantResponses.at(-1)
                                : null;

                        const copyButtons = getCopyButtons();
                        let newCopyBtn = null;
                        if (newAssistant) {
                            newCopyBtn = newAssistant.closest(`div.text-base`).querySelector(`__COPY_BTN_SELECTOR__`);
                        }

                        /* ---- Store result ---- */
                        if (copy) {
                            try {
                                if (!newAssistant) {
                                    // Valid no-response case
                                    copiedResults.push("");
                                } else if (String(response_type).toLowerCase() === 'html') {
                                    if (fit_font_size) {
                                        adjustPreFontSizesWithin(newAssistant);
                                    }
                                    copiedResults.push(newAssistant.outerHTML);
                                } else if (newCopyBtn) {
                                    newCopyBtn.click();
                                    await sleep(300);
                                    copiedResults.push(await navigator.clipboard.readText());
                                } else {
                                    // Assistant exists but copy button intentionally absent
                                    copiedResults.push(newAssistant?.innerText || "");
                                }
                            } catch (err) {
                                copiedResults.push("");
                                errors.push(err.message);
                                success = false;
                            }
                        }

                        console.log(`✅ Prompt ${i + 1} processed.`);
                    }
                } catch (outerErr) {
                    console.error("❌ Fatal error:", outerErr.message);
                    success = false;
                    errors.push({
                        type: "ASSISTANT_RUNTIME_ERROR",
                        message: outerErr.message,
                        promptIndex: copiedResults.length
                    });
                } finally {
                    await navigator.clipboard.writeText(
                        "__RESPONSE_TOKEN__" +
                        JSON.stringify({ success, payload: copiedResults, errors })
                    );
                    console.log("📋 Final result written to clipboard.");
                }
            }

            /* ======================= Execute ======================= */

            const prompts = __PROMPTS__;
            sendPromptsWithAutoCopy(prompts);
        """
        
        selector_placements = {
            "__TEXTAREA_SELECTOR__": TEXTAREA_SELECTOR,
            "__SUBMIT_BTN_SELECTOR__": SUBMIT_BTN_SELECTOR,
            "__COPY_BTN_SELECTOR__": COPY_BTN_SELECTOR,
            "__ASSISTANT_RESPONSE_EL_SELECTOR__": ASSISTANT_RESPONSE_EL_SELECTOR
        }
        for old, new in selector_placements.items():
            self.promptChain_script = self.promptChain_script.replace(old, new)

    def open_chatgpt(self, search_incognito: bool = False, search_tor = False) -> bool:
        # Init Configurations
        if self.enforce_console_pasting: self.browser.enforce_console_pasting = True
        else: self.browser.enforce_console_pasting = False
        # Open ChatGPT URL
        if search_tor: result = self.browser.open_url_in_tor(CHATGPT_URL, retry=2)
        elif search_incognito: result = self.browser.open_incognito(CHATGPT_URL, dynamic_loading=True)
        else: result = self.browser.open_url(CHATGPT_URL, dynamic_loading=True)
        # Sync and Return
        self.is_session_already_open = True
        self.browser.enforce_console_pasting = False
        return result

    def close_session(self) -> None:
        self.browser.close_tab()
        self.is_session_already_open = False
        self.reset_occured = True

    def convert_jsonic_response_to_dict(self, response: str) -> dict | None:
        
        def extract_json_object(text: str) -> str | None:
            if not isinstance(text, str):
                return None
        
            start = text.find("{")
            if start == -1:
                return None
        
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        return text[start:i+1]
        
            return None
        
        
        def repair_broken_markdown_json(text: str) -> str:
            """
            Repairs cases like:
            {"value":"[https://x"}](https://x%22})
            → {"value":"https://x"}
            """
        
            if not isinstance(text, str):
                return text
        
            # Extract URL inside broken markdown
            match = re.search(r'\[\s*(https?://[^\s"\]]+)', text)
            if not match:
                return text
        
            url = match.group(1)
        
            # Replace entire value field safely
            return re.sub(
                r'"value"\s*:\s*"[^"]*"',
                f'"value":"{url}"',
                text
            )
        
        
        def normalize_scalar(value):
            if value is None:
                return None
        
            if not isinstance(value, str):
                return value
        
            value = value.strip()
        
            # Strip stray markdown artifacts
            value = re.sub(r'^\[|\]$', '', value)
        
            return value
        

        if not isinstance(response, str):
            return response if isinstance(response, dict) else None

        # 1️⃣ Cleanup
        text = re.sub(r"```[a-zA-Z]*\s*", "", response).replace("```", "")
        text = text.replace("\xa0", " ").replace("\r", "").replace("\n", "").strip()

        # 2️⃣ Extract JSON only
        json_text = extract_json_object(text)
        if not json_text:
            return None

        # 3️⃣ Repair broken markdown hybrids
        json_text = repair_broken_markdown_json(json_text)

        # 4️⃣ Parse
        is_json, parsed = safe_load_json(json_text)
        if not is_json or not isinstance(parsed, dict):
            return None

        # 5️⃣ Normalize values
        for k, v in parsed.items():
            parsed[k] = normalize_scalar(v)

        return parsed

    def promptChain(
            self, 
            prompts: List[PromptInput], 
            timeout='auto', # (int | float | 'auto') -> seconds
            search_incognito: bool = False,
            search_tor: bool = False,
            leave_session_opened: bool = False, 
            enable_clipboard_permission_check: bool = True, 
            get_parsed_response: bool = False, 
            allow_retry: bool = True, 
            max_retry: int = 1,
            reset_on_first_failure: bool = True, # allow reset on first failure and retry.
    ) -> PromptChainResponse:

        self.reset_occured = False
        parsed = PromptList(prompts=prompts)
        prompts: List[Union[str, PromptEntry]] = parsed.prompts

        # Default return condition
        if not prompts or not (isinstance(prompts, dict) or isinstance(prompts, list)):
            return PromptChainResponse(success=False, payload=[], errors=["No valid prompts provided."])
        
        # Initialize Script
        def build_prompts_for_script(prompts: List[Union[str, PromptEntry]]) -> List[dict]:

            script_prompts = []

            for entry in prompts:
                if isinstance(entry, str):
                    script_prompts.append({"text": entry, "timeout": None, "copy": False, "response_type": None, "fit_font_size": False, "remove_unicode_punctuation": False})
                else:
                    script_prompts.append(entry.to_js())

            if not any(p["copy"] for p in script_prompts):
                script_prompts[-1]["copy"] = True

            return script_prompts

        prompts_list = build_prompts_for_script(prompts)
        prompts_js = json.dumps(prompts_list, indent=4) # Convert Python dict to JS-friendly string
        script = self.promptChain_script
        script = script.replace("__PROMPTS__", prompts_js) # Replace the prompt placeholder
        token_length = 10
        response_token = generate_random_string(length=token_length, use_letters=True, use_digits=True) # Generate Response Tracker Token - Injected in Response
        script = script.replace("__RESPONSE_TOKEN__", response_token) # Replace response token placeholder to track valid response 
        
        if timeout == 'auto':
            timeout = 0
            for prompt in prompts:
                if isinstance(prompt, dict) and 'timeout' in prompt and isinstance(prompt['timeout'], (int, float)):
                    timeout += prompt['timeout'] + 15
                else:
                    timeout += 60 # ideal response time

        # -------- HELPERS ---------
        def human_verification_ask_exists():
            self.browser.screen_util.split_screen(3, 3)
            if self.browser.screen_util.is_text_present(text="Verify you are human", region="Row2_Col2", fuzzy=True, threshold=70):
                return True
            
        def resolve_human_verification():
            self.browser.screen_util.split_screen(3, 3)
            img_path = os.path.join(SERVER_ROOT, "modules","chatgpt","assets","human_verification_checkbox.png");
            if self.browser.screen_util.is_image_present(image_path=img_path, region="Row2_Col2", confidence=0.70):
                self.browser.screen_util.click_center_of_image(image_path=img_path, region="Row2_Col2")
                time.sleep(2)
                self.browser.screen_util.click_center_of_image(image_path=img_path, region="Row2_Col2")
                time.sleep(2)
                self.browser.reload(hard=True, endWait=6) # Reload the page
                # (Other option) Reload the page ---> pyautogui.press('f5') -> time.sleep(2)
                # Wait for page to settle
                if not self.browser.dynamic_loader(urlparse(CHATGPT_URL).hostname, max_wait=20):
                    # Auto Fix - Reload site settings
                    if leave_session_opened: # Indicates session wasn't closed before
                        self.close_session() # Close existing ChatGPT session
                    self.browser.site_details(CHATGPT_URL, delete_data=True, reset_permission=False) # Delete cookies and site-settings
                    # continue # Retry in new session
                else:
                    self.browser.enable_clipboard_read_permission()
            else:
                print("Verification Checkbox image not found")

        def tokens_limit_reached_check():
            self.browser.screen_util.split_screen(1, 3)
            if (self.browser.screen_util.is_text_present("Log in or sign up", region="Row1_Col2", fuzzy=True, threshold=75) 
                and self.browser.screen_util.is_text_present("Continue with Google", region="Row1_Col2", fuzzy=True, threshold=75)
                and (
                    self.browser.screen_util.is_text_present("Continue with Microsoft", region="Row1_Col2", fuzzy=True, threshold=75)
                    or self.browser.screen_util.is_text_present("Continue with Apple", region="Row1_Col2", fuzzy=True, threshold=75)
                    or self.browser.screen_util.is_text_present("Continue with phone", region="Row1_Col2", fuzzy=True, threshold=75)
                )
            ):
                return 'tokens_limit_reached'

        for tryIdx in range(max_retry+1 if allow_retry else 1):

            # Open ChatGPT
            if not self.is_session_already_open:
                if not self.open_chatgpt(search_incognito, search_tor):
                    # return PromptChainResponse(success=False, payload=[], errors=["Failed to open ChatGPT session."])
                    continue
                
            # Grant Clipboard access permission
            if enable_clipboard_permission_check:
                self.browser.enable_clipboard_read_permission()

            # Inject script into browser
            self.browser.inject_script(script, closePanel=True)

            # Sub-Processe(s) for Dynamic Polling
            def clipboard_check(): # Sub-Process 1
                current_clipboard = pyperclip.paste()
                if current_clipboard.startswith(response_token):
                    return current_clipboard  # returning value ends the polling
            
            # Run the dynamic polling
            result_str: str | None = dynamic_polling(
                max_wait=timeout,
                sub_processes={
                    clipboard_check: 1,    # run every 1 second
                    tokens_limit_reached_check: 11, # run every 11 second
                    human_verification_ask_exists: 4, # run every 4 seconds
                }
            )

            if (human_verification_ask_exists()):
                print("Human Verification Asked")
                resolve_human_verification()
                continue # Retry in new session

            # Close the tab
            if not leave_session_opened:
                self.close_session()

            # Parse and clean Response
            if result_str and result_str.startswith(response_token) and len(result_str) > token_length:
                result_str = result_str[token_length:].strip() # Remove token
                try:
                    result_dict: dict = json.loads(result_str)
                except:
                    return PromptChainResponse(success=False, payload=[], errors=["Failed to parse response."])
                
                if result_dict["success"] == False:
                    
                    if (
                        True # Strict retry on failure
                        or
                        any(err for err in result_dict["errors"] if "reached your message limit" in err or "reached our limit of messages" in err)     # Reached message limit.
                        or
                        any(err for err in result_dict["errors"] if "Timeout: Element not found." in err)   # Reached response timeout
                        or
                        any(err for err in result_dict["errors"] if "Requires login or signup." in err)     # Requesting login or signup
                    ):
                        # Auto Fix - Reload site settings
                        if leave_session_opened: # Indicates session wasn't closed before
                            self.close_session() # Close existing ChatGPT session
                        self.browser.site_details(CHATGPT_URL, delete_data=True, reset_permission=False) # Delete cookies and site-settings
                        continue # Retry in new session
                    
                # Optionally parse payload contents
                if get_parsed_response:
                    # Parse each response string in payload
                    parsed_payload_list = []
                    for response_str in result_dict["payload"]:
                        parsed = parse_literal(response_str, safe=True)
                        if parsed is None:
                            # Fallback to the raw string
                            parsed = response_str if response_str != 'None' else None
                        parsed_payload_list.append(parsed)
                    # Update the payload list in `result_dict`
                    result_dict["payload"] = parsed_payload_list

                # Return a Pydantic model instance
                return PromptChainResponse(
                    success=result_dict.get("success", False),
                    payload=result_dict.get("payload", []),
                    errors=result_dict.get("errors", [])
                )

            else:
                if tryIdx == 0 and reset_on_first_failure:
                    # Auto Fix - Reload site settings
                    if leave_session_opened: # Indicates session wasn't closed before
                        self.close_session() # Close existing ChatGPT session
                    self.browser.site_details(CHATGPT_URL, delete_data=True, reset_permission=False) # Delete cookies and site-settings
                    continue # Retry in new session

                return PromptChainResponse(
                    success=False,
                    payload=[],
                    errors=[f"Invalid response from interactor. Response: {result_str}"]
                )
        
        return PromptChainResponse(
            success=False,
            payload=[],
            errors=[f"Reached maximum attempts. Last Response: {result_str}"]
        )


if __name__ == "__main__":

    # Create object
    chatgpt = ChatGPT(browser="C:/Program Files/Google/Chrome/Application/chrome.exe")

    # Prompt Chain Example
    prompts = [
        {"prompt": """
You said:
You are an LLM-based form answering engine for job applications (ATS systems).

You are provided with:
1. A structured user profile database (ground truth)
2. A list of job application questions
3. Optional hints and optional database mappings derived from RAG (may or may not be relevant signal)
4. Optional selectable options (For question types like 'dropdown', 'checkbox', 'radio' etc.)

Your goal:
• Produce the most accurate answer for each question
• Maximize my chances of being shortlisted and hired
• Align answers with the job context when reasonable
• Use the database as the primary source of truth
• Use hints only if relevant
• Never hallucinate facts not supported by database or hints
• If data is missing or ambiguous, infer conservatively

Answer Optimization Priority (highest to lowest):

1. Legal / compliance truth (citizenship, work authorization, criminal records, age, disability, visa status)
   → MUST be factually correct and never optimized or inferred.

2. Job eligibility constraints (location, remote eligibility, availability, start date, relocation willingness)
   → Optimize for eligibility when multiple truthful answers exist.
   → Prefer answers that satisfy job requirements if they do not violate legal truth.

3. Job alignment and role fit
   → Favor answers that align most closely with the job title, description, and required skills.
   → Emphasize relevant experience and de-emphasize irrelevant history.

4. User database truth
   → Use as factual backing, not necessarily verbatim output.
   → Summarize, select, or contextualize information when appropriate.

5. Hints and inferred signals
   → Use only if they improve clarity or eligibility.

---

=== [START] Job Details ===

=== [END] Job Details ===


Avoid introducing unnecessary negative or limiting signals, including:
• Unrequested location mismatches
• Unrelated past roles
• Over-qualification or under-qualification signals
• Ambiguous availability or uncertainty
• Excessive honesty that reduces eligibility when multiple valid truths exist

Before finalizing your answer, internally verify:
• Does this answer reduce eligibility unnecessarily?
• Is there a more job-aligned truthful alternative?
• Does it satisfy the job's explicit constraints?

Critical Output Rules:
• Every response MUST be valid JSON
• Follow the provided JSON schema EXACTLY
• Do NOT include explanations, markdown, or extra keys
• Do NOT repeat the question text
• NEVER write template-style, example-style, instructional, or advisory language
• NEVER include brackets [] or angle brackets <> in outputs
• If a concrete value is unavailable:
  - Select the best real alternative from the database.
  - Or return the minimal truthful value by infering best real alternative (never a template)
• Do NOT include disclaimers, prefaces, boilerplate, meta-writing, preamble/lead-in, instructional echo, self-referential commentary, epilogue, or closing niceties

END OF SYSTEM PROMPT - Keep these rules, instructions, and information (all context) in mind for reference and future usage. Currently, do not respond to this.""", "timeout":10, "copy":False},
        {"prompt": """You are now given the full user profile database.
This database is the PRIMARY source of truth.

User Profile Database:
{
  "email": "kalpthakkar2001@gmail.com",
  "username": "kalpthakkar",
  "firstName": "Kalp",
  "lastName": "Thakkar",
  "phoneExtension": "+1",
  "phoneNumber": "3864567971",
  "preferredName": "",
  "birthDate": "2001-04-02",
  "linkedin": "https://www.linkedin.com/in/kalpthakkar",
  "github": "https://github.com/kalpthakkar",
  "portfolio": "",
  "otherURLs": [
    "https://scholar.google.com/citations?user=g7AQ9N0AAAAJ"
  ],
  "skills": [
    "Python",
    "C++",
    "Javascript",
    "Autonomous System",
    "DevOps",
    "CI/CD",
    "Git",
    "Docker",
    "IoT",
    "Artificial Intelligence",
    "Natural Language Processing",
    "LLM",
    "AI Agents",
    "Kubernetes",
    "REST API",
    "SQL",
    "GraphQL",
    "Agentic Workflow",
    "Google Cloud Platform",
    "AWS",
    "Terraform",
    "Ansible",
    "Web Development",
    "ETL",
    "Data Science",
    "Intelligent Systems"
  ],
  "relocationPreference": true,
  "relocationSupport": false,
  "accomodationSupport": false,
  "remoteWorkPreference": true,
  "employmentInfo": {
    "visaSponsorshipRequirement": false,
    "workAuthorization": true,
    "rightToWork": true,
    "backgroundCheck": true,
    "employmentRestrictions": false,
    "nonCompleteRestrictions": false,
    "securityClearance": false,
    "citizenshipStatus": false,
    "gender": "Male",
    "sexualOrientation": "Heterosexual / Straight",
    "lgbtqStatus": false,
    "hispanicOrLatino": false,
    "militaryService": false,
    "veteranStatus": false,
    "disabilityStatus": false,
    "visaStatus": "F-1 OPT",
    "ethnicity": [
      "South Asian"
    ]
  },
  "workExperiences": [
    {
      "jobTitle": "Research Assistant",
      "company": "Temple University",
      "jobLocationType": "On-site",
      "location": "Philadelphia, PA",
      "jobType": "Full Time",
      "roleDescription": "Architecting and productionizing large-scale EHR data into AI pipelines spanning ingestion, ETL, feature engineering, NLP, model training, validation, and inference across multimodal datasets (structured records + free-text), enabling 30-50% earlier risk detection, 2\u00d7 faster model iteration, and reusable system designs transferable across healthcare, mobility, and enterprise domains.",
      "startDate": "2026-02-01",
      "endDate": "",
      "reasonForLeaving": null
    },
    {
      "jobTitle": "Software Engineer",
      "company": "University of Central Florida",
      "jobLocationType": "On-site",
      "location": "Orlando, FL",
      "jobType": "Part Time",
      "roleDescription": "Led geospatial data analysis, cloud-AI integration for real-time 3D informed decision-making by modeling dynamic urban systems including predictive algorithms for passenger flow at MCO and international airports, advancing Airport Digital Twin development\n\nDeveloped predictive ML models (risk scoring, phenotyping, progression forecasting) for meta-analytical stress detection optimized for accuracy, interpretability, and deployment constraints, boosting AUC gains up to 0.18, false-positive reduction of 25%, and sub-second inference latency in real-world decision workflows\n\nDelivered Edge-AI solutions for urban noise and obstacle detection in the OGC UDTIP open-source pilot project using GeoPose and TrainDML-AI standards; research published at ISPRS GSW'25 & adopted by United Nations for global digital twin interoperability.",
      "startDate": "2024-08-08",
      "endDate": "",
      "reasonForLeaving": null
    },
    {
      "jobTitle": "Graduate Teaching Assistant",
      "company": "University of Central Florida",
      "jobLocationType": "Hybrid",
      "location": "Orlando, FL",
      "jobType": "Part Time",
      "roleDescription": "Guided and supported 150+ graduate students in mastering NLP and blockchain fundamentals, including text preprocessing, vector models, deep learning (BERT, GPT, T5), distributed ledger technologies, consensus (PoW, PoS), and smart contracts on Ethereum.\n\nLed hands-on sessions with Hugging Face, PyTorch, and Solidity, facilitated research discussions, and provided tailored support in both language modeling and decentralized application design. Enhanced student engagement and performance by connecting theoretical concepts with real-world applications through interactive labs, code reviews, and personalized guidance.",
      "startDate": "2024-01-08",
      "endDate": "2025-08-08",
      "reasonForLeaving": "End of semester."
    },
    {
      "jobTitle": "Software Engineer",
      "company": "Sterling Accuris Diagnostics",
      "jobLocationType": "On-site",
      "location": "India",
      "jobType": "Part Time",
      "roleDescription": "Owned deployment and scaling of production-grade automation platform to dynamically optimizes task scheduling & resource allocation using predictive analytics (LightGBM, Prophet), improving operational throughput by 38% for enterprise clients\n\nStreamlined AWS (Lambda, EC2) services powering E2E webApp with React, Node.js, REST, PostgreSQL, and CI/CD integrations, enabling real-time monitoring, and reducing incident resolution time by 52% through faster debugging & automated workflows.",
      "startDate": "2020-05-01",
      "endDate": "2023-07-01",
      "reasonForLeaving": "Graduation ongoing & career growth."
    }
  ],
  "education": [
    {
      "school": "University of Central Florida",
      "degree": [
        "Masters of Science",
        "MS",
        "M.S.",
        "Master's Degree"
      ],
      "major": [
        "Computer Science",
        "Computer and Info Science",
        "Computer Science and Eng",
        "CS",
        "Computer Engineering"
      ],
      "startDate": "2023-08-08",
      "endDate": "2025-05-01",
      "gpa": "4"
    },
    {
      "school": "LDRP Institute of Technology & Research",
      "degree": [
        "Bachelor of Engineering",
        "Bachelor",
        "BS",
        "B.S.",
        "Bachelor of Technology",
        "B. Tech",
        "B. Eng.",
        "Bachelor's Degree"
      ],
      "major": [
        "Computer Engineering",
        "Computer Science and Eng",
        "Computer Science",
        "Computer and Info Science",
        "CE",
        "CS"
      ],
      "startDate": "2019-07-01",
      "endDate": "2023-05-01",
      "gpa": "8.87"
    }
  ],
  "projects": {
    "Urban Digital Twin Interoperability Pilot": {
      "description": "\u2022 Contributed to the Open Geospatial Consortium\u2019s UDTIP project leading D101 deliverable for developing interoperable digital twin standards for smart cities, enabling real-time, cross-platform urban system integration. \n\u2022 Engineered robust data pipelines to harmonize heterogeneous IoT and geospatial data sources using GeoPose and TrainDML-AI standards. \n\u2022 Developed Edge-AI models for obstacle detection, facilitating real-time situational awareness. \n\u2022 Results published at ISPRS GSW 2025 and adopted by the United Nations for advancing global digital twin interoperability frameworks.",
      "topics": [
        "Digital Twin",
        "Real-time System",
        "IoT",
        "Artificial Intelligence",
        "Intelligent Systems",
        "GeoPose",
        "TrainingDML-AI",
        "Research & Development",
        "Edge-AI",
        "Open Source"
      ],
      "file": "projects/17691143344007694/Research ~ Geopose_enabled_Camera_Imagery_Interoperability_with_Geo_AI_in_Urban_Digital_Twins.pdf",
      "url": "https://github.com/kalpthakkar/OGC-UDTIP"
    },
    "ChromaVision: Object-aware Image Colorization": {
      "description": "\u2022 Led the advancement of the ChromaVision project, enhancing the instance-aware image colorization pipeline through strategic integration of the MMDetection framework. This meticulous integration yielded a remarkable 15% increase in object detection accuracy, elevating the mAP (mean Average Precision) by 12 points across diverse object categories.\n\u2022 By incorporating Autoencoders within the colorization architecture, I significantly bolstered the model's capacity to discern intricate color patterns, resulting in a noteworthy 20% reduction in reconstruction error. This not only enhanced the model's fidelity but also contributed to the overall quality of colorized images.\n\u2022 Additionally, expanded the model's object-level understanding through rigorous training on ImageNet\u2019s 1.5 million annotated instances.",
      "topics": [
        "Computer Vision",
        "Scikit-Learn",
        "PyTorch",
        "Machine Learning",
        "CUDA Toolkit",
        "OpenCV",
        "Object Detection",
        "TensorFlow"
      ],
      "file": "",
      "url": "https://github.com/CAP5415-Fall2023-Image-Colorization/InstColorization_kalp"
    },
    "AURA in Healthcare | Brain Control Interface": {
      "description": "\u2022 Designed and developed a real-time EEG-based Brain-Computer Interface (BCI) leveraging the ADS1299 module and a 3-electrode configuration (Fp1, Fpz, Fp2) on an ESP32 microcontroller. \n\u2022 Achieved 93% brainwave classification accuracy through ML-powered mental-state mapping using LSTM models, enabling early neurological disease prediction and assistive communication for non-verbal individuals. \n\u2022 Integrated the system with FastAPI microservices, LangChain RAG pipelines, and ChromaDB to fuse EEG, wearable, and clinical data into a cloud-deployed architecture. \n\u2022 Optimized edge processing to reduce response latency by 3 seconds, and enhanced task success by 40% through secure MQTT protocol based communication and intelligent IoT control. \n\u2022 Deployed for interactive analytics, making AURA a pioneering solution in neuro-assistive and personalized healthcare tech.",
      "topics": [
        "Brain-computer Interfaces",
        "Edge-AI",
        "LangChain",
        "Large Language Models (LLM)",
        "Retrieval-Augmented Generation (RAG)",
        "Natural Language Processing (NLP)",
        "Human Computer Interaction",
        "Embedded Software Programming",
        "C++",
        "Internet of Things (IoT)",
        "Python (Programming Language)",
        "Machine Learning in Healthcare"
      ],
      "file": "",
      "url": "https://github.com/kalpthakkar/AURA-EEG-based-BCI"
    },
    "ALIE \u2022 Artificially Linked Intelligent Entity | Full-Stack IoT Automation": {
      "description": "\u2022 Built a real-time embedded control system on ESP32 using FreeRTOS and MQTT with end-to-end encryption and OTA updates, improving device response latency by 21% through efficient task scheduling, ISR handling, and protocol-layer optimization.\n\u2022 Integrated voice commands (Alexa/Google Home), NFC/RFID, and mobile/web interfaces via secure API endpoints, enabling seamless multi-modal control, enhancing accessibility, and increasing overall user interaction and engagement by 40%.\n\u2022 Developed a cloud-synced firmware with Firebase and designed a 3D-enabled React dashboard for real-time state monitoring, bi-directional updates, remote task scheduling, and immersive visualization using ThreeJS, Fusion 360, and model-viewer.",
      "topics": [
        "Internet of Things (IoT)",
        "Embedded Systems",
        "C++",
        "Computer Networking",
        "Firebase",
        "Cloud Firestore",
        "NoSQL",
        "JavaScript",
        "React.js",
        "Autodesk Fusion 360",
        "Full-Stack Development",
        "Software Development Life Cycle (SDLC)",
        "DevOps",
        "Docker",
        "Git"
      ],
      "file": "",
      "url": "https://github.com/kalpthakkar/ALIE-IoT-Automation"
    },
    "Smart Brain | Face Recognition Full-Stack WebApp": {
      "description": "\u2022 Developed a secure and responsive full-stack face recognition app using the MERN stack, integrating Clarifai API for real-time facial detection with pixel-level precision. \n\u2022 Optimized frontend performance using responsive UI with CSS Flexbox/Grid and Figma-designed wireframes, reducing load time by 2.8s. \n\u2022 Leveraged Node.js with PostgreSQL to minimize database query latency by 15ms. \n\u2022 Implemented RESTful APIs and bcrypt-based authentication, reducing breach risk by 90%, ensuring robust data protection and end-to-end deployment via Heroku.",
      "topics": [
        "OpenCV",
        "Full-Stack Development",
        "React.js",
        "Node.js",
        "Three.js",
        "PostgreSQL",
        "API",
        "JavaScript",
        "Image Processing",
        "Computer Vision",
        "Heroku",
        "Git",
        "GitHub"
      ],
      "file": "",
      "url": "https://github.com/kalpthakkar/Face-Recognition-WebApp"
    }
  },
  "achievements": {
    "Global Scholar, IEEE AISS on Human-Centric AI Autonomy": {
      "description": "Awarded a prestigious scholarship of US$850 to attend the IEEE Academia-Industry Summer School (AISS) on \"Towards Human-Centric Artificial Intelligence (AI)-empowered Autonomy,\" held at Swinburne University of Technology, Melbourne, Australia. Selected as one of only 20 participants globally from a highly competitive pool of applications. This opportunity recognizes my potential and dedication to advancing AI and autonomy and provides a platform to deepen my expertise, network with global leaders in academia and industry, and represent my research on an international stage.\nIssued by IEEE SMC - Systems, Man, and Cybernetics Society.",
      "file": "achievements/17691143345203222/IEEE AISS'24 Scholarship Award (Global Top 20).pdf",
      "url": "https://www.linkedin.com/in/kalpthakkar/overlay/1735147603393/single-media-viewer"
    },
    "Insight Coding Techfest Winner": {
      "description": "I'm elated to announce my triumph in an inter-university coding contest at a premier tech fest, where over 1000 students from 50+ universities across India participated. Hailing from L.D. College of Engineering (L.D.C.E), the #1 government engineering college in the state and 20th overall rank nationally, this victory underscores the exceptional education and innovation fostered at L.D.C.E. Emerging as the top coder in this highly competitive arena not only showcases my technical acumen but also positions L.D.C.E as a hub for top-tier talent. This achievement marks a pivotal moment in my academic journey, reflecting the excellence ingrained in both myself and my institution.\nIssued by L.D. College of Engineering",
      "file": "",
      "url": "https://www.linkedin.com/in/kalpthakkar/details/honors/1706164328571/single-media-viewer"
    },
    "Perplexity Student Ambassador": {
      "description": "",
      "file": "",
      "url": ""
    },
    "Student Excellence Award": {
      "description": "Humbled to have clinched the prestigious 'Student of the Year' accolade for an unprecedented four consecutive years, standing out amongst 500+ peers. This esteemed recognition is a testament to my unwavering commitment to academic excellence and active participation in extracurricular pursuits. Beyond mere grades, it reflects a holistic dedication to fostering a dynamic learning environment. Grateful for the acknowledgment, I see this award not only as a personal triumph but as a celebration of resilience, leadership, and a passion for continual growth. Eager to carry this spirit of achievement into future endeavors and make a lasting impact. #StudentOfTheYear #ExcellenceInAction\nIssued by BEST Higher Secondary School",
      "file": "",
      "url": ""
    }
  },
  "salaryExpectation": {
    "min": "90000",
    "max": "120000"
  }
}

END OF CONTEXT PROMPT — Keep this information (available user context) in mind along with system instructions for reference and future usage. Currently, do not respond to this.""", "timeout":15, "copy":True}, # default response_type:text
        {"prompt": """Question:

--- START OF QUESTION ---

Veteran Status

--- END OF QUESTION ---

Hints (may or may not be useful):
[
  [
    "I am not a veteran"
  ]
]

Database information (may or may not be useful):
{
  "employmentInfo.veteranStatus": false
}

You are selecting ONE option from a fixed list.

Rules:
• Select exactly one option from the provided list
• Match semantically, not lexically
• Never invent new values
• Prefer database-backed answers
• Must select at least one answer that increases my eligibility and hiring chance (incase actual context is missing in database).
• Lookout provided system instructions, rules, information and user context for additional inference.

Options:
[
  "I am not a protected veteran",
  "I identify as one or more of the classifications of a protected veteran",
  "I don't wish to answer"
]

Choose exactly ONE option from the list above.
The value must match exactly (case-sensitive).

Response JSON schema:
{
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "value": {
                "type": "string",
                "enum": options
            }
        },
        "required": ["value"]
    }
}

Example:
{
  "value": "string"
}

Return the answer strictly in JSON.""", "timeout":15, "copy":True}, # default response_type:text
        {"prompt": """Question:

--- START OF QUESTION ---

LinkedIn Profile

--- END OF QUESTION ---

You are answering a short single-line input field.

Rules:
• Output a single concise string
• No punctuation padding
• No explanations
• Use database values if available, otherwise infer safely
• Never return template-style, example-style, or instructional language
• Lookout provided system instructions, rules, information and user context for additional inference.

Response JSON schema:
response_format = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "value": { "type": "string" }
        },
        "required": ["value"]
    }
}

Example:
{
  "value": "string"
}

Return the most appropriate short and concise answer (strictly in JSON).""", "timeout":10, "copy":True, "response_type": "html", "fit_font_size": True}
    ]

    # prompts = [
    #     {"prompt": "Hello, how are you?", "timeout":10, "copy":False},
    #     {"prompt": "Tell me a joke.", "timeout":15, "copy":True}, # default response_type:text
    #     {"prompt": "Tell me a joke.", "timeout":15, "copy":True}, # default response_type:text
    #     {"prompt": "Summarize this text.", "timeout":10, "copy":True, "response_type": "html", "fit_font_size": True}
    # ]


    # prompts: List[str] = ["Hello, how are you?",  "Tell me a joke.", "Summarize this text."]

    response: PromptChainResponse = chatgpt.promptChain(prompts, search_incognito=True, leave_session_opened=True)
    print(response)


