from app.services.shared import automation_controller
from config.env_config import USER_RESUMES_ROOT, USER_DATA_FILE, USE_TOR
from typing import Literal, List, TypedDict, Dict
import json
import time
from modules.utils.helpers import find_best_match
from pydantic import BaseModel
from enum import Enum
import pyautogui

# ------------------------
# Pydantic model for clues
# ------------------------
class ResumeMatchCluesModel(BaseModel):
    company_description: str | None = None
    role_description: str | None = None
    location: str | List[str] | None = None

    model_config = {
        "extra": "forbid",
        "populate_by_name": True
    }

    @property
    def has_job_desc(self) -> bool:
        return bool(self.role_description or self.company_description)

# ------------------------
# Pydantic model for output
# ------------------------
class ResumeResponseKey(str, Enum):
    CATEGORY = "category" 
    REGION = "region" 
    FILE_PATH = "file_path"

class ResumeMetaModel(BaseModel):
    category: str
    region: str
    file_path: str

    model_config = {
        "frozen": True,   # Make it immutable (intentional)
        "extra": "forbid"
    }

    def __getitem__(self, key: str):
        if key in self.__class__.model_fields:
            return getattr(self, key)
        raise KeyError(f"{key} is not a valid ResumeMetaModel field")

# ------------------------
# TypedDict for user input
# ------------------------
class ResumeMatchCluesDict(TypedDict, total=False):
    company_description: str
    role_description: str
    location: str | List[str]

# ------------------------
# Available LLM platforms
# ------------------------
class LLMMode(str, Enum):
    chatgpt = "chatgpt"

def stringify_location(location: str | List[str] | None) -> str:
    """
    Converts location input into a string.
    Preserves list structure if multiple locations are provided.
    """
    if not location:
        return ""

    if isinstance(location, list):
        return json.dumps([str(loc) for loc in location if loc], indent=4)

    return str(location)

def _build_resume_category_identification_prompt(clues: ResumeMatchCluesModel, available_categories: set[str]) -> list[dict[str, str]]:

    desc_block = ""

    if clues.role_description:
        desc_block += f"\nAbout Job Role:\n{clues.role_description}\n"
    if clues.company_description:
        desc_block += f"\nAbout Company:\n{clues.company_description}"

    prompts: list[dict[str, str]] = [
        {"system": f'''You are a classification assistant. Your task is to read the provided {"role and company's description" if clues.company_description and clues.role_description else "role description" if clues.role_description else "company description"} and identify the most relevant job role from the following list:

{"\n".join(f"• {cls}" for cls in sorted(available_categories))}

Return **only** a JSON object with one key `class` and the value being exactly one of the above classes.

If none of the classes clearly apply, return the default fallback class as "No Match".

Do not add any explanations or extra text. The output must be valid JSON.

Example output 1:
{{
  "class": < pick a best fit option >
}}

Example output 2:
{{
  "class": "No Match"
}}
'''},
        {"user": f'''Given the description, return the most relevant or suitable job class for it (selecting the best fit from available options). If none are suitable, simply return "No Match"

Description:

{desc_block}
'''}
    ]

    return prompts

def _build_resume_location_identification_prompt(clues: ResumeMatchCluesModel, available_regions: set[str]) -> list[dict[str, str]]:

    location_str = stringify_location(clues.location)

    prompts: list[dict[str, str]] = [
        {"system": f'''You are a classification assistant.

Your task is to select the **single most geographically closest and appropriate region**
from the list below, based on the provided location or set of locations.

When multiple locations are provided:
- Prefer the region that best fits all locations collectively.
- If multiple regions are equally suitable geographically, prefer the one
  most commonly associated with job opportunities.

Available regions:
{"\n".join(f"• {cls}" for cls in sorted(available_regions))}

Rules:
- Return ONLY a JSON object with one key `region`.
- The value must be exactly one of the listed regions.
- Do NOT add explanations or extra text.
- Output must be valid JSON.

Example output:
{{
"region": < pick nearest region >
}}
'''},
        {"user": f'''Given the following location(s), select the most appropriate region from the available options (I shared earlier).

Location: {location_str}

Must return **exactly one JSON object** appropriate to {"these locations" if isinstance(clues.location, list) and len(clues.location) > 1 else "this location"}.
Do NOT include disclaimers, prefaces, boilerplate, meta-writing, preamble/lead-in, instructional echo, self-referential commentary, epilogue, or closing niceties.
'''}
    ]

    return prompts

def _get_resume_chatgpt(clues: ResumeMatchCluesModel) -> ResumeMetaModel | None:
    """
    Determine the best fit resume using ChatGPT.
    """

    if not clues.has_job_desc:
        return None

    resume = dict()

    # Reload the JSON file (DB)
    with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
        user_data = json.load(f)

    # Job Role
    available_categories = {r['resumeCategory'] for r in user_data['resumes']}
    category_prompts = _build_resume_category_identification_prompt(clues, available_categories)
    # Convert prompts to ChatGPT input structure
    chain_of_prompts = [
        {"prompt": next(iter(p.values())), "timeout": 20} for p in category_prompts
    ]
    # Add schema to final prompt
    chain_of_prompts[-1]["prompt"] += """\n
response_format = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "class": { "type": "string" }
        },
        "required": ["class"]
    }
}
"""

    # Run promptChain
    response = automation_controller.chatgpt.promptChain(
        chain_of_prompts, 
        search_tor=USE_TOR, 
        search_incognito=True, 
        leave_session_opened = True, 
        enable_clipboard_permission_check = True if not automation_controller.chatgpt.is_session_already_open else False,
    )
    
    if response.success:
        response: list[str] = response.payload
        if len(response) == 1: # Convert string to dict
            response: dict | None = automation_controller.chatgpt.convert_jsonic_response_to_dict(response[0])
    
    time.sleep(0.5)
    pyautogui.press('f5')
    time.sleep(5)

    if response and isinstance(response, dict) and ('class' in response) and response['class'] != 'No Match':

        job_class = response['class']
        
        # Check if the category exists in the available categories
        if job_class not in available_categories:
            # Use the string match percentage to find the best match
            job_class = find_best_match(available_categories, job_class, threshold=90)
        
        # --- FURTHER REGION MATCHING ---
        # Find regions associated with the matched role category
        available_regions = {resume['resumeRegion'] for resume in user_data['resumes'] if resume['resumeCategory'] == job_class}
        region_prompts: list[dict[str, str]] = _build_resume_location_identification_prompt(clues, available_regions)
        # Convert prompts to ChatGPT input structure
        chain_of_prompts = [
            {"prompt": next(iter(p.values())), "timeout": 20} for p in region_prompts
        ]
        # Add schema to final prompt
        chain_of_prompts[-1]["prompt"] += """\n
response_format = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "region": { "type": "string" }
        },
        "required": ["region"]
    }
}
"""
        response = automation_controller.chatgpt.promptChain(
            chain_of_prompts, 
            search_tor=USE_TOR, 
            search_incognito=True, 
            leave_session_opened = True, 
            enable_clipboard_permission_check = True if not automation_controller.chatgpt.is_session_already_open else False,
        )
        if response.success:
            response: list[str] = response.payload
            if len(response) == 1:
                response: dict | None = automation_controller.chatgpt.convert_jsonic_response_to_dict(response[0])

        if response and isinstance(response, dict) and ('region' in response):

            match_region = response['region']

            # Check if the region exists in the available regions
            if match_region not in available_regions:
                # Use the string match percentage to find the best match
                match_region = find_best_match(available_regions, match_region, threshold=0)

            resume_path = next(resume["resumeStoredPath"] for resume in user_data['resumes'] if (resume['resumeCategory'] == job_class) and (resume['resumeRegion'] == match_region))

        else:
            resume_path = next(resume["resumeStoredPath"] for resume in user_data['resumes'] if (resume['resumeCategory'] == job_class))

        resume["category"] = job_class
        resume["region"] = match_region
        resume["file_path"] = resume_path

    else:
        # No resumes aligns with target campaign.
        if response and isinstance(response, dict) and ('class' in response) and response['class'] == 'No Match':
            # Process default resume
            default_resume: dict = user_data['resumes'][user_data["primaryResumeContainerIdx"]]
            resume["category"] = default_resume["resumeCategory"]
            resume["region"] = default_resume["resumeRegion"]
            resume["file_path"] = default_resume["resumeStoredPath"]
        # LLM returned bad result.
        else:
            return None
        
    return ResumeMetaModel.model_validate(resume)

def get_best_fit_resume(resume_match_clues: ResumeMatchCluesDict, llmMode: LLMMode = LLMMode.chatgpt, max_retry: int = 3, retry_delay: float = 10) -> ResumeMetaModel | None:
    
    '''
    Output: 
    {
        'category': 'Data Science',
        'region': 'San Francisco, California, United States of America',
        'file_path': '1762613777714222/Kalp Resume.pdf'
    }
    '''

    try:
        clues = ResumeMatchCluesModel.model_validate(resume_match_clues)
    except Exception:
        return None
    
    if not clues.has_job_desc:
        return None
    
    llm_fn = _get_resume_chatgpt

    for attempt in range(max_retry):
        if attempt > 0:
            time.sleep(retry_delay)

        result = llm_fn(clues)
        if result:
            return result

    return None


if __name__ == "__main__":

    # ----------------------
    # ----- GET RESUME -----
    # ----------------------
    best_resume: ResumeMetaModel | None = get_best_fit_resume(
        resume_match_clues = {
            "company_description": """Notable Health (often just “Notable”) is a healthcare-technology company based in San Mateo, Calif., that uses AI and intelligent automation to streamline administrative workflows in health systems. Their platform automates repetitive tasks like patient intake, scheduling, referrals, prior authorizations, documentation, and billing by leveraging technologies such as robotic process automation, natural language processing, and machine learning. ([Notable Health][1]) They also use large language models (like GPT) through their “Patient AI” engine to personalize patient engagement, closing care gaps and improving both efficiency and patient satisfaction. ([PR Newswire][2]) Notable claims rapid deployment (in as little as four weeks) and reports that health systems can save significant staff time, improve access, and reduce costs while enhancing the patient experience.""", 
            "role_description": None,
            "location": ["Santa Clara, CA, USA"]
        },
        llmMode="chatgpt",
        max_retry=3,
        retry_delay=10
    )
    print(best_resume if best_resume else "❌ Not Found: Unable to find the best fit resume")

    # -----------------------------------
    # ----- EXTRACT TEXT [Optional] -----
    # -----------------------------------
    # resume_text = extract_pdf_text(best_resume["full_path"]) # WindowsPath('D:/Kalp/.../Resume.pdf')
    # print(f"\n==============================================================\n{resume_text}")
