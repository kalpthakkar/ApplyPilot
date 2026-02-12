from typing import List, Dict, Optional, Any
import re
import json
from config.env_config import USER_DATA_FILE
from modules.utils.helpers import safe_load_json

def _parse_path(path: str) -> list:
    """
    Convert:
      "a.b[0].c" → ["a", "b", 0, "c"]
      "work[experience][0].title" → ["work", "experience", 0, "title"]
    """
    if not isinstance(path, str):
        raise TypeError("Path must be a string")

    # Convert bracket notation to dot notation
    # e.g. a[b][0].c → a.b.0.c
    _PATH_REGEX = re.compile(r"\[(.*?)\]")
    normalized = _PATH_REGEX.sub(lambda m: f".{m.group(1)}", path)

    parts = []
    for part in normalized.split("."):
        if not part:
            continue
        if part.isdigit():
            parts.append(int(part))
        else:
            parts.append(part)

    return parts

def resolve_nested_key( obj: Dict[str, Any], path: str, *, fallback: Optional[Any] = None, value: Optional[Any] = None ) -> Any:
    """
    Universal helper to GET or SET deeply nested values.

    Supports:
      - Dot + bracket notation: "a.b[0].c"
      - Dynamic indices
      - Safe GET with fallback
      - Optional SET mode (disabled by default in your pipeline)

    Args:
        obj: Root dictionary
        path: Path string
        fallback: Returned if GET fails
        value: If provided → SET mode

    Returns:
        Resolved value (GET) or assigned value (SET)
    """
    keys = _parse_path(path)
    acc = obj

    for i, key in enumerate(keys):
        is_last = i == len(keys) - 1
        next_key = keys[i + 1] if not is_last else None

        # Broken path → GET fallback
        if acc is None:
            return fallback

        # ---------- SET MODE ----------
        if value is not None and is_last:
            if isinstance(acc, (dict, list)):
                try:
                    acc[key] = value
                except Exception:
                    return fallback
            return value

        # ---------- TRAVERSAL ----------
        try:
            if isinstance(acc, list) and isinstance(key, int):
                acc = acc[key]
            elif isinstance(acc, dict):
                acc = acc.get(key)
            else:
                return fallback
        except (KeyError, IndexError, TypeError):
            return fallback

    return acc if acc is not None else fallback

def delete_nested_key(obj: Dict[str, Any], path: str) -> None:
    """
    Safely delete a deeply nested key using dot + bracket notation.

    Examples:
      delete_nested_key(db, "profile_html_card")
      delete_nested_key(db, "resumes.resumeStoredPath")
      delete_nested_key(db, "addresses[0].postalCode")

    Behavior:
      • Dict key → removed
      • List index → replaced with None (preserves indices)
      • Missing path → no-op
    """
    keys = _parse_path(path)
    acc = obj

    for i, key in enumerate(keys):
        is_last = i == len(keys) - 1

        if acc is None:
            return

        if is_last:
            try:
                if isinstance(acc, dict):
                    acc.pop(key, None)
                elif isinstance(acc, list) and isinstance(key, int):
                    acc[key] = None
            except Exception:
                pass
            return

        try:
            if isinstance(acc, list) and isinstance(key, int):
                acc = acc[key]
            elif isinstance(acc, dict):
                acc = acc.get(key)
            else:
                return
        except Exception:
            return

def get_user_db() -> Dict[str, Any]:

    with open(USER_DATA_FILE, "r", encoding="utf-8") as f:
        user_db: Dict[str, Any] = json.load(f)

    DROP_PATHS = [
        "password",
        "secondaryPassword",
        "profile_html_card",
        "addresses",
        "primaryAddressContainerIdx",
        "llmAddressSelectionEnabled",
        "resumes",
        "primaryResumeContainerIdx",
        "llmResumeSelectionEnabled",
        "enabledUserSkillsSelection",
        "enabledJobSkillsSelection",
        "enabledRelatedSkillsSelection",
        "useSalaryRange",
    ]

    for path in DROP_PATHS:
        delete_nested_key(user_db, path)

    return user_db

def extract_db_snippets(user_db: Dict, keys: List[str]) -> Dict[str, Any]:
    snippets = {}

    for key in keys or []:
        try:
            # You already have similar logic elsewhere
            value = resolve_nested_key(user_db, key)
            snippets[key] = value
        except Exception:
            continue

    return snippets

def filter_and_normalize(value):
    if value is None:
        return None

    if isinstance(value, str):
        if value == "string":
            return ""

        if "http" in value and "username" in value:
            return ""

    return value

def get_normalized_value(value: str | list) -> str | list:

    CHAR_NORMALIZATION_TABLE  = str.maketrans({
        '—': '-',
        '–': '-',
        '’': "'",
        '“': '"',
        '”': '"'
    })

    def get_normalized_string(value: str) -> str:
        return value.translate(CHAR_NORMALIZATION_TABLE)
    def get_normalized_list(value: list) -> list:
        return [str(val).translate(CHAR_NORMALIZATION_TABLE) for val in value]
    
    if isinstance(value,str):
        return get_normalized_string(value) 
    elif isinstance(value,list):
        return get_normalized_list(value)
    else:
        raise TypeError(f"Invalid Argument of type {type(value)} to normalize. Value: {value}")

def convert_jsonic_response_to_dict(response: str) -> dict | None:
    
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


def get_parsed_response(raw_response):

    if isinstance(raw_response, dict):
        parsed: dict = raw_response
    else:
        parsed: dict | None = convert_jsonic_response_to_dict(raw_response)

    if parsed is None:
        return None

    # Get value
    value = None

    # if isinstance(parsed, dict) and len(parsed) == 1:
    #     value = parsed[list(parsed.keys())[0]]
    if isinstance(parsed, dict):
        value = next(iter(parsed.values()), None)

    # Translate
    value = get_normalized_value(value)

    # Filter and Normalize:
    value = filter_and_normalize(value)

    return value