from config.env_config import USER_DATA_FILE, USE_TOR
from typing import List, Dict, Optional, Any, Tuple
import json

# ============================================================
# System Prompt (Injected Once)
# ============================================================

def get_system_prompt(job_details: Dict[str, Any]) -> str:
    system_prompt = f"""
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
"""
    
    main_fields = {
        "title": "Job Title",
        "description": "Job Description",
        "location": "Job Location",
    }

    if any(key in job_details for key in main_fields):
        system_prompt += """
---

=== [START] Job Details ===
"""

    # Add main sections
    for key, label in main_fields.items():
        if key in job_details:
            system_prompt += f"""
{label}:
{job_details[key]}
"""

    # Add other job details
    other_details = {
        k: v for k, v in job_details.items()
        if k not in main_fields
    }

    if other_details:
        system_prompt += """
Other Job Details:
"""
    for k, v in other_details.items():
        system_prompt += f"{k}: {v}\n"

    if any(key in job_details for key in main_fields):
        system_prompt += """
        
=== [END] Job Details ===

"""

    system_prompt += """
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
"""
        
    system_prompt += """
END OF SYSTEM PROMPT - Keep these rules, instructions, and information (all context) in mind for reference and future usage. Currently, do not respond to this.
"""

    return system_prompt.strip()

# ============================================================
# Context Prompt (Injected Once)
# ============================================================

def get_user_context_prompt(user_db: Dict[str, Any]) -> str:
    return f"""
You are now given the full user profile database.
This database is the PRIMARY source of truth.

User Profile Database:
{json.dumps(user_db, indent=2)}

END OF CONTEXT PROMPT — Keep this information (available user context) in mind along with system instructions for reference and future usage. Currently, do not respond to this.
""".strip()

# ============================================================
# Prompt Builders
# ============================================================
    
def _common_context(label: str, hints: List[str], db_snippets: Dict[str, Any]) -> str:
    shared_prompt = f"""
Question:

--- START OF QUESTION ---

{label}

--- END OF QUESTION ---
"""
    
    if hints:
        shared_prompt += f"""
Hints (may or may not be useful):
{json.dumps(hints or [], indent=2)}
"""
        
    if db_snippets:
        shared_prompt += f"""
Database information (may or may not be useful):
{json.dumps(db_snippets or {}, indent=2)}
"""
    
    return shared_prompt.strip()


def build_scalar_prompt(meta: Dict, db_snippets: Dict, supports_schema: bool = False) -> Tuple[str, Optional[Dict]]:
    
    def _get_scalar_schema() -> Dict:
        return {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "value": {"type": "string"}
                },
                "required": ["value"]
            }
        }


    scalar_prompt = f"""{_common_context(meta["labelText"], meta.get("hints"), db_snippets)}

You are answering a short single-line input field.

Rules:
• Output a single concise string
• No punctuation padding
• NEVER use markdown or link formatting - URLs must be plain text.
• No explanations
• Use database values if available, otherwise infer safely
"""
    
    if meta.get("required", True):
        scalar_prompt += """• This is a REQUIRED field — value must be a real, non-empty string (Empty string is NOT allowed)
"""

    scalar_prompt += f"""• Never return template-style, example-style, or instructional language
• Lookout provided system instructions, rules, information and user context for additional inference.
"""
    if not supports_schema:
        scalar_prompt += f"""
Response JSON schema:
response_format = {_get_scalar_schema()}

Response Format Example:
{{
  "value": "string"
}}

Return the most appropriate short and concise answer (strictly in JSON).
"""
    else:
        scalar_prompt += """
Return the most appropriate short and concise answer.
"""
    
    return scalar_prompt.strip(), _get_scalar_schema() if supports_schema else None


def build_textarea_prompt(meta: Dict, db_snippets: Dict, supports_schema: bool = False) -> Tuple[str, Optional[Dict]]:

    def _get_textarea_schema() -> Dict:
        return {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "value": {"type": "string"}
                },
                "required": ["value"]
            }
        }

    textarea_prompt = f"""{_common_context(meta["labelText"], meta.get("hints"), db_snippets)}

You are answering a long-form text question.

Rules:
• Be professional and ATS-safe
• Be concise but complete
• Avoid fluff and repetition
• Do not exceed 150 words (preferably 30-60 words) unless explicitly mentioned or required
• Prefer bullet-style sentences internally, but preferably output plain text
• Preferred answer would be realistic in nature as how I would give while answering this question (never as a template)
• Never return example-style, template-style, or instructional language
• NEVER use placeholders such as:
  "[your email]", "[phone number]", "[City]", "[State]", "[Country]", "XXX", "XYZ", "ABC", or similar
  it must be genuine, authentic, and realistic answer.
"""
    
    textarea_prompt += """• This is a REQUIRED question — response must not be empty
• You must provide a real, truthful answer even if brief
"""
    
    textarea_prompt += """• Lookout provided system instructions, rules, information and user context for additional inference.
"""

    if not supports_schema:
        textarea_prompt += f"""
Response JSON schema:
{_get_textarea_schema()}

Response Format Example:
{{
  "value": "string"
}}

Return the answer strictly in JSON.
"""
    else:
        textarea_prompt += """
Return the most appropriate long-form response not exceed 150 words (preferably 30-60 words).
Ensure the output matches the required JSON schema.
"""


    return textarea_prompt.strip(), _get_textarea_schema() if supports_schema else None


def build_single_choice_prompt(meta: Dict, db_snippets: Dict, supports_schema: bool = False) -> Tuple[str, Optional[Dict]]:
    
    def _get_single_choice_schema(options) -> Dict:
        return {
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

    options = meta.get("options", [])
    schema = _get_single_choice_schema(options)

    single_choice_prompt = f"""{_common_context(meta["labelText"], meta.get("hints"), db_snippets)}

You are selecting ONE option from a fixed list.

Rules:
• Select exactly one option from the provided list
• Match semantically, not lexically
• Never invent new values
• Prefer database-backed answers
• Must select at least one answer that increases my eligibility and hiring chance (incase actual context is missing in database).
• Lookout provided system instructions, rules, information and user context for additional inference.

Options:
{json.dumps(options, indent=2)}

Choose exactly ONE option from the list above.
The value must match exactly (case-sensitive).
"""

    if not supports_schema:
        single_choice_prompt += f"""

Response JSON schema:
{schema}

Example:
{{
  "value": "string"
}}

Return the answer strictly in JSON.
"""
    else:
        single_choice_prompt += """

Return the answer strictly in JSON.
"""

    return single_choice_prompt.strip(), schema if supports_schema else None


def build_multi_choice_prompt(meta: Dict, db_snippets: Dict, supports_schema: bool = False) -> Tuple[str, Optional[Dict]]:

    def _get_multi_choice_schema(meta: Dict) -> Dict:
        has_options = bool(meta.get("options"))

        items_schema = (
            {
                "type": "string",
                "enum": meta["options"]
            }
            if has_options
            else {
                "type": "string"
            }
        )

        return {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "values": {
                        "type": "array",
                        "items": items_schema
                    }
                },
                "required": ["values"]
            }
        }

    has_options = bool(meta.get("options"))
    options = meta.get("options", [])
    schema = _get_multi_choice_schema(meta)

    multi_choice_prompt = f"""
{_common_context(meta["labelText"], meta.get("hints"), db_snippets)}

{f"Options:\n{json.dumps(options, indent=2)}" if has_options else "No predefined options exist. Generate the most appropriate concise answer(s) that increase eligibility and hiring chance."}

Choose {"ONE" if meta.get("required", True) else "ZERO"} OR MORE options.

Rules:
• Return an array
• {"Every value must exist in the options list" if has_options else "Values may be inferred when no options are provided"}
• Infer from database if relevant context exists
• {"Return at least one answer in array" if meta.get("required", True) else "If none apply, return empty list"}
• Lookout provided system instructions, rules, information and user context for additional inference.
"""

    if not supports_schema:
        multi_choice_prompt += f"""

Response JSON schema:
{json.dumps(schema, indent=2)}

Example:
{{
  "values": ["string"]
}}

Return the answer strictly in JSON.
"""
    else:
        multi_choice_prompt += """

Return the answer strictly in JSON.
"""

    return multi_choice_prompt.strip(), schema if supports_schema else None


def build_date_prompt(meta: Dict, db_snippets: Dict, supports_schema: bool = False) -> Tuple[str, Optional[Dict]]:

    def _get_date_schema(meta: Dict) -> Dict:
        required = meta.get("required", True)

        return {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "value": {
                        "type": "string" if required else ["string", "null"],
                        "pattern": r"^\d{4}-\d{2}-\d{2}$"
                    }
                },
                "required": ["value"]
            }
        }

    required = meta.get("required", True)
    schema = _get_date_schema(meta)

    date_prompt = f"""
{_common_context(meta["labelText"], meta.get("hints"), db_snippets)}

You are answering a date input field.

Rules:
• Output ISO-8601 format: YYYY-MM-DD
• Use database date if available
• If only year/month known, infer day as 01
• If no cluse is available, {"return today's date" if required else "the value in JSON must be null"}
• Lookout provided system instructions, rules, information and user context for additional inference.
"""

    if not supports_schema:
        date_prompt += f"""

Response JSON schema:
{json.dumps(schema, indent=2)}

Example:
{{
  "value": "YYYY-MM-DD"
}}

Return the answer strictly in JSON.
"""
    else:
        date_prompt += """

Return the answer strictly in JSON.
"""

    return date_prompt.strip(), schema if supports_schema else None

# ============================================================
# Prompt Router
# ============================================================

def get_question_prompt(meta: Dict, db_snippets: Dict, supports_schema: bool = False) -> Tuple[str, Optional[Dict]]:
    q_type = meta["type"]

    # ============================================================
    # Question Type Groups
    # ============================================================

    SCALAR_TYPES = {"text", "email", "number", "tel", "url", "search", "password"}

    TEXTAREA_TYPES = {"textarea"}

    SINGLE_CHOICE_TYPES = {"radio", "select", "dropdown"}

    MULTI_CHOICE_TYPES = {"checkbox", "multiselect"}

    DATE_TYPES = {"date"}

    # ============================================================
    # Prompt Dispatch
    # ============================================================

    if q_type in SCALAR_TYPES:
        return build_scalar_prompt(meta, db_snippets, supports_schema)

    if q_type in TEXTAREA_TYPES:
        return build_textarea_prompt(meta, db_snippets, supports_schema)

    if q_type in SINGLE_CHOICE_TYPES:
        return build_single_choice_prompt(meta, db_snippets, supports_schema)

    if q_type in MULTI_CHOICE_TYPES:
        return build_multi_choice_prompt(meta, db_snippets, supports_schema)

    if q_type in DATE_TYPES:
        return build_date_prompt(meta, db_snippets, supports_schema)

    raise ValueError(f"❌ Unsupported question type: {q_type}")
