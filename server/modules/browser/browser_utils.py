from modules.utils.js_utils import import_js_functions, inject_dictionary, sync_sleep
from modules.utils.helpers import dynamic_polling
from config.env_config import TESSERACT_PATH, SERVER_ROOT
from modules.utils.pyautogui_utils import ScreenUtility
from typing import Literal, Tuple
import pyautogui
import pyperclip
import time
from urllib.parse import urlparse, quote
import subprocess
import webbrowser
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
from enum import Enum
from pathlib import Path

class BrowserName(str, Enum):
    CHROME = "chrome"
    BRAVE = "brave"
    EDGE = "edge"

class BrowserUtils:
    def __init__(self, path="C:/Program Files/Google/Chrome/Application/chrome.exe"):

        if isinstance(path, Path):
            path = str(path)

        self.path: str = path
        self.browser_name: BrowserName = self._init_browser_name(self.path)

        self.screen_util = ScreenUtility()
        self.screen_util.set_tesseract_path(TESSERACT_PATH)
        
        webbrowser.register(
            'chrome',
            None,
            webbrowser.BackgroundBrowser(self.path)
        )
        self.BrowserObject = webbrowser.get('chrome')

        # self.BrowserObject = webbrowser.get(f'"{self.path}" "%s"')
        self.is_Panel_Open = []  # Tracks DevTools panel state per tab
        self.tor_session_ongoing_count = 0
        self.verifyDOMChangeOnToggle = False
    
    def _init_browser_name(self, path: str) -> BrowserName:
        if path.endswith('chrome.exe'):
            return BrowserName.CHROME
        elif path.endswith('brave.exe'):
            return BrowserName.BRAVE
        elif path.endswith('edge.exe'):
            return BrowserName.EDGE
        else:
            raise ValueError(f"Unknown browser executable: {path}")

    def url_encode(self, text: str) -> str:
        """URL-encode a string for safe inclusion in URLs."""
        return quote(text, safe='')

    def build_search_engine_url(self, search_text: str, search_engine: Literal["google", "duckduckgo"]) -> str | None:

        if "google" in search_engine.lower():
            return f"https://www.google.com/search?q={self.url_encode(search_text)}"
        elif "duckduckgo" in search_engine.lower():
            return f"https://duckduckgo.com/?q={self.url_encode(search_text)}"
        else:
            return None

    def execute_shortcut(self, keys: Tuple[str, ...], end_wait: float = 1.5):
        """
        Executes a combination of shortcut keys.
        
        Parameters:
        - keys: A tuple of strings, where each string is a key in the combination.
        - wait_time: Optional time to wait before or after executing the shortcut.
        """
        pyautogui.hotkey(*keys)
        time.sleep(end_wait)

    def open_url_in_tor(self, url: str, shortcut: Tuple[str, ...] = ('alt', 'shift', 'n'), max_wait: float = 20, retry=1) -> bool:

        self.verifyDOMChangeOnToggle = True
        max_attempts = retry + 1
        for tryCount in range(1, max_attempts+1):
            is_initial_try = True if tryCount == 1 else False
            is_last_try = True if tryCount == max_attempts else False

            # Open the initial Brave instance normally (not incognito or special)
            subprocess.Popen([self.path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.is_Panel_Open.append(False)
            time.sleep(2)  # Allow the window to open

            # Trigger the shortcut for "Private with Tor" mode
            self.execute_shortcut(shortcut, end_wait=2)
            self.is_Panel_Open.append(False)
            pyautogui.press('esc')
            time.sleep(0.5)
            self.tor_session_ongoing_count += 1

            # Stablize the Tor Browser
            isBrave = "brave.exe" in self.path
            if isBrave:
                self.screen_util.split_screen(3, 3)
                is_connected_img_path_1 = os.path.join(SERVER_ROOT, "modules","browser","assets","tor_connected_successfully_1.png")
                is_connected_img_path_2 = os.path.join(SERVER_ROOT, "modules","browser","assets","tor_connected_successfully_2.png")
                def is_connected():
                    if (
                        self.screen_util.is_image_present(image_path=is_connected_img_path_1, region="Row1_Col1", confidence=0.75)
                        or self.screen_util.is_image_present(image_path=is_connected_img_path_2, region="Row1_Col1", confidence=0.75)
                    ):
                        return True
                is_brave_tor_connected = dynamic_polling(
                    max_wait=20,
                    sub_processes={
                        is_connected: 2    # run every 2 second
                    }
                )
                if not is_brave_tor_connected:
                    print(f"Dynamic Connect Check Failed. {"End of all retries." if is_last_try else "Retrying..."}")
                    self.close_tab()
                    continue
            else:
                if not self.dynamic_connected_check(max_wait=max_wait):
                    print(f"Dynamic Connect Check Failed. {"End of all retries." if is_last_try else "Retrying..."}")
                    self.close_tab()
                    continue

            # Now we paste the URL in the address bar of the new window
            pyautogui.hotkey('ctrl', 'l')  # Focus on the address bar
            time.sleep(0.5)
            pyperclip.copy(url)  # Copy URL to clipboard
            pyautogui.hotkey('ctrl', 'v')  # Paste the URL
            pyautogui.press('enter')  # Press Enter to navigate to the URL
            time.sleep(1.5)  # Give it some time for the page to start loading

            # Dynamically load the page and check its status
            if not self.dynamic_loader(urlparse(url).hostname, max_wait=max_wait):
                print(f"Dynamic Loader Failed. {"End of all retries." if is_last_try else "Retrying..."}")
                self.close_tab()
                if not is_initial_try:
                    self.site_details(url, delete_data=True, reset_permission=False) # Delete cookies and site-settings
                continue

            return True

        return False

    def open_url(self, url: str, endWait: float = 5, dynamic_loading: bool = False, max_wait: float = 20) -> bool:
        """Open a URL in the browser and track panel state."""
        self.BrowserObject.open_new(url)
        self.is_Panel_Open.append(False)
        if not dynamic_loading:
            time.sleep(endWait)  # Wait for `browser to open` + `load the page`.
            return True
        else:
            time.sleep(2) # Wait for the browser to open
            if not self.dynamic_loader(hostname = urlparse(url).hostname, max_wait = max_wait): # Wait for the page to load.
                self.close_tab()
                return False
            return True


    def open(self, url: str, endWait: float = 5):
        """Public method to open a URL in the current tab (new window if no tab exists)."""
        self.open_url(url, endWait)

    def open_new(self, url: str, endWait: float = 5):
        """Open a URL in a new browser tab."""
        self.BrowserObject.open_new_tab(url)
        self.is_Panel_Open.append(False)
        time.sleep(endWait)

    def open_new_tab(self, endWait: float = 1):
        """
        Open a new tab in the default browser.
        If URL is provided, it will load it; otherwise opens a blank tab.
        """
        self.BrowserObject.open_new_tab("about:blank")
        self.is_Panel_Open.append(False)
        time.sleep(endWait)

    def open_incognito(self, url: str, dynamic_loading: bool = True, max_wait: float = 20) -> bool:
        """
        Open a URL in Chrome incognito mode.
        Tracks panel state like other open methods.
        """
        subprocess.Popen([self.path, "--incognito", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.is_Panel_Open.append(False)
        if dynamic_loading:
            time.sleep(1.8)
            if not self.dynamic_loader(hostname = urlparse(url).hostname, max_wait = max_wait):
                self.close_tab()
                return False
        return True

    def switch_window_using_shortcut(self, url: str, dynamic_loading: bool = True, max_wait: float = 20):
        """
        Open a URL in Chrome incognito mode.
        Tracks panel state like other open methods.
        """
        subprocess.Popen([self.path, "--incognito", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        self.is_Panel_Open.append(False)
        if dynamic_loading:
            time.sleep(1.8)
            return self.dynamic_loader(hostname = urlparse(url).hostname, max_wait = max_wait)

    def redirect(self, url: str, endWait: float = 5) -> None:   
        # Paste redirect script
        self.inject_script(f"""window.location.href = '{url}'""", endWait=endWait, closePanel=True)

    def close_tab(self) -> None:
        """Close the most recently opened tab and update panel state."""

        pyautogui.hotkey("ctrl", "w")
        if self.is_Panel_Open:
            self.is_Panel_Open.pop()

        if self.tor_session_ongoing_count > 0:
            self.tor_session_ongoing_count -= 1

            pyautogui.hotkey("ctrl", "w")
            if self.is_Panel_Open:
                self.is_Panel_Open.pop()

    def reload( self, hard: bool = False, max_wait: float = 20, endWait: float = 1.5 ) -> None:
        """
        Reload the current page.

        Parameters:
        - hard: If True, performs a hard reload (Ctrl+Shift+R)
        - max_wait: Max wait time for dynamic loading
        - endWait: Static wait after reload if dynamic_loading is False
        """

        # Ensure focus is on browser content
        pyautogui.click(200, 200)  # safe neutral click
        time.sleep(0.2)

        if hard:
            pyautogui.hotkey("ctrl", "shift", "r")
        else:
            pyautogui.hotkey("ctrl", "r")

        # Small delay before DOM polling starts
        time.sleep(endWait)


    def list_tabs(self):
        """Print all tab indices with their panel state."""
        if not self.is_Panel_Open:
            print("No tabs open.")
            return
        for i, state in enumerate(self.is_Panel_Open):
            print(f"Tab {i}: Panel is {'open' if state else 'closed'}")

    def dynamic_loader(self, hostname: str, max_wait: float = 20, check_interval: float = 0.5, consecutive_stable_checks: int = 4, padding: float = 1) -> bool:

        # Initialize Script
        domStable_script = """
            async function copyStatusWhenDOMStable({
                timeout = 15,             // max wait in seconds
                checkInterval = 0.5,      // interval to check DOM mutations
                requiredStableChecks = 3, // consecutive stable checks needed
                padding = 1,              // delay before copying (seconds)
            } = {}) {
                const deadline = Date.now() + timeout * 1000;

                // Wait until <body> exists
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

                            // Copy "failed" after padding
                            setTimeout(() => {
                            navigator.clipboard.writeText("failed")
                                .catch(err => console.error("Clipboard write failed:", err));
                            resolve(false);
                            }, padding * 1000);

                            return;
                        }

                        if (!mutationDetected) {
                            stableChecks++;
                            if (stableChecks >= requiredStableChecks) {
                                clearInterval(intervalId);
                                observer.disconnect();

                                // Copy "ready" after padding
                                setTimeout(() => {
                                    navigator.clipboard.writeText("ready")
                                    .catch(err => console.error("Clipboard write failed:", err));
                                    resolve(true);
                                }, padding * 1000);

                                return;
                            }
                        } else {
                            stableChecks = 0;
                            mutationDetected = false;
                        }
                    }, checkInterval * 1000);
                });
            }

            copyStatusWhenDOMStable({ timeout: __MAX_WAIT__, checkInterval: __CHECK_INTERVAL__, requiredStableChecks: __REQUIRED_STABLE_CHECKS__, padding: __PADDING__ });
        """
        
        inject_script_end_wait: float = 0.5 # Before closing panel
        domStable_script = domStable_script.replace("__MAX_WAIT__", str(max_wait))
        domStable_script = domStable_script.replace("__CHECK_INTERVAL__", str(check_interval))
        domStable_script = domStable_script.replace("__REQUIRED_STABLE_CHECKS__", str(consecutive_stable_checks))
        domStable_script = domStable_script.replace("__PADDING__", str(inject_script_end_wait + padding))

        # Inject script into browser
        if not self.inject_script(domStable_script, endWait=inject_script_end_wait, closePanel=True):
            return False

        # Sub-Process for Dynamic Polling
        initial_clipboard = "dummy_text"
        pyperclip.copy(initial_clipboard) # Initialize clipboard with dummy text
        def clipboard_check():
            self.select_permission_interactor(hostname=hostname, allow=True)
            if pyperclip.paste() == "ready":
                return True  # polling ends if not returning None
            elif pyperclip.paste() == "failed":
                return False # polling ends if not returning None

        # Run the dynamic polling to check if page loading is complete
        result = dynamic_polling(
            max_wait=max_wait,
            sub_processes={
                clipboard_check: 1    # run every 1 second
            }
        )

        # Return
        return True if result is not None else False

    def dynamic_connected_check(self, max_wait: float = 20, check_interval: float = 0.5, consecutive_stable_checks: int = 4, padding: float = 1) -> bool:

        # Initialize Script for DOM Polling
        domConnected_script = """
            async function checkConnectionWhenReady({
                timeout = 15,             // max wait in seconds
                checkInterval = 0.5,      // interval to check document.body.innerText
                requiredStableChecks = 3, // consecutive stable checks needed
                padding = 1,              // delay before copying (seconds)
            } = {}) {
                const deadline = Date.now() + timeout * 1000;
                
                let stableChecks = 0;
                let mutationDetected = true;
                
                return new Promise((resolve) => {
                    const intervalId = setInterval(() => {
                        if (Date.now() > deadline) {
                            clearInterval(intervalId);
                            
                            // Copy "failed" after padding
                            setTimeout(() => {
                                navigator.clipboard.writeText("failed")
                                    .catch(err => console.error("Clipboard write failed:", err));
                                resolve(false);
                            }, padding * 1000);

                            return;
                        }

                        if (document.body && document.body.innerText.includes('connected successfully')) {
                            clearInterval(intervalId);
                            
                            // Copy "ready" after padding
                            setTimeout(() => {
                                navigator.clipboard.writeText("ready")
                                    .catch(err => console.error("Clipboard write failed:", err));
                                resolve(true);
                            }, padding * 1000);

                            return;
                        }
                    }, checkInterval * 1000);
                });
            }

            checkConnectionWhenReady({ timeout: __MAX_WAIT__, checkInterval: __CHECK_INTERVAL__, requiredStableChecks: __REQUIRED_STABLE_CHECKS__, padding: __PADDING__ });
        """

        inject_script_end_wait: float = 0.5 # Before closing panel
        domConnected_script = domConnected_script.replace("__MAX_WAIT__", str(max_wait))
        domConnected_script = domConnected_script.replace("__CHECK_INTERVAL__", str(check_interval))
        domConnected_script = domConnected_script.replace("__REQUIRED_STABLE_CHECKS__", str(consecutive_stable_checks))
        domConnected_script = domConnected_script.replace("__PADDING__", str(inject_script_end_wait + padding))

        # Inject script into browser
        if not self.inject_script(domConnected_script, endWait=inject_script_end_wait, closePanel=True):
            return False

        # Sub-Process for Dynamic Polling
        initial_clipboard = "dummy_text"
        pyperclip.copy(initial_clipboard) # Initialize clipboard with dummy text
        def clipboard_check():
            if pyperclip.paste() == "ready":
                return True  # polling ends if not returning None
            elif pyperclip.paste() == "failed":
                return False # polling ends if not returning None

        # Run the dynamic polling to check for connection status
        result = dynamic_polling(
            max_wait=max_wait,
            sub_processes={clipboard_check: 1}  # run every 1 second
        )

        # Return
        return True if result else False

    # returns boolean to represent success
    def toggle_panel(self, mode: Literal["open", "close", True, False], endWait: float = 0) -> bool:
        """
        Toggle the DevTools panel in the current tab.
        
        Parameters:
        - mode: 'open', 'close', True, or False.
        - endWait: Time to wait after toggling.
        """
        
        if not self.is_Panel_Open:
            print("No tabs open to toggle panel.")
            return False

        current_state = self.is_Panel_Open[-1]
        desired_state = (mode == "open" or mode is True)
        endWait = 1 if (endWait==0 and desired_state) else endWait

        if desired_state != current_state:
            self.screen_util.split_screen(1, 2)
            self.screen_util.take_snapshot(region="Row1_Col2")
            pyautogui.hotkey("ctrl", "shift", "j")

            if self.verifyDOMChangeOnToggle:
                # Dynamic wait
                if self.screen_util.has_screen_significantly_changed(threshold=20, region="Row1_Col2", timeout=5):
                    # print("✅ Screen changed")
                    pass
                else:
                    print("❌ Screen not changed - toggle panel not switched")
                    return False

            self.is_Panel_Open[-1] = desired_state
            time.sleep(endWait)
        return True

    def get_panel_state(self, index: int = -1) -> bool:
        """Return the panel state for a given tab (default: last tab)."""
        if not self.is_Panel_Open:
            raise IndexError("No tabs open.")
        return self.is_Panel_Open[index]

    def enable_keyboard_pasting(self) -> None:
        self.toggle_panel('open', endWait=1.5)
        pyperclip.copy('console.log("Hello World");')
        pyautogui.hotkey("ctrl", "v") # Triggers paste warning
        time.sleep(1)
        pyautogui.press("enter")
        time.sleep(1.5)
        pyautogui.typewrite("allow pasting")
        time.sleep(0.5)
        pyautogui.press("enter")
        time.sleep(1)

    # returns boolean to represent success
    def inject_script(self, js_code, endWait: float = 0.5, closePanel: bool = False) -> bool:

        # Step 1: Open console panel if not open
        if self.toggle_panel("open", endWait=1.5):

            # Step 2: Paste actual JS code
            pyperclip.copy(js_code)
            pyautogui.hotkey("ctrl", "v")
            time.sleep(1)
            pyautogui.press("enter")
            time.sleep(endWait)

            # Step 3: Optionally Close Panel
            if closePanel:
                return True if self.toggle_panel("close") else False
            else:
                return True
        else:
            return False

    def inject_and_get_clipboard(self, js_code, timeout: float, endWait: float = 1, null_result_allowed: bool = True, max_retries: int = 1) -> bool | str:

        for _ in range(max_retries):

            # Step 1: Run script
            # Note: Close console required to focus document - required for copy operation to suceed.
            if not self.inject_script(js_code, endWait=0.5, closePanel=True):
                continue

            # Step 2: Wait for clipboard to update
            time.sleep(timeout + endWait)

            # Step 3: Return copied item from clipboard
            result = pyperclip.paste().strip()
            if (null_result_allowed or (result != "" and result != "undefined")) and (result != js_code.strip()):
                return result

        return False

    def select_permission_interactor(self, hostname: str, allow: bool = True) -> bool:
        browser_permission_map = {
            BrowserName.CHROME: {
                "message": f'{hostname} wants to',
                "tab_count_to_allow": 2,
                "tab_count_to_block": 3
            },
            BrowserName.BRAVE: {
                "message": f'{hostname} is asking you to',
                "tab_count_to_allow": 3,
                "tab_count_to_block": 4
            },
            BrowserName.EDGE: {
                "message": f'{hostname} wants to',
                "tab_count_to_allow": 3,
                "tab_count_to_block": 2
            }
        }
        self.screen_util.split_screen(3, 3) 
        if self.screen_util.is_text_present(text=browser_permission_map[self.browser_name]["message"], region="Row1_Col1", fuzzy=True, threshold=90):
            self.screen_util.click_center_of_text(browser_permission_map[self.browser_name]["message"], region="Row1_Col1")     
            time.sleep(0.2)
            if allow:
                for _ in range(browser_permission_map[self.browser_name]["tab_count_to_allow"]):
                    self.screen_util.press_key('tab')
                    time.sleep(0.2)
            else:
                for _ in range(browser_permission_map[self.browser_name]["tab_count_to_block"]):
                    self.screen_util.press_key('tab')
                    time.sleep(0.2)
            # Finally Press ENTER Key.
            self.screen_util.press_key('enter')
            time.sleep(1)
        # Re-verify & Return
        if self.screen_util.is_text_present(text=browser_permission_map[self.browser_name]["message"], region="Row1_Col1", fuzzy=True, threshold=90):
            print('🚦 Failed to resolve permission interactor. Permission box still open.')
            return False
        return True

    def set_permission(self, permission: Literal["clipboard-read"], allow=True) -> bool:
        script = """
await new Promise(res => setTimeout(res, 1000));
(async () => {
  try {
    // Step 1: Check current clipboard-read permission
    const permissionStatus = await navigator.permissions.query({ name: '__PERMISSION__' });
    console.log('Permission state:', permissionStatus.state);

    // Helper function to copy text to clipboard
    const copyToClipboard = async (text) => {
      try {
        navigator.clipboard.writeText(JSON.stringify({"hostname":window.location.hostname,"state":text}));
        console.log(`Copied to clipboard: "${text}"`);
      } catch (err) {
        console.error('Failed to write to clipboard:', err);
      }
    };

    if (permissionStatus.state === 'granted') {
      // Permission already granted, just copy the state
      await copyToClipboard(permissionStatus.state);
    } else {
      // Try reading clipboard to trigger prompt if state is 'prompt'
      try {
        await copyToClipboard(permissionStatus.state);
        const text = await navigator.clipboard.readText();
        console.log('Clipboard content read:', text);
      } catch (err) {
        console.warn('Could not read clipboard (permission may have been denied):', err);
      }
    }

    // Optional: listen for permission state changes
    permissionStatus.onchange = () => {
      console.log('Permission state changed to:', permissionStatus.state);
    };
  } catch (err) {
    console.error('Unexpected error:', err);
  }
})();
"""
        response: str = self.inject_and_get_clipboard(script.replace("__PERMISSION__", permission), timeout=1, endWait=0, null_result_allowed=False, max_retries=1)
        # print("Response received:", response)  # Debug the raw response
        if response == False:
            return False # Failed to inject and get clipboard response

        # Parse Jsonic response
        try: 
            response_dict: dict[Literal["hostname","state"],str] = json.loads(response)
        except json.JSONDecodeError as e: 
            print("Failed to parse JSON:", e)
            response_dict = {"hostname": "unknown", "state": "denied"}
        # Set Permission - Interaction
        if response_dict["state"] != "granted":
            time.sleep(1) # Wait for permission modal to open
            if not self.select_permission_interactor(hostname=response_dict["hostname"], allow=allow):
                print('🚫 Failed to set permission.')
                return False
        return True

    def enable_clipboard_read_permission(self) -> bool:
        return self.set_permission(permission="clipboard-read", allow=True)

    def delete_browser_data(self, 
        mode: Literal["basic", "advance", "on exit"], 
        time_range: Literal["Last 15 min", "Last hour", "Last 24 hours", "Last 7 days", "Last 4 weeks", "All time"] = "Last hour",
        checkbox_labels_map: dict[Literal['Browsing history', 'Download history', 'Cookies and other site data', 'Leo AI', 'Cached images and files', 'Passwords and other sign-in data', 'Autofill form data', 'Site and Shields Settings', 'Hosted app data'], bool]  | None = None,
        reset_labels_first: bool = False
    ) -> None:

        self.open_new_tab()
        pyperclip.copy("chrome://settings/clearBrowserData")
        pyautogui.hotkey("ctrl", "v") # Triggers paste warning
        time.sleep(1)
        pyautogui.press("enter")
        time.sleep(1.5)

        if self.browser_name == BrowserName.BRAVE:
            script = """
__IMPORT_FUNCTIONS__

/***********************************************
 *  Run Automation
 ***********************************************/
const tabs = deepQuerySelectorAll('[role="tab"]');
const selectTab = Array.from(tabs).find(el => el.innerText.trim() === '__TAB_NAME__');
safeClick(selectTab);
__SLEEP_200__

// Select Time Range
if ('__TAB_NAME__' === 'Basic' || '__TAB_NAME__' === 'Advanced') {
    selectDropdownValue('#clearBrowsingDataDialog #pages .selected .time-range-row #dropdownMenu', '__TIME_RANGE__');
    __SLEEP_100__
}

const reset_first = '__RESET_FIRST__';
if (reset_first == 'true') {
    const checkboxes = deepQuerySelectorAll(`#clearBrowsingDataDialog #pages .selected settings-checkbox`);
    for (const cb of checkboxes) {
        cb.checked = false;
        __SLEEP_100__
    }
}

const checkbox_map = __CHECKBOX_MAP__;
for (const [label, shouldEnable] of Object.entries(checkbox_map)) {
    setCheckbox('#clearBrowsingDataDialog #pages .selected settings-checkbox', label, shouldEnable);
    __SLEEP_100__
}

const submitBtn = deepQuerySelector("#clearBrowsingDataDialog #clearButton");
if (submitBtn && !submitBtn.disabled) {
    submitBtn.click();
    __SLEEP_100__
}
"""
        elif self.browser_name == BrowserName.CHROME:
            script = """
__IMPORT_FUNCTIONS__

/***********************************************
 *  Run Automation
 ***********************************************/

// ========================= Select Time Range ========================= 
const timelineRevealMoreBtn = deepQuerySelector('#moreButton');
if (timelineRevealMoreBtn) {
    timelineRevealMoreBtn.click();
}
__SLEEP_100__
// Get both NodeLists
const chips = deepQuerySelectorAll('.time-period-chip');
const menuItems = deepQuerySelectorAll(`[role-description="Menu"] .dropdown-item[role="menuitem"]`);

// Merge NodeLists → Array
const allItems = [...chips, ...menuItems];

// Value you want to match
const targetValue = "__TIME_RANGE__".toLowerCase().trim();

// Find and click the matching item
const match = allItems.find(el => {
    const text = el.textContent.trim().toLowerCase();
    return text.includes(targetValue);
});

if (match) {
    match.click();
    __SLEEP_200__
} else {
    console.warn("No matching element found for:", targetValue);
}

// ========================= Select Checkbox ========================= 
const showMoreLabels = deepQuerySelector(`#showMoreButton`);
if (showMoreLabels) {
    showMoreLabels.click();
    __SLEEP_200__
}
async function applyCheckboxMap(checkbox_map) {
    // List A: wrappers that contain labels
    const wrappers = deepQuerySelectorAll('#checkboxContainer settings-checkbox');

    // List B: actual <cr-checkbox> components in the same order
    const checkboxes = deepQuerySelectorAll('#checkboxContainer settings-checkbox cr-checkbox');

    // Exit if lists are mismatched
    const len = Math.min(wrappers.length, checkboxes.length);

    for (let i = 0; i < len; i++) {
        const wrapper = wrappers[i];
        const checkbox = checkboxes[i];

        const label = wrapper.innerText.trim();

        // -------- RESET ALL FIRST --------
        const reset_first = '__RESET_FIRST__';
        if (reset_first == 'true') {
            if (checkbox.hasAttribute('checked')) {
                checkbox.removeAttribute('checked');

                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        // -------- APPLY MAP --------
        if (checkbox_map.hasOwnProperty(label)) {
            const desired = checkbox_map[label];

            if (desired) {
                checkbox.setAttribute('checked', '');
            } else {
                checkbox.removeAttribute('checked');
            }

            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        }
        __SLEEP_100__
    }
}
const checkbox_map = __CHECKBOX_MAP__;
await applyCheckboxMap(checkbox_map);

// ========================= Submit ========================= 
__SLEEP_100__
const submitBtn = deepQuerySelector('#deleteButton');
if (submitBtn && !submitBtn.disabled) {
    submitBtn.click();
}
"""

        # Import JS Functions
        js_functions = import_js_functions(functions=["querySelector", "click", "setCheckbox", "dropdown"])
        # Imported Functions List: 
        # print('Added Functions:', js_functions.get("functions", []))
        imported_functions_script = js_functions.get("script", "")
        script = script.replace("__IMPORT_FUNCTIONS__", imported_functions_script)

        # Time
        script = sync_sleep(script)

        # Tab Switching
        if mode == "basic": mode = "Basic"
        elif mode == "advance": mode = "Advanced"
        elif mode == "on exit": mode = "On exit"
        else: raise ValueError("Invalid mode selected.")
        script = script.replace("__TAB_NAME__", mode)

        # Set Time Range
        script = script.replace('__TIME_RANGE__', time_range)

        # Checkbox
        script = script.replace('__RESET_FIRST__', 'true' if reset_labels_first else 'false')    
        if checkbox_labels_map is None:
            checkbox_labels_map = {}
        script = inject_dictionary(script, placeholder='__CHECKBOX_MAP__', dictionary=checkbox_labels_map)

        # === Inject Script ===
        prevVerifyDOMChangeOnToggle = self.verifyDOMChangeOnToggle
        self.verifyDOMChangeOnToggle = False
        self.inject_script(script, endWait=4)
        self.verifyDOMChangeOnToggle = prevVerifyDOMChangeOnToggle

        # === Close Tab ===
        self.close_tab()

    def site_details(self, url: str, delete_data: bool, reset_permission: bool) -> None:

        if not delete_data and not reset_permission:
            return

        self.open_url(url="chrome://settings/content/siteDetails?site=" + self.url_encode(url), endWait=1.5)
        pyperclip.copy("chrome://settings/content/siteDetails?site=" + self.url_encode(url))
        pyautogui.hotkey("ctrl", "v") # Triggers paste warning
        time.sleep(1)
        pyautogui.press("enter")
        time.sleep(1.5)

        script = """
__IMPORT_FUNCTIONS__

/***********************************************
 *  Run Automation
 ***********************************************/

(async () => {
    const settings = __SETTINGS__;

    if (settings.delete_data) {
        const deleteDataBtn = deepQuerySelector(`#clearStorage`);
        if (deleteDataBtn) {
            deleteDataBtn.click();
            __SLEEP_800__
        }
        const deleteDataConfirmationBtn = deepQuerySelector(`#confirmClearStorage .action-button`);
        if (deleteDataConfirmationBtn) {
            deleteDataConfirmationBtn.click();
            __SLEEP_200__
        }
    }

    if (settings.reset_permission) {
        const resetPermissionBtn = deepQuerySelector(`#resetSettingsButton`);
        if (resetPermissionBtn) {
            resetPermissionBtn.click();
            __SLEEP_800__
        }
        const resetPermissionConfirmationBtn = deepQuerySelector(`#confirmResetSettings .action-button`);
        if (resetPermissionConfirmationBtn) {
            resetPermissionConfirmationBtn.click();
            __SLEEP_200__
        }
    } 
})();
"""

        # Import JS Functions
        js_functions = import_js_functions(functions=["querySelector", "click"])
        # Imported Functions List: 
        # print('Added Functions:', js_functions.get("functions", []))
        imported_functions_script = js_functions.get("script", "")
        script = script.replace("__IMPORT_FUNCTIONS__", imported_functions_script)

        script = inject_dictionary(script, '__SETTINGS__', {"delete_data": delete_data, "reset_permission": reset_permission})
        script = sync_sleep(script)

        # === Inject Script ===
        prevVerifyDOMChangeOnToggle = self.verifyDOMChangeOnToggle
        self.verifyDOMChangeOnToggle = False
        self.inject_script(script, endWait=2.5)
        self.verifyDOMChangeOnToggle = prevVerifyDOMChangeOnToggle

        # === Close Tab ===
        self.close_tab()

    def grab_nth_link(self, n: int, partial_href: str = "") -> str:

        """
        The JS:
        - waits 2 seconds,
        - selects the n-th <a> with href starting with partial_href,
        - copies the link to clipboard,
        - logs success or failure.
        """

        if partial_href:
            escaped_href = partial_href.replace('\\', '\\\\').replace('"', '\\"')
            script = f"""
setTimeout(() => {{
const MATCH_PREFIX = "{escaped_href}";
const TARGET_INDEX = {n};

try {{
    const links = Array.from(document.querySelectorAll(`a[href^="${{MATCH_PREFIX}}"]`));
    
    if (links.length < TARGET_INDEX || TARGET_INDEX <= 0) {{
    console.warn(`No link found at index ${{TARGET_INDEX}}. Total matches: ${{links.length}}`);
    navigator.clipboard.writeText("");
    return;
    }}

    const link = links[TARGET_INDEX - 1];
    const href = link.href;

    navigator.clipboard.writeText(href)
    .then(() => {{
        console.log(`Copied link #${{TARGET_INDEX}} to clipboard:`, href);
    }})
    .catch(err => {{
        console.error("Clipboard copy failed:", err);
    }});
}} catch (err) {{
    console.error("Unexpected error during link extraction:", err);
    navigator.clipboard.writeText("");
}}
}}, 2000);
            """
        else:
            script = f"""
setTimeout(() => {{
const matches = [];

document.querySelectorAll('[data-async-context^="query:"] [jsaction^="trigger"] [data-ved]').forEach(el => {{
    const asyncContainer = el.closest('[data-async-context^="query:"]');
    const triggerContainer = el.closest('[jsaction^="trigger"]');

    if (!asyncContainer || !triggerContainer) return;

    const hasBlockingDataQ = [...asyncContainer.children].some(child => {{
    return (
        child.matches('[data-q]') &&
        child.compareDocumentPosition(triggerContainer) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    }});

    const insideDataQ = el.closest('[data-q]');

    if (!hasBlockingDataQ && !insideDataQ) {{
    matches.push(el);
    }}
}});

console.log(`✅ Final filtered result count: ${{matches.length}}`);

const n = {n-1};
const link = matches[n]?.href;
if (link) {{
    navigator.clipboard.writeText(link).then(() => {{
    console.log(`✅ Copied to clipboard: ${{link}}`);
    }}).catch(err => {{
    console.error("❌ Failed to copy to clipboard:", err);
    }});
}} else {{
    console.warn("⚠️ No match found at index", n);
}}
}}, 2000);
            """

        return self.inject_and_get_clipboard(js_code=script, timeout=2) # returns link
 
    def open_nth_result(self, n: int, partial_href: str = ""):

        """
        n -> 1-indexed
        partial_href -> more stable and promising if passed
        """

        if partial_href:
            script = f"""document.querySelectorAll('a[href^="{partial_href}"]')[{n-1}].click();"""
        else:
            script = f"""
(() => {{
const matches = [];

document.querySelectorAll('[data-async-context^="query:"] [jsaction^="trigger"] [data-ved]').forEach(el => {{
    const asyncContainer = el.closest('[data-async-context^="query:"]');
    const triggerContainer = el.closest('[jsaction^="trigger"]');

    if (!asyncContainer || !triggerContainer) return;

    const hasBlockingDataQ = [...asyncContainer.children].some(child => {{
    return (
        child.matches('[data-q]') &&
        (child.compareDocumentPosition(triggerContainer) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
    }});

    const insideDataQ = el.closest('[data-q]');

    if (!hasBlockingDataQ && !insideDataQ) {{
    matches.push(el);
    }}
}});

console.log(`✅ Final filtered result count: ${{matches.length}}`);

const index = {n - 1};
if (index < 0 || index >= matches.length) {{
    console.warn("⚠️ No match found at index", {n});
    return;
}}

const link = matches[index];
if (link) {{
    link.click();
    console.log(`✅ Clicked link #${{index + 1}} with href:`, link.href);
}} else {{
    console.warn("⚠️ Link element not found at index", {n});
}}
}})();
            """
        
        # Inject & Close console panel
        self.inject_script(script, closePanel=True)

if __name__ == "__main__":

    # browser = BrowserUtils()
    # browser.site_details("https://chatgpt.com", delete_data=True, reset_permission=False)
    # # browser.site_details("https://www.snapchat.com/", True, True)
    # # browser.delete_browser_data(mode="advance", time_range="Last hour", checkbox_labels_map={"Download history": True}, reset_labels_first=True)


    # Example usage:
    browser_utils = BrowserUtils(path="C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe")

    # Open Brave with "Private with Tor" mode and load a page dynamically
    url = "https://chatgpt.com"
    result = browser_utils.open_url_in_tor(url)

    if result:
        print(f"Successfully loaded {url}")
    else:
        print(f"Failed to load {url}")
