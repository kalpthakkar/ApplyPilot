# server\app\services\question_resolver\browser_question_resolver.py

from app.services.shared import automation_controller
from config.env_config import USE_TOR
from app.services.question_resolver.prompts.prompt_store import (
    # Base Prompts
    get_system_prompt, 
    get_user_context_prompt,
    # Question Type Specific Prompts
    get_question_prompt
)
from app.services.question_resolver.utils import (
    extract_db_snippets, 
    get_user_db, 
    get_parsed_response
)
from typing import List, Dict, Optional, Any
import json
import time

# ============================================================
# Prompt Chain Builder
# ============================================================

def build_prompt_chain( user_db: Dict[str, Any], job_details: Dict[str, Any], questions: List[Dict[str, Any]], add_system_prompt: bool = True, add_context_prompt: bool = True ) -> List[Dict[str, Any]]:

    prompts = []

    # 1️⃣ System Prompt — Job Context
    if add_system_prompt:
        prompts.append({ "prompt": get_system_prompt(job_details), "copy": False, "timeout": 60 })

    # 2️⃣ Context Prompt — User DB
    if add_context_prompt:
        prompts.append({ "prompt": get_user_context_prompt(user_db), "copy": False, "timeout": 60 })

    # 3️⃣ Question Prompts
    for question in questions:
        try:
            db_snippets = extract_db_snippets( user_db, question.get("relevantDBKeys", []) )
        except:
            db_snippets = {}
        
        prompts.append({ "prompt": get_question_prompt(question, db_snippets, supports_schema=False)[0], "copy": True, "remove_unicode_punctuation": True, "timeout": 30 })

    return prompts


# ============================================================
# Question Resolver (MAIN)
# ============================================================

def resolve_questions(questions: List[Dict[str, Any]], job_details: Dict[str, str | List[str] | None], max_retries: int = 2 ) -> List[Optional[Dict[str, Any]]]:

    '''

    questions --> List[QuestionDict]

    QuestionDict:
     {
        questionId: qId,
        labelText: question.labelText || "",
        type: question.type,
        required: question.required,
        options: options,
        hints: hints,
        relevantDBKeys: relevantDBKeys,
        reason: reason
    })
	
		
    '''
    print("\n[Question Resolver - Browser] 🚀 Starting LLM Question Resolution")

    user_db: Dict[str, Any] = get_user_db()

    # Initialize final results as a list of dicts with questionId keys
    final_results: List[Dict[str, Any]] = [{"questionId": q["questionId"], "response": None} for q in questions]

    base_prompts_required = False if (
        automation_controller.chatgpt.is_session_already_open 
        and automation_controller.last_active_service == 'resolve-questions-with-llm'
    ) else True

    if not automation_controller.open_llm_session('resolve-questions-with-llm'):
        print("[Question Resolver - Browser] ⚠️ Error Opening LLM Session")
        print(f"[Question Resolver - Browser] 💡 Returning Answers: 0 resolved / {len(questions)}\n")
        return final_results

    # Track unresolved questions
    remaining = list(enumerate(questions))
    attempt = 0
    while remaining and attempt <= max_retries:
        attempt += 1

        print(f"[Question Resolver - Browser] 🔁 LLM attempt {attempt} — resolving {len(remaining)} question(s)")

        if remaining:
            indices, retry_questions = zip(*remaining)
        else:
            break

        if (
            base_prompts_required == False
            and attempt > 1 
            and automation_controller.chatgpt.reset_occured
        ):
            base_prompts_required = True

        # ============================================================
        # Build Prompt Chain
        # ============================================================

        prompts = build_prompt_chain( 
            user_db = user_db, 
            job_details = job_details, 
            questions = list(retry_questions),
            add_system_prompt = True if base_prompts_required else False,
            add_context_prompt = True if base_prompts_required else False
        )
        

        # ============================================================
        # Invoke LLM
        # ============================================================
        response = automation_controller.chatgpt.promptChain( 
            prompts, 
            search_tor = USE_TOR, 
            search_incognito = True, 
            leave_session_opened = True, 
            enable_clipboard_permission_check = True if (
                not automation_controller.chatgpt.is_session_already_open 
                or automation_controller.chatgpt.reset_occured
            ) else False,
            allow_retry = False 
        )

        # ------------------------------------------------------------
        # Hard failure → retry everything
        # ------------------------------------------------------------
        if not response.success:
            print("[Question Resolver - Browser] ⚠️ promptChain failed — retrying remaining questions")
            time.sleep(1)
            continue

        # ============================================================
        # Parse Response
        # ============================================================

        # ------------------------------------------------------------
        # Parse question responses only
        # ------------------------------------------------------------
        payload = response.payload  # contains only copied prompts

        # ---------- SAFETY CHECK ----------
        if len(payload) != len(indices):
            print(f"[Question Resolver - Browser] ⚠️ Payload length mismatch: expected {len(indices)}, got {len(payload)}")
            time.sleep(1)
            continue

        new_remaining = []

        # Parse each response
        for idx, raw in zip(indices, payload):
            try:
                # Set value
                final_results[idx]["response"] = get_parsed_response(raw)
            except Exception as e:
                print(f"[Question Resolver - Browser] ❌ Parsing failed for questionId {questions[idx]["questionId"]}: {e}")
                print(f"[Question Resolver - Browser] Raw response: {raw}") # optional, useful for debugging/retrying
                new_remaining.append((idx, questions[idx]))   # retry only failed questions

        remaining = new_remaining

        if remaining:
            print(f"[Question Resolver - Browser] ⚠️ {len(remaining)} question(s) failed parsing — retrying")
            time.sleep(1)

    # ------------------------------------------------------------
    # Any still unresolved → None
    # ------------------------------------------------------------
    if remaining:
        print(f"[Question Resolver - Browser] ❌ {len(remaining)} question(s) failed after retries")

    
    print(f"[Question Resolver - Browser] 💡 Returning Answers: {len(questions) - len(remaining)} resolved / {len(questions)}\n")
    return final_results



if __name__ == "__main__":

    # ============================================================
    # Test Harness for LLM Question Resolution
    # ============================================================

    print("\n[Question Resolver - Browser] 🚀 Starting LLM Question Resolution Test\n")

    import pprint

    # -------------------------
    # Mock User DB
    # -------------------------
    user_db = {
        "email": "kalp@example.com",
        "username": "kalp123",
        "firstName": "Kalp",
        "lastName": "Thakkar",
        "birthDate": "1997-08-15",
        "linkedin": "https://linkedin.com/in/kalpthakkar",
        "skills": ["Python", "Machine Learning", "React"],
        "workExperiences": [
            {
                "jobTitle": "Software Engineer",
                "company": "TechCorp",
                "startDate": "2022-01-01",
                "endDate": "2023-12-31",
                "roleDescription": "Developed backend services"
            }
        ]
    }

    # -------------------------
    # Mock Job Details
    # -------------------------
    job_details = {
        "title": "Full-Stack Developer",
        "description": "Build web applications using React and Python.",
        "jobURL": "https://example.com/jobs/fullstack",
        "location": "Orlando, FL"
    }

    # -------------------------
    # Mock Questions
    # -------------------------
    questions_pass_1 = [
        {
            "questionId": "q1",
            "labelText": "What is your first name?",
            "type": "text",
            "relevantDBKeys": ["firstName"]
        },
        {
            "questionId": "q2",
            "labelText": "What is your email address?",
            "type": "email",
            "relevantDBKeys": ["email"]
        },
        {
            "questionId": "q3",
            "labelText": "Select your primary skill",
            "type": "select",
            "options": ["Python", "Java", "C++", "JavaScript"],
            "relevantDBKeys": ["skills"]
        },
        {
            "questionId": "q4",
            "labelText": "Describe your recent work experience",
            "hints": ["I got research experience"],
            "type": "textarea",
            "relevantDBKeys": ["workExperiences"]
        }
    ]

    questions_pass_2 = [
        {
            "questionId": "q4",
            "labelText": "Describe your recent work experience",
            "hints": ["I got research experience"],
            "type": "textarea",
            "relevantDBKeys": ["workExperiences"]
        }
    ]

    # -------------------------
    # Resolve Questions with LLM
    # -------------------------
    results = resolve_questions('dummy_session', questions_pass_1, job_details)
    # -------------------------
    # Pretty-print results
    # -------------------------
    print("\n===== LLM Responses =====")
    for res in results:
        question_id = res["questionId"]
        response = res["response"]
        print(f"\nQuestionId: {question_id}")
        pprint.pprint(response)


    print("Dummy action 6 seconds... (waiting)")
    time.sleep(6)


    # -------------------------
    # Resolve Questions with LLM
    # -------------------------
    results = resolve_questions('dummy_session', questions_pass_2, job_details)
    # -------------------------
    # Pretty-print results
    # -------------------------
    print("\n===== LLM Responses =====")
    for res in results:
        question_id = res["questionId"]
        response = res["response"]
        print(f"\nQuestionId: {question_id}")
        pprint.pprint(response)

    
    print("Dummy action 6 seconds... (waiting)")
    time.sleep(6)

    print("\n🎯 Test Completed\n")






    